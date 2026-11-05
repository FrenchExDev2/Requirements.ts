/**
 * spec-to-source — pure source generator for Feature / Requirement specs.
 *
 * Responsibilities:
 *   - Convert FeatureSpec / RequirementSpec into TypeScript source matching the
 *     class-is-the-spec shape (see requirements/features/feature-new-command.ts
 *     and requirements/requirements/req-dsl-complete.ts).
 *   - Compute deterministic filenames / class names from branded Ids.
 *   - Serialize specs to pretty-printed JSON with $schema first, $schemaVersion second.
 *   - Plan the set of files a spec writes to, given a config.
 *
 * Zero I/O. Deterministic: same input → same output, byte for byte.
 *
 * Reuses `generateUnitTestStub` / `generateE2eTestStub` from scaffold-core so
 * the test-scaffolding logic is not duplicated.
 */

import type {
  FeatureSpec,
  RequirementSpec,
  Spec,
} from '@frenchexdev2/requirements-core/types';
import type { FeatureMeta, ACMeta } from '@frenchexdev2/requirements-compliance';

// ── Id → filename / class-name helpers ──────────────────────────────────────

// Re-exported from @frenchexdev2/requirements-core (pure ID/naming utilities).
// They live in core so spec-io and core's rename-core can share them without
// crossing tier boundaries.
export { kebabOfId, featureClassName, requirementClassName } from '@frenchexdev2/requirements-core';
import { featureClassName, kebabOfId, requirementClassName } from '@frenchexdev2/requirements-core';

// ── Source generators ───────────────────────────────────────────────────────

