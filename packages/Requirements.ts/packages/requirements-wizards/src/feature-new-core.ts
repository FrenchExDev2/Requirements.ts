/**
 * Feature wizard core — pure, injectable, zero I/O.
 *
 * Stream A deliverable. Drives the interactive `requirements feature new`
 * flow by asking a Prompt port (clack in prod, scripted mock in tests) a
 * structured sequence of questions and returning a validated `FeatureSpec`.
 *
 * Design rules:
 *   - No direct clack / readline import — only the Prompt port.
 *   - No fs / path — the shell writes the spec to disk.
 *   - Pure: same input answers → same output spec.
 *   - Parses with smart constructors (`featureId`, `acName`); invalid input
 *     is re-asked, never silently corrected.
 */

import { Priority, TestLevel } from '@frenchexdev2/requirements-core';
import type { Prompt, PromptChoice } from '@frenchexdev2/requirements-core/ports';
import type { RequirementStyle } from '@frenchexdev2/requirements-core';
import {
  AC_NAME_PATTERN,
  FEATURE_ID_PATTERN,
  SCHEMA_VERSION,
  acName,
  featureId,
  type AcName,
  type AcSpec,
  type FeatureId,
  type FeatureSpec,
  type RequirementId,
} from '@frenchexdev2/requirements-core/types';

// ── Context & options ───────────────────────────────────────────────────────

export interface FeatureWizardContext {
  readonly prompt: Prompt;
  readonly style: RequirementStyle;
  readonly existingFeatureIds: readonly FeatureId[];
  readonly existingRequirementIds: readonly RequirementId[];
}

export interface FeatureWizardOptions {
  readonly yes?: boolean;
  readonly noTest?: boolean;
  readonly template?: string;
}

// ── Public entry point ──────────────────────────────────────────────────────

/**
 * Run the interactive Feature-creation wizard.
 *
 * @param ctx      Injected prompt port, style, autocompletion pools.
 * @param seed     Optional `FeatureSpec` used for replay (defaults everywhere).
 * @param options  `yes` → non-interactive (requires `seed`);
 *                 `template` → pre-fill defaults from a style template.
 */
export async function runFeatureWizard(
  ctx: FeatureWizardContext,
  seed?: FeatureSpec,
  options?: FeatureWizardOptions,
): Promise<FeatureSpec> {
  const opts = options ?? {};

  // ── Template pre-fill ──
  const templateDefaults = resolveTemplateDefaults(ctx.style, opts.template);

  // ── Yes mode: validate & return the seed unchanged ──
  if (opts.yes) {
    if (!seed) {
      throw new Error('--yes requires a --replay seed spec');
    }
    assertValidSpec(ctx.style, seed);
    return finalizeSpec(seed);
  }

  const { prompt } = ctx;

  // ── 1. Feature ID ──
  const idRaw = await prompt.text('Feature ID (UPPERCASE-WITH-HYPHENS)', {
    default: seed?.id,
    validate: (s) =>
      FEATURE_ID_PATTERN.test(s)
        ? undefined
        : `must match ${FEATURE_ID_PATTERN}`,
  });
  const id = featureId(idRaw);

  // ── 2. Title ──
  const title = await prompt.text('Title', {
    default: seed?.title,
    validate: (s) => (s.trim().length > 0 ? undefined : 'title cannot be empty'),
  });

  // ── 3. Priority ──
  const priorityChoices: readonly PromptChoice<Priority>[] = [
    { value: Priority.Critical, label: 'Critical' },
    { value: Priority.High,     label: 'High' },
    { value: Priority.Medium,   label: 'Medium' },
    { value: Priority.Low,      label: 'Low' },
  ];
  const priorityDefault =
    seed?.priority ??
    mapTemplatePriority(templateDefaults?.priority) ??
    Priority.High;
  const priority = await prompt.select('Priority', priorityChoices, priorityDefault);

  // ── 4. Replay per-AC keep/edit/delete ──
  const acs: AcSpec[] = [];
  if (seed) {
    for (const ac of seed.acs) {
      const action = await prompt.select<'keep' | 'edit' | 'delete'>(
        `AC '${ac.name}': keep, edit, or delete?`,
        [
          { value: 'keep',   label: 'Keep unchanged' },
          { value: 'edit',   label: 'Edit name / levels' },
          { value: 'delete', label: 'Delete' },
        ],
        'keep',
      );
      if (action === 'keep') {
        acs.push(ac);
      } else if (action === 'edit') {
        const edited = await askAc(prompt, ac);
        acs.push(edited);
      }
      // 'delete' → drop
    }
  }

  // ── 5. Loop new ACs until user finishes ──
  while (true) {
    const more = await prompt.confirm('Add another AC?', acs.length === 0);
    if (!more) break;
    const ac = await askAc(prompt);
    acs.push(ac);
  }

  // ── 6. Cross-link: which Requirements does this Feature satisfy? ──
  let satisfies: readonly RequirementId[] | undefined;
  if (ctx.existingRequirementIds.length > 0) {
    const choices: readonly PromptChoice<string>[] = ctx.existingRequirementIds.map(
      (rid) => ({ value: rid, label: rid }),
    );
    const picked = await prompt.multiselect<string>(
      'Which Requirements does this Feature satisfy?',
      choices,
      seed?.satisfies ?? [],
    );
    satisfies = picked.length > 0 ? (picked as readonly RequirementId[]) : undefined;
  } else {
    satisfies = seed?.satisfies;
  }

  // ── 7. Confirm summary ──
  prompt.note(renderSummary({ id, title, priority, acs, satisfies }), 'Feature spec');
  const go = await prompt.confirm('Create this Feature?', true);
  if (!go) {
    throw new Error('Wizard cancelled by user');
  }

  const spec: FeatureSpec = finalizeSpec({
    $schemaVersion: SCHEMA_VERSION,
    kind: 'feature',
    id,
    title,
    priority,
    acs,
    ...(satisfies ? { satisfies } : {}),
  });

  assertValidSpec(ctx.style, spec);
  return spec;
}

