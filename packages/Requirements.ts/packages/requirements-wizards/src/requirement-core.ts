/**
 * Requirement wizard core — pure, injectable, zero I/O.
 *
 * Stream F deliverable. Drives the interactive `requirements requirement new`
 * flow and exposes decorator-registry queries used by `requirement list`,
 * `requirement show`, `requirement orphan`, `trace chain`, and the
 * `compliance --strict` gate.
 *
 * Design rules:
 *   - No direct clack / readline / fs import — only the Prompt port.
 *   - Pure: same input answers → same RequirementSpec.
 *   - Parses with smart constructors; invalid input is re-asked, not coerced.
 *
 * Satisfies:
 *   REQ-DSL-COMPLETE (primary), REQ-VOCAB-INDUSTRY-ALIGNED (primary),
 *   REQ-SPEC-IS-SOURCE-OF-TRUTH (joint), REQ-TUI-MODERN (joint),
 *   REQ-PARALLEL-DELIVERABLE (joint), REQ-DOG-FOOD (joint).
 */

import { Priority } from '@frenchexdev2/requirements-core';
import type { Prompt, PromptChoice } from '@frenchexdev2/requirements-core/ports';
import type { RequirementStyle } from '@frenchexdev2/requirements-core';
import {
  REQUIREMENT_ID_PATTERN,
  SCHEMA_VERSION,
  isoDate,
  percentage,
  requirementId,
  sentence,
  type AcName,
  type EarsStatement,
  type Evidence,
  type FeatureId,
  type FeatureSpec,
  type FitCriterion,
  type Rationale,
  type RequirementId,
  type RequirementKind,
  type RequirementSource,
  type RequirementSpec,
  type Risk,
  type TracedTo,
  type VerificationMethod,
} from '@frenchexdev2/requirements-core/types';
import { getSatisfactionLinks, getRequirementRegistry } from '@frenchexdev2/requirements-core';

// ══════════════════════════════════════════════════════════════════════════════
// Public context + options
// ══════════════════════════════════════════════════════════════════════════════

export interface RequirementWizardContext {
  readonly prompt: Prompt;
  readonly style: RequirementStyle;
  readonly existingFeatureIds: readonly FeatureId[];
  readonly existingRequirementIds: readonly RequirementId[];
}

export interface RequirementWizardOptions {
  readonly yes?: boolean;
  readonly template?: string;
  readonly fromFeature?: FeatureSpec;
}

// ══════════════════════════════════════════════════════════════════════════════
// seedFromFeature — `requirement new --from-feature <FEAT-ID>`
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Pre-fill a RequirementSpec from an existing Feature. Derives a REQ id from
 * the Feature id, cites the feature as a domain-knowledge source, and leaves
 * structural fields with safe minimal defaults the wizard will revisit.
 */
