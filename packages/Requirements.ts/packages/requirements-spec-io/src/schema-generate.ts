/**
 * Build-time schema emitter + runtime spec validator.
 *
 * Drives `ts-json-schema-generator` programmatically to produce
 * `feature-spec.schema.json` and `requirement-spec.schema.json` from
 * `src/cli/types.ts`. The generated schemas are committed to the
 * repo under `packages/requirements/schemas/` and shipped in the
 * published package so `.vscode/settings.json` can point to
 * `./node_modules/@frenchexdev2/requirements-lib/schemas/*.schema.json`.
 *
 * Invocation (add to `npm run build` as a pre-step, or run manually):
 *
 *   node --loader tsx -e 'import("./src/cli/schema-generate.ts") \
 *     .then(m => m.generateSchemas({ \
 *       tsconfigPath: "./tsconfig.json", \
 *       typesFile: "./src/cli/types.ts", \
 *       outputDir: "./schemas" \
 *     }))'
 *
 * We deliberately do NOT wire this into package.json here (Stream E
 * owns only the schema layer — `package.json` is off-limits for this
 * stream). Document the wiring in the root package build script later.
 *
 * `validateSpec` is the runtime guard: Stream A calls it pre-write
 * to enforce REQ-SPEC-IS-SOURCE-OF-TRUTH.
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Spec } from '@frenchexdev2/requirements-core/types';

export interface GenerateSchemasOptions {
  readonly tsconfigPath: string;
  readonly typesFile: string;
  readonly outputDir: string;
}

export interface GenerateSchemasResult {
  readonly featureSchemaPath: string;
  readonly requirementSchemaPath: string;
}

export const FEATURE_SCHEMA_FILENAME = 'feature-spec.schema.json';
export const REQUIREMENT_SCHEMA_FILENAME = 'requirement-spec.schema.json';

/** Relative path used in the `$schema` field of generated spec JSON files. */
export const FEATURE_SCHEMA_REF =
  './node_modules/@frenchexdev2/requirements-lib/schemas/feature-spec.schema.json';
export const REQUIREMENT_SCHEMA_REF =
  './node_modules/@frenchexdev2/requirements-lib/schemas/requirement-spec.schema.json';

/**
 * Generate JSON Schemas for `FeatureSpec` and `RequirementSpec`.
 * Uses a dynamic import of `ts-json-schema-generator` so consumers
 * that never call this function don't pay the cost.
 */
export async function generateSchemas(
  opts: GenerateSchemasOptions,
): Promise<GenerateSchemasResult> {
  const mod: unknown = await import('ts-json-schema-generator');
  const createGenerator = (mod as { createGenerator: (cfg: unknown) => { createSchema: (type: string) => unknown } })
    .createGenerator;

  const base = {
    path: opts.typesFile,
    tsconfig: opts.tsconfigPath,
    expose: 'export' as const,
    jsDoc: 'extended' as const,
    skipTypeCheck: true,
    topRef: false,
  };

  const featureSchema = createGenerator({ ...base, type: 'FeatureSpec' }).createSchema('FeatureSpec');
  const requirementSchema = createGenerator({ ...base, type: 'RequirementSpec' }).createSchema('RequirementSpec');

  await fs.mkdir(opts.outputDir, { recursive: true });
  const featurePath = path.join(opts.outputDir, FEATURE_SCHEMA_FILENAME);
  const requirementPath = path.join(opts.outputDir, REQUIREMENT_SCHEMA_FILENAME);
  await fs.writeFile(featurePath, JSON.stringify(featureSchema, null, 2) + '\n', 'utf8');
  await fs.writeFile(requirementPath, JSON.stringify(requirementSchema, null, 2) + '\n', 'utf8');

  return { featureSchemaPath: featurePath, requirementSchemaPath: requirementPath };
}

// ────────────────────────────────────────────────────────────────────────────
// Runtime validation
// ────────────────────────────────────────────────────────────────────────────

