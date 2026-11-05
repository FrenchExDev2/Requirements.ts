/**
 * Behavioural check — mutation testing scoped per Feature.AC.
 *
 * Three pure layers (each independently testable):
 *   1. `planBehavioralCheck` — read a list of parsed test files + classToId,
 *      pick out the methods that `@Verifies<F>('ac')` the target AC, and
 *      derive a `{ mutateFiles, testFiles }` plan (or a vacuous verdict
 *      when nothing matches).
 *   2. `buildStrykerConfig` — turn a plan into a StrykerOptions-shaped
 *      object suitable for `JSON.stringify` into a temp config file.
 *      Resolves the vitest-runner plugin via `require.resolve(... , { paths: [repoRoot] })`
 *      to bypass pnpm hoist (see the spike write-up in the plan).
 *   3. `classifyVerdict` — pure mapping from `(plan, mutation score, threshold)`
 *      to a `Verdict` enum.
 *
 * The actual Stryker spawn / report parsing is NOT in this module — it
 * lives with the CLI wiring in `@frenchexdev2/requirements`. This module
 * stays pure / port-free so its dog-food tests can run synchronously.
 *
 * Mode: opt-in, dev-only. NEVER in `compliance --strict`. Cost ~5-10 min/AC.
 */

import { createRequire } from 'node:module';
import type { SymbolTarget, TestParseResult } from '@frenchexdev2/requirements-scanner';

// ESM-safe require for plugin path resolution (this package is "type": "module").
const _require = createRequire(import.meta.url);

export type VacuousReason =
  | 'feature-not-in-test-files'
  | 'ac-not-in-test-files'
  | 'no-targets';

export type Verdict = 'pass' | 'warn' | 'fail' | 'vacuous';

export interface BehavioralCheckPlan {
  readonly featureId: string;
  readonly acName: string;
  readonly mutateFiles: readonly string[];
  readonly testFiles: readonly string[];
  readonly vacuous: false;
}

export interface VacuousPlan {
  readonly featureId: string;
  readonly acName: string;
  readonly mutateFiles: readonly string[];
  readonly testFiles: readonly string[];
  readonly vacuous: true;
  readonly reason: VacuousReason;
}

export type Plan = BehavioralCheckPlan | VacuousPlan;

const DEFAULT_MUTATE_SCOPE = ['src/'] as const;

export interface PlanOptions {
  /** Path prefixes (posix-relative-to-root) for files eligible to be mutated. Default: `['src/']`. */
  readonly mutateScope?: readonly string[];
}

/**
 * Walk `parseResults` for every method whose feature → AC matches the
 * requested (featureId, acName), and derive the `mutate` + `test files`
 * scope for a Stryker run targeting that AC.
 *
 * `classToId` maps a test file's @FeatureTest argument (a class name like
 * `TestBindingsScannerFeature`) to its feature id (like `TEST-BINDINGS-SCANNER`),
 * mirroring `aggregateTestBindings`.
 */