export function seedFromFeature(feature: FeatureSpec): RequirementSpec {
  const derivedId = requirementId(`REQ-${feature.id}`);
  const statement: EarsStatement = {
    pattern: 'ubiquitous',
    response: sentence(`The system shall satisfy ${feature.title}.`),
  };
  const source: RequirementSource = {
    type: 'domain-knowledge',
    reference: `derived-from-feature:${feature.id}`,
  };
  const rationale: Rationale = {
    claim: sentence(`Derived from existing Feature ${feature.id}.`),
    kind: 'precedent',
    evidence: [],
  };
  const fitCriteria: readonly FitCriterion[] = [
    { kind: 'narrative', text: sentence(`Feature ${feature.id} ACs all pass.`) },
  ];
  const risk: Risk = { level: 'Medium', ifNotMet: sentence('Feature value not delivered.') };

  return {
    $schemaVersion: SCHEMA_VERSION,
    $schema: './requirement-spec.schema.json',
    kind: 'requirement',
    id: derivedId,
    title: feature.title,
    statement,
    requirementKind: 'Functional',
    priority: feature.priority,
    status: 'Draft',
    source,
    rationale,
    fitCriteria,
    verificationMethod: 'Test',
    risk,
    satisfiedBy: [feature.id],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Wizard — 19 ordered steps
// ══════════════════════════════════════════════════════════════════════════════

export async function runRequirementWizard(
  ctx: RequirementWizardContext,
  seed?: RequirementSpec,
  options?: RequirementWizardOptions,
): Promise<RequirementSpec> {
  const opts = options ?? {};

  // --from-feature override seeds the seed itself (overrides any passed seed)
  const effectiveSeed: RequirementSpec | undefined =
    opts.fromFeature ? seedFromFeature(opts.fromFeature) : seed;

  // Template pre-fill
  const tpl = resolveTemplate(ctx.style, opts.template);

  // Yes mode: validate and return the seed untouched
  if (opts.yes) {
    if (!effectiveSeed) throw new Error('--yes requires a --replay seed spec');
    assertValidSpec(ctx.style, effectiveSeed);
    return finalize(effectiveSeed);
  }

  const { prompt, style } = ctx;

  // 1. id
  const idRaw = await prompt.text('Requirement ID (REQ-<DOMAIN>-<NUMBER>)', {
    default: effectiveSeed?.id,
    validate: (s) =>
      REQUIREMENT_ID_PATTERN.test(s) ? undefined : `must match ${REQUIREMENT_ID_PATTERN}`,
  });
  const id = requirementId(idRaw);

  // 2. title
  const title = await prompt.text('Title', {
    default: effectiveSeed?.title,
    validate: (s) => (s.trim().length > 0 ? undefined : 'title cannot be empty'),
  });

  // 3. kind
  const kindChoices: readonly PromptChoice<string>[] =
    style.vocabulary.requirementKinds.map((k) => ({ value: k, label: k }));
  const kindDefault =
    effectiveSeed?.requirementKind ??
    (tpl?.skeleton.kind as RequirementKind | undefined) ??
    (style.vocabulary.requirementKinds[0] as RequirementKind);
  const kind = (await prompt.select('Kind', kindChoices, kindDefault)) as RequirementKind;

  // 4. statement pattern
  const patternChoices = style.vocabulary.statementPatterns.map((p) => ({
    value: p.pattern,
    label: p.label,
  }));
  const patternDefault =
    effectiveSeed?.statement.pattern ??
    tpl?.skeleton.statementPattern ??
    patternChoices[0]!.value;
  const patternId = await prompt.select('EARS pattern', patternChoices, patternDefault);
  const patternSchema = style.vocabulary.statementPatterns.find((p) => p.pattern === patternId)!;

  // 5. pattern slots
  const slotValues: Record<string, string> = {};
  for (const slot of patternSchema.slots) {
    const seedVal =
      effectiveSeed && effectiveSeed.statement.pattern === patternId
        ? (effectiveSeed.statement as unknown as Record<string, string>)[slot.name]
        : undefined;
    const v = await prompt.text(`  ${slot.name}${slot.hint ? ` (${slot.hint})` : ''}`, {
      default: seedVal,
      validate: (s) =>
        !slot.required || s.trim().length > 0
          ? undefined
          : `${slot.name} is required for pattern '${patternSchema.pattern}'`,
    });
    slotValues[slot.name] = v;
  }
  const statement = buildStatement(patternId, slotValues);

  // 6. priority
  const priorityChoices: readonly PromptChoice<Priority>[] = [
    { value: Priority.Critical, label: 'Critical' },
    { value: Priority.High, label: 'High' },
    { value: Priority.Medium, label: 'Medium' },
    { value: Priority.Low, label: 'Low' },
  ];
  const priorityDefault =
    effectiveSeed?.priority ?? mapPriority(tpl?.skeleton.priority) ?? Priority.High;
  const priority = await prompt.select('Priority', priorityChoices, priorityDefault);

  // 7. status
  const statusChoices: readonly PromptChoice<string>[] = style.vocabulary.statusWorkflow.states.map(
    (s) => ({ value: s, label: s }),
  );
  const statusDefault = effectiveSeed?.status ?? style.vocabulary.statusWorkflow.initial;
  const status = await prompt.select('Status', statusChoices, statusDefault);

  // 8. source kind
  const sourceKindChoices = style.vocabulary.sourceKinds.map((k) => ({
    value: k.kind,
    label: k.label,
  }));
  const sourceKindDefault =
    effectiveSeed?.source.type ?? sourceKindChoices[0]!.value;
  const sourceKindId = await prompt.select('Source kind', sourceKindChoices, sourceKindDefault);
  const sourceKindSchema = style.vocabulary.sourceKinds.find((k) => k.kind === sourceKindId)!;

  // 9. source slots
  const sourceSlotValues: Record<string, string> = {};
  for (const slot of sourceKindSchema.slots) {
    const seedVal =
      effectiveSeed && effectiveSeed.source.type === sourceKindId
        ? (effectiveSeed.source as unknown as Record<string, string>)[slot.name]
        : undefined;
    const v = await prompt.text(`  source.${slot.name}${slot.hint ? ` (${slot.hint})` : ''}`, {
      default: seedVal,
      validate: (s) => {
        if (!slot.required && s.trim().length === 0) return undefined;
        if (s.trim().length === 0) return `${slot.name} is required`;
        if (slot.type === 'iso-date' && !/^\d{4}-\d{2}-\d{2}/.test(s)) return 'must be ISO date';
        
        if (slot.type === 'number' && !Number.isFinite(Number(s))) return 'must be a number';
        return undefined;
      },
    });
    sourceSlotValues[slot.name] = v;
  }
  const source = buildSource(sourceKindId, sourceSlotValues);

  // 10. rationale
  const rationaleClaim = await prompt.text('Rationale claim (one sentence, ends with . ! or ?)', {
    default: effectiveSeed?.rationale.claim,
    validate: (s) => (/[.!?]$/.test(s.trim()) ? undefined : 'must end with . ! or ?'),
  });
  const rationaleKindChoices = style.vocabulary.rationaleKinds.map((k) => ({
    value: k,
    label: k,
  }));
  const rationaleKindDefault =
    effectiveSeed?.rationale.kind ??
    tpl?.skeleton.rationaleKind ??
    rationaleKindChoices[0]!.value;
  const rationaleKind = await prompt.select(
    'Rationale kind',
    rationaleKindChoices,
    rationaleKindDefault,
  );
  const evidence: Evidence[] = [];
  while (await prompt.confirm('Add evidence entry?', false)) {
    const eKind = await prompt.select(
      '  evidence kind',
      [
        { value: 'metric', label: 'metric' },
        { value: 'incident', label: 'incident' },
        { value: 'study', label: 'study' },
        { value: 'expert-opinion', label: 'expert-opinion' },
        { value: 'precedent', label: 'precedent' },
      ],
      'metric',
    );
    evidence.push(await askEvidence(prompt, eKind));
  }

  // 11. fit criteria — required, non-empty
  const fitCriteria: FitCriterion[] = [];
  while (true) {
    const fc = await askFitCriterion(prompt);
    fitCriteria.push(fc);
    const more = await prompt.confirm('Add another fit criterion?', false);
    if (!more) break;
  }

  // 12. verification method
  const vmChoices: readonly PromptChoice<string>[] = style.vocabulary.verificationMethods.map(
    (v) => ({ value: v, label: v }),
  );
  const vmDefault =
    effectiveSeed?.verificationMethod ??
    tpl?.skeleton.verificationMethod ??
    vmChoices[0]!.value;
  const verificationMethod = (await prompt.select(
    'Verification method',
    vmChoices,
    vmDefault,
  )) as VerificationMethod;

  // 13. risk
  const riskChoices: readonly PromptChoice<string>[] = style.vocabulary.riskTaxonomy.levels.map(
    (l) => ({ value: l, label: l }),
  );
  const riskDefault = effectiveSeed?.risk.level ?? riskChoices[0]!.value;
  const riskLevel = await prompt.select('Risk level', riskChoices, riskDefault);
  const ifNotMetRaw = await prompt.text('If not met (one sentence, ends with . ! or ?)', {
    default: effectiveSeed?.risk.ifNotMet,
    validate: (s) => (/[.!?]$/.test(s.trim()) ? undefined : 'must end with . ! or ?'),
  });
  const risk: Risk = { level: riskLevel, ifNotMet: sentence(ifNotMetRaw) };

  // 14. tracedTo loop
  const tracedTo: TracedTo[] = [];
  while (await prompt.confirm('Add tracedTo external link?', false)) {
    tracedTo.push(await askTracedTo(prompt));
  }

  // 15. satisfiedBy (multiselect, offer "create new")
  let satisfiedBy: readonly FeatureId[] = [];
  if (ctx.existingFeatureIds.length > 0) {
    const picks = await prompt.multiselect<string>(
      'Which Features satisfy this Requirement?',
      [
        ...ctx.existingFeatureIds.map((fid) => ({ value: fid, label: fid })),
        { value: '__new__', label: '[ create new Feature inline ]' },
      ],
      effectiveSeed?.satisfiedBy ?? [],
    );
    const concrete = picks.filter((p) => p !== '__new__') as unknown as readonly FeatureId[];
    satisfiedBy = concrete;
    if (picks.includes('__new__')) {
      // Marker: caller (bin wiring) recurses into runFeatureWizard.
      prompt.note(
        'Selected "create new Feature inline" — caller will recurse into the Feature wizard.',
        'Cross-link',
      );
    }
  } else {
    satisfiedBy = effectiveSeed?.satisfiedBy ?? [];
  }

  // 16. confirm summary
  prompt.note(
    renderSummary({ id, title, kind, statement, priority, status, satisfiedBy }),
    'Requirement spec',
  );
  const go = await prompt.confirm('Create this Requirement?', true);
  if (!go) throw new Error('Wizard cancelled by user');

  // 17/18/19 — preview / apply / open: owned by caller.

  const spec: RequirementSpec = finalize({
    $schemaVersion: SCHEMA_VERSION,
    kind: 'requirement',
    id,
    title,
    statement,
    requirementKind: kind,
    priority,
    status,
    source,
    rationale: {
      claim: sentence(rationaleClaim),
      kind: rationaleKind as Rationale['kind'],
      evidence,
    },
    fitCriteria,
    verificationMethod,
    risk,
    satisfiedBy,
    ...(tracedTo.length > 0 ? { tracedTo } : {}),
  });

  assertValidSpec(ctx.style, spec);
  return spec;
}

// ══════════════════════════════════════════════════════════════════════════════
// Decorator-registry queries — @Satisfies / @Refines
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build `FeatureClassName → RequirementClassName[]` from the runtime registry.
 * Feature class names are used here as FeatureId-compatible strings; the
 * mapping from class name to FeatureSpec.id is caller-provided.
 */
export function buildSatisfiesIndex(): ReadonlyMap<FeatureId, readonly RequirementId[]> {
  const out = new Map<FeatureId, readonly RequirementId[]>();
  for (const link of getSatisfactionLinks()) {
    out.set(
      link.featureClass as FeatureId,
      link.requirementClasses as readonly RequirementId[],
    );
  }
  return out;
}

/**
 * Inverse of `buildSatisfiesIndex`: `RequirementClassName → FeatureClassName[]`.
 * Powers "satisfied by" wording in `requirement show` (REQ-VOCAB-INDUSTRY-ALIGNED).
 */
export function buildSatisfiedByIndex(): ReadonlyMap<RequirementId, readonly FeatureId[]> {
  const inverse = new Map<string, string[]>();
  for (const link of getSatisfactionLinks()) {
    for (const req of link.requirementClasses) {
      const list = inverse.get(req) ?? [];
      list.push(link.featureClass);
      inverse.set(req, list);
    }
  }
  const out = new Map<RequirementId, readonly FeatureId[]>();
  for (const [req, feats] of inverse) {
    out.set(req as unknown as RequirementId, feats as unknown as readonly FeatureId[]);
  }
  return out;
}

/**
 * List Features whose class name does not appear in any @Satisfies link.
 *
 * Reads the *runtime* decorator registry, so it only sees Feature classes that
 * were imported into the current process. An empty registry therefore means
 * "no runtime information available" — absence of evidence, not evidence of
 * orphanhood — and yields no findings: a CLI that never imports the classes
 * must not report every Feature as orphaned. Use `orphanFeatureSpecs` for the
 * static view.
 */
export function findOrphanFeatures(
  allFeatureIds: readonly string[],
): readonly string[] {
  const linked = new Set<string>();
  for (const link of getSatisfactionLinks()) linked.add(link.featureClass);
  if (linked.size === 0) return [];
  return allFeatureIds.filter((fid) => !linked.has(fid));
}

// ══════════════════════════════════════════════════════════════════════════════
// Full 4-tier trace chain — REQ → FEAT → AC → TEST
// ══════════════════════════════════════════════════════════════════════════════

export interface TraceChain {
  readonly requirement: RequirementId;
  readonly features: readonly FeatureId[];
  readonly acs: readonly { readonly feature: FeatureId; readonly ac: AcName }[];
  readonly tests: readonly {
    readonly feature: FeatureId;
    readonly ac: AcName;
    readonly testClass: string;
    readonly testMethod: string;
  }[];
}

/**
 * Walk REQ → FEAT → AC → TEST.
 *
 * - Features: from the @Satisfies inverse index.
 * - ACs: from each Feature's `acs[]` (source of truth is the FeatureSpec).
 * - Tests: from the @Verifies runtime registry, filtered to the matched
 *   Feature class name + AC pairs.
 */
export function traceChainFor(
  requirement: RequirementId,
  features: readonly FeatureSpec[],
): TraceChain {
  const inverse = buildSatisfiedByIndex();
  const satisfyingFeatureClasses = inverse.get(requirement) ?? [];

  // Match by className === FeatureSpec.id in the dog-food project convention;
  // callers that don't follow it can pre-normalise.
  const matchedSpecs = features.filter((f) =>
    satisfyingFeatureClasses.includes(f.id as unknown as FeatureId),
  );

  const featureIds = matchedSpecs.map((f) => f.id);
  const acs = matchedSpecs.flatMap((f) =>
    f.acs.map((a) => ({ feature: f.id, ac: a.name })),
  );

  const registry = getRequirementRegistry();
  const tests = registry
    .filter((r) =>
      satisfyingFeatureClasses.some((fc) => (fc as string) === r.feature),
    )
    .filter((r) =>
      acs.some((pair) => (pair.ac as unknown as string) === r.ac),
    )
    .map((r) => ({
      feature: r.feature as unknown as FeatureId,
      ac: r.ac as unknown as AcName,
      testClass: r.testClass,
      testMethod: r.testMethod,
    }));

  return { requirement, features: featureIds, acs, tests };
}

// ══════════════════════════════════════════════════════════════════════════════
// Compliance gate — Approved Requirements without coverage
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Structural minimum the gate predicates read off a Feature. Satisfied by a
 * full `FeatureSpec` and by the projection of a `@Satisfies`-decorated class
 * alike — the gates must not care which of the two a project authors.
 */
export interface FeatureLinkView {
  readonly id: string;
  readonly satisfies?: readonly string[];
}

/** Structural minimum the gate predicates read off a Requirement. */
export interface RequirementStatusView {
  readonly id: string;
  readonly status: string;
  /** Parent RequirementIds (from `@Refines`), if the project decomposes requirements. */
  readonly refines?: readonly string[];
}

/**
 * Requirements covered by a Feature link, plus every ancestor those links cover
 * through the `@Refines` decomposition.
 *
 * A root Requirement is deliberately abstract: it states a policy that no single
 * Feature implements on its own, and is decomposed into the refinements Features
 * actually satisfy. Demanding a direct link on the root as well would force a
 * redundant `@Satisfies` on every hierarchy — the "false link" a project is
 * otherwise told to avoid. So coverage flows upward: satisfying a refinement
 * covers what it refines.
 *
 * A fixpoint rather than a recursion, so a malformed `@Refines` cycle terminates
 * instead of overflowing the stack.
 */
function coveredRequirementIds(
  requirements: readonly RequirementStatusView[],
  features: readonly FeatureLinkView[],
): ReadonlySet<string> {
  const covered = new Set<string>();
  for (const f of features) {
    for (const rid of f.satisfies ?? []) covered.add(rid);
  }
  for (let grew = true; grew; ) {
    grew = false;
    for (const r of requirements) {
      if (!covered.has(r.id)) continue;
      for (const parent of r.refines ?? []) {
        if (!covered.has(parent)) { covered.add(parent); grew = true; }
      }
    }
  }
  return covered;
}

/**
 * Return RequirementIds whose status is `Approved` (or later) and which nothing
 * satisfies — directly or through a refinement. Powers `compliance --strict`.
 *
 * The comparison against the workflow is purely string-based — custom
 * statusWorkflows redefining `Approved` must map to the same literal. The
 * canonical semantic is "the Requirement is committed to, hence uncovered =
 * build gate failure".
 */
export function uncoveredApprovedRequirements(
  requirements: readonly RequirementStatusView[],
  features: readonly FeatureLinkView[],
): readonly string[] {
  const APPROVED_OR_LATER = new Set(['Approved', 'Implemented', 'Verified']);
  const covered = coveredRequirementIds(requirements, features);
  return requirements
    .filter((r) => APPROVED_OR_LATER.has(r.status))
    .filter((r) => !covered.has(r.id))
    .map((r) => r.id);
}

/**
 * Symmetric strict-gate predicate: return FeatureIds whose spec carries no
 * `satisfies[]` entry. Every Feature must be linked to ≥ 1 Requirement
 * (REQ-DSL-COMPLETE / REQ-DOG-FOOD); orphans fail `compliance --strict`.
 *
 * Spec-level counterpart of `findOrphanFeatures` (which reads the runtime
 * `@Satisfies` decorator registry). The spec view is the CI-reliable one
 * because it does not require class loading.
 */
export function orphanFeatureSpecs(
  features: readonly FeatureLinkView[],
): readonly string[] {
  return features
    .filter((f) => (f.satisfies ?? []).length === 0)
    .map((f) => f.id);
}

// ══════════════════════════════════════════════════════════════════════════════
// Internals — sub-prompts + builders
// ══════════════════════════════════════════════════════════════════════════════

async function askEvidence(prompt: Prompt, kind: string): Promise<Evidence> {
  switch (kind) {
    case 'metric': {
      const name = await prompt.text('    metric name');
      const value = await prompt.text('    metric value');
      const date = await prompt.text('    metric date (YYYY-MM-DD)', {
        validate: (s) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? undefined : 'must be ISO date'),
      });
      return { kind: 'metric', name, value, date: isoDate(date) };
    }
    case 'incident': {
      const ref = await prompt.text('    incident ref');
      const date = await prompt.text('    incident date (YYYY-MM-DD)', {
        validate: (s) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? undefined : 'must be ISO date'),
      });
      return { kind: 'incident', ref, date: isoDate(date) };
    }
    case 'study': {
      const title = await prompt.text('    study title');
      const authors = await prompt.text('    study authors');
      const year = await prompt.text('    study year', {
        validate: (s) => (/^\d{4}$/.test(s) ? undefined : 'four-digit year'),
      });
      return { kind: 'study', title, authors, year: Number(year) };
    }
    case 'expert-opinion': {
      const expert = await prompt.text('    expert name');
      const recordedAt = await prompt.text('    recorded date (YYYY-MM-DD)', {
        validate: (s) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? undefined : 'must be ISO date'),
      });
      return { kind: 'expert-opinion', expert, recordedAt: isoDate(recordedAt) };
    }
    
    default: {
      // 'precedent'
      const req = await prompt.text('    precedent requirement id', {
        validate: (s) =>
          REQUIREMENT_ID_PATTERN.test(s) ? undefined : `must match ${REQUIREMENT_ID_PATTERN}`,
      });
      const rationale = await prompt.text('    precedent rationale');
      return { kind: 'precedent', requirement: requirementId(req), rationale };
    }
  }
}

