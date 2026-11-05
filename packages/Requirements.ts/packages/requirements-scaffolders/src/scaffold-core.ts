/**
 * Scaffold core — pure, zero I/O.
 *
 * Generates test stub source code for uncovered ACs on a given Feature.
 * The caller (CLI shell) writes the result to disk.
 */

import type { FeatureMeta, TestLevel, TestRef } from '@frenchexdev2/requirements-compliance';
import type { Spec, FeatureSpec } from '@frenchexdev2/requirements-core/types';
import { kebabOfId, featureSpecToMeta } from '@frenchexdev2/requirements-spec-io/spec-to-source';
import { DEFAULT_REGISTRY, type ScaffolderRegistry } from './scaffolders/registry.js';
// Stub generators live in stub-templates to break the scaffold-core ↔
// scaffolders/registry init cycle. Re-export so consumers see the same surface.
import { generateUnitTestStub, generateE2eTestStub } from './stub-templates.js';
export { generateUnitTestStub, generateE2eTestStub, type UncoveredAC } from './stub-templates.js';
import type { UncoveredAC } from './stub-templates.js';

export interface ScaffoldResult {
  readonly featureId: string;
  readonly featureClassName: string;
  readonly featureFile: string;
  readonly uncovered: readonly UncoveredAC[];
  readonly generatedSource: string;
  readonly targetPath: string;
}

// ── Find uncovered ACs ──────────────────────────────────────────────────────

export function findUncoveredACs(
  feature: FeatureMeta,
  testRefs: readonly TestRef[],
  level: TestLevel,
): UncoveredAC[] {
  const classToId = new Map([[feature.className, feature.id]]);
  const acDetailMap = new Map(feature.acDetails.map(d => [d.name, d]));
  const uncovered: UncoveredAC[] = [];

  for (const method of feature.acMethods) {
    const expected = acDetailMap.get(method)?.expectedLevels ?? ['unit'];
    if (!(expected as readonly string[]).includes(level)) continue;

    const hasTest = testRefs.some(
      r => (r.featureId === feature.id || classToId.get(r.feature) === feature.id) &&
           r.ac === method && r.level === level,
    );
    if (!hasTest) {
      uncovered.push({ ac: method, missingLevels: [level] });
    }
  }

  return uncovered;
}

// ── Build scaffold result ───────────────────────────────────────────────────

export function buildScaffoldResult(
  feature: FeatureMeta,
  testRefs: readonly TestRef[],
  level: TestLevel,
): ScaffoldResult {
  const uncovered = findUncoveredACs(feature, testRefs, level);
  const featureFile = feature.file.replace(/\.ts$/, '');
  const isE2e = level === 'e2e';
  const source = isE2e
    ? generateE2eTestStub(feature, uncovered)
    : generateUnitTestStub(feature, uncovered);
  const dir = isE2e ? 'test/e2e' : 'test/unit';
  const suffix = isE2e ? '.spec.ts' : '.test.ts';
  const targetPath = `${dir}/${featureFile}-scaffold${suffix}`;

  return {
    featureId: feature.id,
    featureClassName: feature.className,
    featureFile: feature.file,
    uncovered,
    generatedSource: source,
    targetPath,
  };
}

// ── Write plan + scaffold generation for a spec ──────────────────────────────
// (Moved from spec-to-source.ts during Phase 2c normalization: these functions
// mix serialization with scaffold-path planning; scaffolding is the tier-2
// concern, so they belong here, not in the pure spec-IO layer.)

export interface WritePlan {
  readonly sourcePath: string;
  readonly specPath: string;
  readonly scaffoldPaths: readonly { readonly level: TestLevelString; readonly path: string }[];
}

/** String-union form of TestLevel (runtime values of the enum). */
export type TestLevelString = 'unit' | 'functional' | 'e2e' | 'a11y' | 'i18n' | 'visual' | 'perf';

export interface WritePlanConfig {
  readonly featuresDir: string;
  readonly requirementsDir: string;
  /** Optional per-level override. Falls back to each scaffolder's `defaultDir` when absent. */
  readonly testDirsByLevel?: Partial<Record<TestLevelString, string>>;
}

function joinPath(dir: string, file: string): string {
  const d = dir.replace(/\/+$/, '');
  return `${d}/${file}`;
}

/** Compute the set of target file paths a spec writes to.
 *
 * The scaffold registry is consulted for every TestLevel declared in any AC's
 * `@Expects`; a scaffolder entry means "at least one AC wants a test file at
 * this level" → add the corresponding scaffold path.
 *
 * Directory precedence: `config.testDirsByLevel?.[level]` → legacy
 * `testUnitDir`/`testE2eDir` (for unit/e2e only) → scaffolder's `defaultDir`.
 */
export function planWrites(
  spec: Spec,
  config: WritePlanConfig,
  registry: ScaffolderRegistry = DEFAULT_REGISTRY,
): WritePlan {
  const fileBase = kebabOfId(spec.id);
  const specFile = `${fileBase}.spec.json`;
  const sourceFile = `${fileBase}.ts`;

  if (spec.kind === 'feature') {
    const sourcePath = joinPath(config.featuresDir, sourceFile);
    const specPath = joinPath(config.featuresDir, specFile);

    // Collect every distinct level declared by at least one AC.
    const expectedLevels = new Set<TestLevelString>();
    for (const ac of spec.acs) for (const lvl of ac.expects) expectedLevels.add(lvl as TestLevelString);

    const scaffoldPaths: { level: TestLevelString; path: string }[] = [];
    for (const level of expectedLevels) {
      const scaffolder = registry.get(level);
      if (!scaffolder) continue;  // No scaffolder for this level: skip silently (project didn't register one)
      const dir = resolveScaffoldDir(level, config, scaffolder.defaultDir);
      scaffoldPaths.push({
        level,
        path: joinPath(dir, `${fileBase}-scaffold${scaffolder.filenameSuffix}`),
      });
    }

    return { sourcePath, specPath, scaffoldPaths };
  }

  // Requirement — no scaffold; Requirements are not tested directly, their
  // satisfying Features are.
  const sourcePath = joinPath(config.requirementsDir, sourceFile);
  const specPath = joinPath(config.requirementsDir, specFile);
  return { sourcePath, specPath, scaffoldPaths: [] };
}

function resolveScaffoldDir(
  level: TestLevelString,
  config: WritePlanConfig,
  fallback: string,
): string {
  return config.testDirsByLevel?.[level] ?? fallback;
}

/**
 * Generate a scaffold source for a Feature spec at an arbitrary TestLevel via
 * the registry. Returns '' when no AC at this spec expects the level —
 * consumers filter out empties.
 */
export function generateScaffoldForSpec(
  spec: FeatureSpec,
  level: TestLevelString,
  registry: ScaffolderRegistry = DEFAULT_REGISTRY,
): string {
  const scaffolder = registry.get(level);
  if (!scaffolder) return '';
  const meta = featureSpecToMeta(spec);
  const uncovered: UncoveredAC[] = spec.acs
    .filter(ac => ac.expects.some(e => (e as string) === level))
    .map(ac => ({ ac: ac.name, missingLevels: [level] }));
  return scaffolder.generate(meta, uncovered);
}