export function planBehavioralCheck(
  parseResults: readonly TestParseResult[],
  featureId: string,
  acName: string,
  classToId: ReadonlyMap<string, string>,
  options: PlanOptions = {},
): Plan {
  const mutateScope = options.mutateScope ?? DEFAULT_MUTATE_SCOPE;
  const mutateFilesSet = new Set<string>();
  const testFilesSet = new Set<string>();
  let featureSeenInTests = false;
  let acSeenInTests = false;

  // Pass 1 — find every method that @Verifies the target AC, derive mutateFiles
  // and "seed" test files (i.e. files that *directly* verify the AC).
  for (const parsed of parseResults) {
    for (const cls of parsed.classes) {
      const id = classToId.get(cls.featureClass) ?? cls.featureClass;
      if (id !== featureId) continue;
      featureSeenInTests = true;
      for (const method of cls.methods) {
        if (method.ac !== acName) continue;
        acSeenInTests = true;
        testFilesSet.add(parsed.file);
        for (const t of method.targets) {
          if (isFileInScope(t.file, mutateScope)) {
            mutateFilesSet.add(t.file);
          }
        }
      }
    }
  }

  // Pass 2 — expand testFiles to every test file that has at least one target
  // inside mutateFiles. Rationale: mutation testing exercises the *whole* set
  // of mutated source files; if we only ran the test scoped to the AC, mutants
  // in shared helpers (e.g. `readMemberName`, `isEmptyBody`) survive even when
  // sister-AC tests in the same file would kill them. Including every test that
  // touches the mutated files yields the honest "is this source covered?"
  // signal that mutation testing is meant to give.
  if (mutateFilesSet.size > 0) {
    for (const parsed of parseResults) {
      for (const cls of parsed.classes) {
        for (const method of cls.methods) {
          for (const t of method.targets) {
            if (mutateFilesSet.has(t.file)) {
              testFilesSet.add(parsed.file);
              break;
            }
          }
        }
      }
    }
  }

  const mutateFiles = [...mutateFilesSet].sort();
  const testFiles = [...testFilesSet].sort();

  const base = { featureId, acName, mutateFiles, testFiles };
  if (!featureSeenInTests) {
    return { ...base, vacuous: true, reason: 'feature-not-in-test-files' };
  }
  if (!acSeenInTests) {
    return { ...base, vacuous: true, reason: 'ac-not-in-test-files' };
  }
  if (mutateFiles.length === 0) {
    return { ...base, vacuous: true, reason: 'no-targets' };
  }
  return { ...base, vacuous: false };
}