async function askFitCriterion(prompt: Prompt): Promise<FitCriterion> {
  const kind = await prompt.select(
    '  fit criterion kind',
    [
      { value: 'unit-test', label: 'unit-test' },
      { value: 'coverage-threshold', label: 'coverage-threshold' },
      { value: 'quality-gate', label: 'quality-gate' },
      { value: 'metric', label: 'metric' },
      { value: 'inspection', label: 'inspection' },
      { value: 'demonstration', label: 'demonstration' },
      { value: 'narrative', label: 'narrative' },
    ],
    'narrative',
  );
  switch (kind) {
    case 'unit-test': {
      const describes = await prompt.text('    describes (non-empty sentence)', {
        validate: (s) =>
          /[.!?]$/.test(s.trim()) ? undefined : 'must end with . ! or ?',
      });
      return { kind: 'unit-test', describes: sentence(describes), binds: [] };
    }
    case 'coverage-threshold': {
      const metric = (await prompt.select(
        '    metric',
        [
          { value: 'line', label: 'line' },
          { value: 'branch', label: 'branch' },
          { value: 'mutation', label: 'mutation' },
        ],
        'line',
      )) as 'line' | 'branch' | 'mutation';
      const min = await prompt.text('    min %', {
        validate: (s) => {
          const n = Number(s);
          if (!Number.isFinite(n) || n < 0 || n > 100) return 'must be 0..100';
          return undefined;
        },
      });
      const scope = await prompt.text('    scope (glob)');
      return { kind: 'coverage-threshold', metric, min: percentage(Number(min)), scope };
    }
    case 'quality-gate': {
      const tool = await prompt.text('    tool');
      const rule = await prompt.text('    rule');
      return { kind: 'quality-gate', tool, rule };
    }
    case 'metric': {
      const name = await prompt.text('    metric name');
      const query = await prompt.text('    query');
      const operator = (await prompt.select(
        '    operator',
        [
          { value: '<', label: '<' },
          { value: '<=', label: '<=' },
          { value: '=', label: '=' },
          { value: '>=', label: '>=' },
          { value: '>', label: '>' },
        ],
        '>=',
      )) as '<' | '<=' | '=' | '>=' | '>';
      const threshold = await prompt.text('    threshold (number)', {
        validate: (s) => (Number.isFinite(Number(s)) ? undefined : 'must be a number'),
      });
      return { kind: 'metric', name, query, operator, threshold: Number(threshold) };
    }
    case 'inspection': {
      const item = await prompt.text('    checklist item', {
        validate: (s) =>
          /[.!?]$/.test(s.trim()) ? undefined : 'must end with . ! or ?',
      });
      const reviewer = await prompt.text('    reviewer');
      return {
        kind: 'inspection',
        checklist: [sentence(item)],
        reviewers: [reviewer],
      };
    }
    case 'demonstration': {
      const scenario = await prompt.text('    scenario', {
        validate: (s) =>
          /[.!?]$/.test(s.trim()) ? undefined : 'must end with . ! or ?',
      });
      return { kind: 'demonstration', scenario: sentence(scenario) };
    }
    
    default: {
      const text = await prompt.text('    narrative text', {
        validate: (s) =>
          /[.!?]$/.test(s.trim()) ? undefined : 'must end with . ! or ?',
      });
      return { kind: 'narrative', text: sentence(text) };
    }
  }
}