/** Preserve free-form titles without letting them terminate a generated JSDoc. */
function commentText(text: string): string {
  return text.replace(/\*\//g, '* /').replace(/\r?\n/g, '\n * ');
}

function priorityLiteral(priority: string): string {
  // Priority enum values are lowercase strings; map to the enum key.
  switch (priority) {
    case 'critical': return 'Priority.Critical';
    case 'high':     return 'Priority.High';
    case 'medium':   return 'Priority.Medium';
    case 'low':      return 'Priority.Low';
    default:         return `Priority.Medium /* unknown: ${priority} */`;
  }
}

/** Generate the .ts source for a Feature class from a FeatureSpec. */
export function generateFeatureSource(spec: FeatureSpec): string {
  const className = featureClassName(spec.id);
  const satisfies = spec.satisfies ?? [];
  const lines: string[] = [];

  lines.push(`import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements';`);
  for (const reqId of satisfies) {
    const reqClass = requirementClassName(reqId);
    lines.push(`import { ${reqClass} } from '@frenchexdev2/requirements-requirements';`);
  }
  lines.push('');
  lines.push(`/**`);
  lines.push(` * ${commentText(spec.title)}`);
  lines.push(` * Generated from FeatureSpec ${spec.id}. Edit the spec, re-run the generator.`);
  lines.push(` */`);
  if (satisfies.length > 0) {
    lines.push(`@Satisfies(`);
    for (let i = 0; i < satisfies.length; i++) {
      const reqClass = requirementClassName(satisfies[i]!);
      const comma = i < satisfies.length - 1 ? ',' : '';
      lines.push(`  ${reqClass}${comma}`);
    }
    lines.push(`)`);
  }
  lines.push(`export abstract class ${className} extends Feature {`);
  lines.push(`  readonly id = '${spec.id}';`);
  lines.push(`  readonly title = ${JSON.stringify(spec.title)};`);
  lines.push(`  readonly priority = ${priorityLiteral(spec.priority)};`);
  lines.push('');
  for (const ac of spec.acs) {
    const expectsComment = ac.expects.length > 0
      ? ` // expects: ${ac.expects.join(', ')}`
      : '';
    lines.push(`  abstract ${ac.name}(): ACResult;${expectsComment}`);
  }
  lines.push(`}`);
  lines.push('');
  return lines.join('\n');
}

function formatStatementLiteral(statement: RequirementSpec['statement']): string {
  const entries: string[] = [];
  entries.push(`    pattern: ${JSON.stringify(statement.pattern)} as const,`);
  for (const [k, v] of Object.entries(statement)) {
    if (k === 'pattern') continue;
    entries.push(`    ${k}: ${JSON.stringify(v)},`);
  }
  return `{\n${entries.join('\n')}\n  }`;
}

/** Generate the .ts source for a Requirement class from a RequirementSpec. */
export function generateRequirementSource(spec: RequirementSpec): string {
  const className = requirementClassName(spec.id);
  const lines: string[] = [];

  lines.push(`import { Requirement, Priority } from '@frenchexdev2/requirements';`);
  lines.push(`import type { DefaultStyleType } from '@frenchexdev2/requirements-styles';`);
  lines.push('');
  lines.push(`/**`);
  lines.push(` * ${spec.id} — ${commentText(spec.title)}`);
  lines.push(` * Generated from RequirementSpec. The class IS the spec.`);
  lines.push(` */`);
  lines.push(`export abstract class ${className} extends Requirement<DefaultStyleType> {`);
  lines.push(`  readonly id = '${spec.id}';`);
  lines.push(`  readonly title = ${JSON.stringify(spec.title)};`);
  lines.push(`  readonly priority = ${priorityLiteral(spec.priority)};`);
  lines.push(`  readonly status = ${JSON.stringify(spec.status)} as const;`);
  lines.push(`  readonly kind = ${JSON.stringify(spec.requirementKind)} as const;`);
  lines.push('');
  lines.push(`  readonly statement = ${formatStatementLiteral(spec.statement)};`);
  lines.push('');
  lines.push(`  readonly rationale = ${JSON.stringify(spec.rationale, null, 2).replace(/\n/g, '\n  ')};`);
  lines.push('');
  lines.push(`  readonly fitCriteria = ${JSON.stringify(spec.fitCriteria, null, 2).replace(/\n/g, '\n  ')} as const;`);
  lines.push('');
  lines.push(`  readonly verificationMethod = ${JSON.stringify(spec.verificationMethod)} as const;`);
  lines.push('');
  lines.push(`  readonly source = ${JSON.stringify(spec.source, null, 2).replace(/\n/g, '\n  ')};`);
  lines.push('');
  lines.push(`  readonly risk = ${JSON.stringify(spec.risk, null, 2).replace(/\n/g, '\n  ')};`);
  if (spec.tracedTo && spec.tracedTo.length > 0) {
    lines.push('');
    lines.push(`  readonly tracedTo = ${JSON.stringify(spec.tracedTo, null, 2).replace(/\n/g, '\n  ')} as const;`);
  }
  lines.push(`}`);
  lines.push('');
  return lines.join('\n');
}

// ── JSON serialization ──────────────────────────────────────────────────────

const SCHEMA_PATH_FEATURE     = './node_modules/@frenchexdev2/requirements-lib/schemas/feature-spec.schema.json';
const SCHEMA_PATH_REQUIREMENT = './node_modules/@frenchexdev2/requirements-lib/schemas/requirement-spec.schema.json';

/**
 * Serialize a spec to pretty-printed JSON.
 * Guarantees: `$schema` is the first key, `$schemaVersion` the second.
 * Deterministic: same spec → same string (object key order preserved by emitting
 * all other keys in their original insertion order).
 */
export function specToJson(spec: Spec): string {
  const schemaPath = spec.kind === 'feature' ? SCHEMA_PATH_FEATURE : SCHEMA_PATH_REQUIREMENT;
  const ordered: Record<string, unknown> = {
    $schema: spec.$schema ?? schemaPath,
    $schemaVersion: spec.$schemaVersion,
  };
  for (const [k, v] of Object.entries(spec)) {
    if (k === '$schema' || k === '$schemaVersion') continue;
    ordered[k] = v;
  }
  return JSON.stringify(ordered, null, 2) + '\n';
}

/**
 * Build a FeatureMeta from a FeatureSpec so we can reuse scaffold-core's
 * stub generators (REQ: no duplication).
 */
export function featureSpecToMeta(spec: FeatureSpec): FeatureMeta {
  const className = featureClassName(spec.id);
  const fileBase = kebabOfId(spec.id);
  const acDetails: ACMeta[] = spec.acs.map(ac => ({
    name: ac.name,
    expectedLevels: ac.expects,
  }));
  return {
    id: spec.id,
    title: spec.title,
    priority: spec.priority,
    acMethods: spec.acs.map(ac => ac.name),
    acDetails,
    enabled: true,
    className,
    file: `${fileBase}.ts`,
    satisfies: spec.satisfies ?? [],
  };
}