function isFileInScope(file: string, scopes: readonly string[]): boolean {
  for (const s of scopes) {
    if (file.startsWith(s)) return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Stryker config builder
// ────────────────────────────────────────────────────────────────────────────

export interface BuildConfigOptions {
  /** Absolute path to the monorepo root — used to resolve hoisted Stryker plugins. */
  readonly repoRoot: string;
  /** Path to the package's `vitest.config.ts`, relative to the package directory. Defaults to `'vitest.config.ts'`. */
  readonly vitestConfigFile?: string;
  /** Where to write Stryker's sandbox. Defaults to `.stryker-tmp-behavioral`. */
  readonly tempDirName?: string;
  /** Stryker concurrency. Defaults to 1 for predictability. */
  readonly concurrency?: number;
  /**
   * Skip mutants in static / top-level initialisers (decorators, top-level
   * exports). Defaults to `true` — Stryker itself warns when off because
   * these mutants typically take a disproportionate share of run-time on
   * decorator-heavy codebases. Set false to keep them.
   */
  readonly ignoreStatic?: boolean;
  /**
   * Enable the @stryker-mutator/typescript-checker plugin. When true, each
   * mutant is type-checked against `tsconfig.json` before its tests run, so
   * mutations that break the type system (e.g. `'unit' → ""` against a
   * `TestLevel` annotation) are killed without ever invoking vitest.
   *
   * Cost trade-off: +3-5× per-mutant overhead on type-clean mutants, but a
   * substantial slice of survivors disappear when source uses literal-typed
   * unions / `as const satisfies` / branded primitives. Opt-in.
   */
  readonly strictTypes?: boolean;
  /** Resolver for the vitest-runner plugin path. Injected for testability. */
  readonly resolvePluginPath?: (specifier: string, fromRoot: string) => string;
}

export interface StrykerConfigSnapshot {
  readonly packageManager: 'pnpm';
  readonly testRunner: 'vitest';
  readonly plugins: readonly string[];
  readonly vitest: { readonly configFile: string };
  readonly mutate: readonly string[];
  readonly testFiles: readonly string[];
  readonly coverageAnalysis: 'perTest';
  readonly checkers: readonly string[];
  readonly concurrency: number;
  readonly cleanTempDir: true;
  readonly tempDirName: string;
  readonly reporters: readonly string[];
  readonly ignoreStatic: boolean;
}

const DEFAULT_RESOLVER: NonNullable<BuildConfigOptions['resolvePluginPath']> = (specifier, fromRoot) =>
  _require.resolve(specifier, { paths: [fromRoot] });

export function buildStrykerConfig(
  plan: BehavioralCheckPlan,
  options: BuildConfigOptions,
): StrykerConfigSnapshot {
  const resolve = options.resolvePluginPath ?? DEFAULT_RESOLVER;
  const strictTypes = options.strictTypes ?? false;
  const plugins = [resolve('@stryker-mutator/vitest-runner', options.repoRoot)];
  if (strictTypes) {
    plugins.push(resolve('@stryker-mutator/typescript-checker', options.repoRoot));
  }
  return {
    packageManager: 'pnpm',
    testRunner: 'vitest',
    plugins,
    vitest: { configFile: options.vitestConfigFile ?? 'vitest.config.ts' },
    mutate: plan.mutateFiles,
    testFiles: plan.testFiles,
    coverageAnalysis: 'perTest',
    checkers: strictTypes ? ['typescript'] : [],
    concurrency: options.concurrency ?? 1,
    cleanTempDir: true,
    tempDirName: options.tempDirName ?? '.stryker-tmp-behavioral',
    reporters: ['clear-text', 'progress', 'json'],
    ignoreStatic: options.ignoreStatic ?? true,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Verdict classification
// ────────────────────────────────────────────────────────────────────────────

export interface ClassifyOptions {
  /** Minimum mutation score (0..100) for a `pass` verdict. Defaults to 0 (vacuous-only fail mode). */
  readonly thresholdPercent?: number;
}

export function classifyVerdict(
  plan: Plan,
  mutationScorePercent: number,
  options: ClassifyOptions = {},
): Verdict {
  if (plan.vacuous) return 'vacuous';
  const threshold = options.thresholdPercent ?? 0;
  if (mutationScorePercent === 0) return 'fail';
  if (mutationScorePercent < threshold) return 'warn';
  return 'pass';
}

// ────────────────────────────────────────────────────────────────────────────
// Global audit — aggregate a single Stryker report into per-AC scores
// ────────────────────────────────────────────────────────────────────────────

/** Shape of a mutant entry in Stryker's JSON `mutation-testing-elements`-format report. */
export interface ReportMutant {
  readonly status: string;
  readonly killedBy?: readonly string[];
  readonly coveredBy?: readonly string[];
}

export interface ReportTest {
  readonly id: string;
  readonly name: string;
}

export interface MutationReport {
  readonly files?: Record<string, { readonly mutants?: readonly ReportMutant[] }>;
  readonly testFiles?: Record<string, { readonly tests?: readonly ReportTest[] }>;
}

export interface BehavioralAuditEntry {
  readonly acId: string;                          // `${featureId}.${acName}`
  readonly featureId: string;
  readonly acName: string;
  readonly mutateFiles: readonly string[];
  readonly killed: number;
  readonly survived: number;
  readonly timeout: number;
  readonly relevantTotal: number;                 // mutants in this AC's files covered by at least one of its tests
  readonly mutationScorePercent: number;
  readonly verdict: Verdict;
}

export interface BehavioralAuditResult {
  readonly entries: readonly BehavioralAuditEntry[];
  readonly globalKilled: number;
  readonly globalSurvived: number;
  readonly globalTimeout: number;
  readonly globalTotal: number;
  readonly globalMutationScorePercent: number;
}

/**
 * Aggregate a single Stryker mutation report into per-AC behavioural scores.
 *
 * For each AC `F.ac`, a mutant is "relevant" iff:
 *   1. it lives in a file that the AC touches (any `@Verifies<F>('ac')` method has a target there), AND
 *   2. it is `coveredBy` at least one test from the AC's own test set
 *      (test name `"<ClassName> > <methodName>"` matches a method that `@Verifies` this AC).
 *
 * The AC kills a mutant iff a member of its own test set appears in `killedBy`.
 * Score = (killed + timeout) / (killed + survived + timeout) × 100 over valid,
 * covered mutants relevant to the AC. Global counts sum these AC observations;
 * a mutant relevant to two ACs contributes twice (an AC-weighted score).
 */
export function aggregateByAc(
  report: MutationReport,
  parseResults: readonly TestParseResult[],
  classToId: ReadonlyMap<string, string>,
  options: { readonly thresholdPercent?: number } = {},
): BehavioralAuditResult {
  const threshold = options.thresholdPercent ?? 0;

  // 1. Index ACs: mutate files + test names.
  const acIndex = new Map<string, { featureId: string; acName: string; mutateFiles: Set<string>; testNames: Set<string> }>();
  for (const parsed of parseResults) {
    for (const cls of parsed.classes) {
      const featureId = classToId.get(cls.featureClass) ?? cls.featureClass;
      for (const method of cls.methods) {
        const acId = `${featureId}.${method.ac}`;
        let entry = acIndex.get(acId);
        if (!entry) {
          entry = { featureId, acName: method.ac, mutateFiles: new Set(), testNames: new Set() };
          acIndex.set(acId, entry);
        }
        entry.testNames.add(`${cls.className} > ${method.methodName}`);
        for (const t of method.targets) entry.mutateFiles.add(t.file);
      }
    }
  }

  // 2. Map Stryker test ids → test names.
  const testIdToName = new Map<string, string>();
  for (const tf of Object.values(report.testFiles ?? {})) {
    for (const t of tf.tests ?? []) testIdToName.set(t.id, t.name);
  }

  // 3. For each AC, score over its relevant mutants.
  const entries: BehavioralAuditEntry[] = [];
  let gKilled = 0, gSurvived = 0, gTimeout = 0;
  for (const [acId, ac] of acIndex) {
    let killed = 0, survived = 0, timeout = 0, relevant = 0;
    for (const file of ac.mutateFiles) {
      const fileResult = report.files?.[file];
      if (!fileResult) continue;
      for (const mutant of fileResult.mutants ?? []) {
        if (!['Killed', 'Survived', 'Timeout'].includes(mutant.status)) continue;
        const coveringNames = (mutant.coveredBy ?? []).map(id => testIdToName.get(id)).filter((n): n is string => typeof n === 'string');
        if (!coveringNames.some(n => ac.testNames.has(n))) continue;
        relevant++;
        const killers = (mutant.killedBy ?? []).map(id => testIdToName.get(id)).filter((n): n is string => typeof n === 'string');
        const killedByThisAc = killers.some(n => ac.testNames.has(n));
        if (mutant.status === 'Killed' && killedByThisAc) killed++;
        else if (mutant.status === 'Timeout') timeout++;
        else survived++;
      }
    }
    const denom = killed + survived + timeout;
    const score = denom > 0 ? ((killed + timeout) / denom) * 100 : 0;
    const planForVerdict: Plan = relevant === 0
      ? { featureId: ac.featureId, acName: ac.acName, mutateFiles: [], testFiles: [], vacuous: true, reason: 'no-targets' }
      : { featureId: ac.featureId, acName: ac.acName, mutateFiles: [...ac.mutateFiles].sort(), testFiles: [], vacuous: false };
    entries.push({
      acId,
      featureId: ac.featureId,
      acName: ac.acName,
      mutateFiles: [...ac.mutateFiles].sort(),
      killed, survived, timeout,
      relevantTotal: relevant,
      mutationScorePercent: score,
      verdict: classifyVerdict(planForVerdict, score, { thresholdPercent: threshold }),
    });
    gKilled += killed; gSurvived += survived; gTimeout += timeout;
  }
  entries.sort((a, b) => a.acId.localeCompare(b.acId));

  const gTotal = gKilled + gSurvived + gTimeout;
  const gScore = gTotal > 0 ? ((gKilled + gTimeout) / gTotal) * 100 : 0;
  return {
    entries,
    globalKilled: gKilled,
    globalSurvived: gSurvived,
    globalTimeout: gTimeout,
    globalTotal: gTotal,
    globalMutationScorePercent: gScore,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Re-exports for the CLI / tests
// ────────────────────────────────────────────────────────────────────────────

export type { SymbolTarget };