async function askTracedTo(prompt: Prompt): Promise<TracedTo> {
  const system = await prompt.select(
    '  system',
    [
      { value: 'linear', label: 'linear' },
      { value: 'github', label: 'github' },
      { value: 'notion', label: 'notion' },
      { value: 'jira', label: 'jira' },
      { value: 'url', label: 'url' },
    ],
    'url',
  );
  switch (system) {
    case 'linear':
      return { system: 'linear', ticket: await prompt.text('    ticket') };
    case 'github': {
      const org = await prompt.text('    org');
      const repo = await prompt.text('    repo');
      const issue = await prompt.text('    issue', {
        validate: (s) => (/^\d+$/.test(s) ? undefined : 'integer'),
      });
      return { system: 'github', org, repo, issue: Number(issue) };
    }
    case 'notion':
      return { system: 'notion', pageId: await prompt.text('    pageId') };
    case 'jira': {
      const project = await prompt.text('    project');
      const issue = await prompt.text('    issue', {
        validate: (s) => (/^\d+$/.test(s) ? undefined : 'integer'),
      });
      return { system: 'jira', project, issue: Number(issue) };
    }
    
    default:
      return { system: 'url', href: await prompt.text('    href') };
  }
}

// ── Builders ────────────────────────────────────────────────────────────────