// ── AC sub-prompt ───────────────────────────────────────────────────────────

// Derive choices from the enum so adding a TestLevel automatically adds the prompt option.
// Side effect: TestLevel.Internationalization is now offered (was missing in the hard-coded list).
const EXPECT_CHOICES: readonly PromptChoice<TestLevel>[] =
  (Object.values(TestLevel) as TestLevel[]).map((v) => ({ value: v, label: v }));

async function askAc(prompt: Prompt, seed?: AcSpec): Promise<AcSpec> {
  // Name — validated by pattern, loop on invalid
  const nameRaw = await prompt.text('  AC name (camelCase verb)', {
    default: seed?.name,
    validate: (s) =>
      AC_NAME_PATTERN.test(s)
        ? undefined
        : `must be camelCase matching ${AC_NAME_PATTERN}`,
  });
  const name = acName(nameRaw) as AcName;

  // Expected test levels — must be non-empty; re-ask until so.
  let expects: readonly TestLevel[] = [];
  while (expects.length === 0) {
    const picked = await prompt.multiselect<TestLevel>(
      '  Expected test levels',
      EXPECT_CHOICES,
      seed?.expects ?? [TestLevel.Unit],
    );
    if (picked.length === 0) {
      prompt.note('At least one test level is required.', 'Invalid');
      continue;
    }
    expects = picked;
  }

  return { name, expects };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveTemplateDefaults(
  style: RequirementStyle,
  templateId: string | undefined,
): { readonly priority?: string } | undefined {
  if (!templateId) return undefined;
  const tpl = style.templates.findTemplate(templateId);
  if (!tpl) {
    throw new Error(`Template not found: '${templateId}'`);
  }
  return { priority: tpl.skeleton.priority };
}

function mapTemplatePriority(p: string | undefined): Priority | undefined {
  if (!p) return undefined;
  const lower = p.toLowerCase();
  switch (lower) {
    case 'critical': return Priority.Critical;
    case 'high':     return Priority.High;
    case 'medium':   return Priority.Medium;
    case 'low':      return Priority.Low;
    default:         return undefined;
  }
}

function assertValidSpec(style: RequirementStyle, spec: FeatureSpec): void {
  const check = style.validators.validateSpec(spec);
  if (!check.ok) {
    const msg = check.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new Error(`Invalid FeatureSpec: ${msg}`);
  }
  if (spec.acs.length === 0) {
    throw new Error('Invalid FeatureSpec: at least one AC is required');
  }
  for (const ac of spec.acs) {
    if (ac.expects.length === 0) {
      throw new Error(`Invalid FeatureSpec: AC '${ac.name}' must declare at least one expected test level`);
    }
  }
}

function finalizeSpec(spec: FeatureSpec): FeatureSpec {
  return {
    ...spec,
    $schemaVersion: SCHEMA_VERSION,
    $schema: spec.$schema ?? './feature-spec.schema.json',
    kind: 'feature',
  };
}

function renderSummary(s: {
  id: FeatureId;
  title: string;
  priority: Priority;
  acs: readonly AcSpec[];
  satisfies?: readonly RequirementId[];
}): string {
  const lines: string[] = [];
  lines.push(`${s.id}  ${s.title}`);
  lines.push(`priority: ${s.priority}`);
  if (s.satisfies && s.satisfies.length > 0) {
    lines.push(`satisfies: ${s.satisfies.join(', ')}`);
  }
  lines.push(`ACs (${s.acs.length}):`);
  for (const ac of s.acs) {
    lines.push(`  - ${ac.name} [${ac.expects.join(', ')}]`);
  }
  return lines.join('\n');
}