export interface ValidationError {
  readonly path: string;
  readonly message: string;
}
export type ValidateResult =
  | { ok: true }
  | { ok: false; errors: readonly ValidationError[] };

// Schemas are resolved relative to the emitted dist/cli/ folder at
// runtime; the published package ships `schemas/` at the package root.
// We load them lazily on first validate call.
let featureValidator: ((s: unknown) => boolean) | null = null;
let requirementValidator: ((s: unknown) => boolean) | null = null;
let ajvLastErrors: readonly ValidationError[] = [];

function isFeatureSpec(spec: unknown): boolean {
  return typeof spec === 'object' && spec !== null && (spec as { kind?: unknown }).kind === 'feature';
}

/** Resolve the directory that holds the generated JSON Schemas. */
export function defaultSchemasDir(): string {
  // In source tree: src/schema-generate.ts  →  ../schemas
  // In dist tree:   dist/schema-generate.js →  ../schemas
  // Both collapse to `<package-root>/schemas`.
  // fileURLToPath handles Windows drive letters correctly; new URL().pathname
  // leaves a leading slash that collides with Node's drive-letter resolution.
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', 'schemas');
}

async function loadValidators(schemasDir: string): Promise<void> {
  if (featureValidator && requirementValidator) return;
  const AjvMod: unknown = await import('ajv');
  type AjvCtor = new (opts?: { allErrors?: boolean; strict?: boolean }) => {
    compile: (s: unknown) => (d: unknown) => boolean;
    errors: readonly { instancePath: string; message?: string }[] | null;
  };
  // Dynamic import exposes Ajv's CommonJS constructor through the ESM default.
  const AjvCtor = (AjvMod as { default: AjvCtor }).default;
  const ajv = new AjvCtor({ allErrors: true, strict: false });

  const featureSchema = JSON.parse(
    await fs.readFile(path.join(schemasDir, FEATURE_SCHEMA_FILENAME), 'utf8'),
  ) as unknown;
  const requirementSchema = JSON.parse(
    await fs.readFile(path.join(schemasDir, REQUIREMENT_SCHEMA_FILENAME), 'utf8'),
  ) as unknown;

  // Ajv v8: errors live on the compiled validator function, not on the Ajv instance.
  type ValidateFn = ((s: unknown) => boolean) & {
    errors?: readonly { instancePath: string; message?: string }[] | null;
  };
  const fv = ajv.compile(featureSchema) as ValidateFn;
  const rv = ajv.compile(requirementSchema) as ValidateFn;

  const capture = (vfn: ValidateFn) => (s: unknown): boolean => {
    const ok = vfn(s);
    if (!ok) {
      ajvLastErrors = (vfn.errors ?? []).map((e) => ({
        path: e.instancePath || '/',
        message: e.message ?? 'invalid',
      }));
    }
    return ok;
  };

  featureValidator = capture(fv);
  requirementValidator = capture(rv);
}

/**
 * Validate an in-memory spec against the appropriate generated schema.
 * Lazily compiles ajv validators on first call.
 */
export async function validateSpec(spec: unknown, schemasDir?: string): Promise<ValidateResult> {
  if (typeof spec !== 'object' || spec === null) {
    return { ok: false, errors: [{ path: '/', message: 'spec must be an object' }] };
  }
  const kind = (spec as { kind?: unknown }).kind;
  if (kind !== 'feature' && kind !== 'requirement') {
    return {
      ok: false,
      errors: [{ path: '/kind', message: 'must be "feature" or "requirement"' }],
    };
  }
  await loadValidators(schemasDir ?? defaultSchemasDir());
  ajvLastErrors = [];
  const validator = isFeatureSpec(spec) ? featureValidator! : requirementValidator!;
  const ok = validator(spec as Spec);
  if (ok) return { ok: true };
  return { ok: false, errors: ajvLastErrors };
}

/** Test seam: reset lazy caches between tests. */
export function __resetValidatorCache(): void {
  featureValidator = null;
  requirementValidator = null;
  ajvLastErrors = [];
}