function buildStatement(pattern: string, slots: Record<string, string>): EarsStatement {
  switch (pattern) {
    case 'ubiquitous':
      return { pattern: 'ubiquitous', response: sentence(slots.response!) };
    case 'event-driven':
      return {
        pattern: 'event-driven',
        trigger: sentence(slots.trigger!),
        response: sentence(slots.response!),
      };
    case 'state-driven':
      return {
        pattern: 'state-driven',
        state: sentence(slots.state!),
        response: sentence(slots.response!),
      };
    case 'optional':
      return {
        pattern: 'optional',
        feature: sentence(slots.feature!),
        response: sentence(slots.response!),
      };
    case 'unwanted':
      return {
        pattern: 'unwanted',
        trigger: sentence(slots.trigger!),
        response: sentence(slots.response!),
      };
    
    default:
      return { pattern: 'natural', text: sentence(slots.text!) };
  }
}

function buildSource(type: string, slots: Record<string, string>): RequirementSource {
  switch (type) {
    case 'stakeholder':
      return { type: 'stakeholder', role: slots.role!, date: isoDate(slots.date!) };
    case 'regulation':
      return {
        type: 'regulation',
        citation: {
          jurisdiction: slots.jurisdiction!,
          act: slots.act!,
          ...(slots.article ? { article: slots.article } : {}),
          ...(slots.paragraph ? { paragraph: slots.paragraph } : {}),
        },
      };
    case 'standard':
      return {
        type: 'standard',
        org: slots.org!,
        id: slots.id!,
        ...(slots.section ? { section: slots.section } : {}),
      };
    case 'contract':
      return {
        type: 'contract',
        doc: slots.doc!,
        ...(slots.clause ? { clause: slots.clause } : {}),
      };
    case 'risk':
      return { type: 'risk', registerEntry: slots.registerEntry!, severity: slots.severity! };
    case 'business-goal':
      return { type: 'business-goal', okrId: slots.okrId!, period: slots.period! };
    case 'incident':
      return {
        type: 'incident',
        incidentId: slots.incidentId!,
        date: isoDate(slots.date!),
        ...(slots.postmortemUrl ? { postmortemUrl: slots.postmortemUrl } : {}),
      };
    
    default:
      return { type: 'domain-knowledge', reference: slots.reference! };
  }
}

function resolveTemplate(style: RequirementStyle, id: string | undefined) {
  if (!id) return undefined;
  const tpl = style.templates.findTemplate(id);
  if (!tpl) throw new Error(`Template not found: '${id}'`);
  return tpl;
}

function mapPriority(p: string | undefined): Priority | undefined {
  if (!p) return undefined;
  switch (p.toLowerCase()) {
    case 'critical':
      return Priority.Critical;
    case 'high':
      return Priority.High;
    case 'medium':
      return Priority.Medium;
    case 'low':
      return Priority.Low;
    
    default:
      return undefined;
  }
}

function assertValidSpec(style: RequirementStyle, spec: RequirementSpec): void {
  const check = style.validators.validateSpec(spec);
  if (!check.ok) {
    throw new Error(
      `Invalid RequirementSpec: ${check.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`,
    );
  }
  if (spec.fitCriteria.length === 0) {
    throw new Error('Invalid RequirementSpec: at least one fit criterion is required');
  }
}

function finalize(spec: RequirementSpec): RequirementSpec {
  return {
    ...spec,
    $schemaVersion: SCHEMA_VERSION,
    $schema: spec.$schema ?? './requirement-spec.schema.json',
    kind: 'requirement',
  };
}

function renderSummary(s: {
  id: RequirementId;
  title: string;
  kind: RequirementKind;
  statement: EarsStatement;
  priority: Priority;
  status: string;
  satisfiedBy: readonly FeatureId[];
}): string {
  const lines: string[] = [];
  lines.push(`${s.id}  ${s.title}`);
  lines.push(`kind: ${s.kind}  priority: ${s.priority}  status: ${s.status}`);
  lines.push(`statement: ${JSON.stringify(s.statement)}`);
  if (s.satisfiedBy.length > 0) lines.push(`satisfiedBy: ${s.satisfiedBy.join(', ')}`);
  return lines.join('\n');
}

// Mark intentional types exports
export type {
  RequirementId,
  FeatureId,
  AcName,
  RequirementSpec,
  FeatureSpec,
};

// ══════════════════════════════════════════════════════════════════════════════
// Versioning bridge — re-export the pure helpers so callers have one entry
// point for both requirement queries and version-drift detection.
// ══════════════════════════════════════════════════════════════════════════════

export { computeVersionInfo, detectVersionDrift } from '@frenchexdev2/requirements-versioning';
export type {
  VersionInfo,
  VersionPin,
  VersionDrift,
  VersionedSpec as VersionedRequirementSpec,
  Clock as VersioningClock,
} from '@frenchexdev2/requirements-versioning';
