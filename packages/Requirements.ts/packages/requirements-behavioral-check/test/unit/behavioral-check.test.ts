import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { BehavioralCheckFeature } from '@frenchexdev2/requirements-requirements';
import {
  planBehavioralCheck,
  buildStrykerConfig,
  classifyVerdict,
  aggregateByAc,
  type BehavioralCheckPlan,
  type Plan,
  type VacuousPlan,
  type MutationReport,
} from '../../src/behavioral-check';
import type { TestParseResult } from '@frenchexdev2/requirements-scanner';

// Synthetic parse-result builder — lets each test assemble a minimal scanner output.
function pr(
  file: string,
  classes: ReadonlyArray<{
    className: string;
    featureClass: string;
    methods: ReadonlyArray<{ methodName: string; ac: string; targets: ReadonlyArray<{ file: string; symbol: string }> }>;
  }>,
): TestParseResult {
  return {
    file,
    classes: classes.map(c => ({
      className: c.className,
      featureClass: c.featureClass,
      methods: c.methods.map(m => ({ methodName: m.methodName, ac: m.ac, targets: [...m.targets] })),
    })),
    warnings: [],
  };
}

const CLASS_TO_ID = new Map<string, string>([['MyFeature', 'MY-FEATURE']]);

@FeatureTest(BehavioralCheckFeature)
class PlanBehavioralCheckTests {
  @Verifies<BehavioralCheckFeature>('collectsMutateFilesFromTargetsOfMatchingAcMethods')
  'gathers mutate files from every target of methods that @Verifies the AC'() {
    const results = [
      pr('test/a.test.ts', [{
        className: 'AT',
        featureClass: 'MyFeature',
        methods: [{
          methodName: 'm',
          ac: 'ac1',
          targets: [{ file: 'src/foo.ts', symbol: 'foo' }, { file: 'src/bar.ts', symbol: 'bar' }],
        }],
      }]),
    ];
    const plan = planBehavioralCheck(results, 'MY-FEATURE', 'ac1', CLASS_TO_ID);
    expect(plan.vacuous).toBe(false);
    expect(plan.mutateFiles).toEqual(['src/bar.ts', 'src/foo.ts']);
  }

  @Verifies<BehavioralCheckFeature>('collectsTestFilesFromMatchingAcMethods')
  'gathers the test file for each matching method'() {
    const results = [
      pr('test/a.test.ts', [{
        className: 'AT', featureClass: 'MyFeature',
        methods: [{ methodName: 'm', ac: 'ac1', targets: [{ file: 'src/foo.ts', symbol: 'foo' }] }],
      }]),
      pr('test/b.test.ts', [{
        className: 'BT', featureClass: 'MyFeature',
        methods: [{ methodName: 'm', ac: 'ac1', targets: [{ file: 'src/bar.ts', symbol: 'bar' }] }],
      }]),
    ];
    const plan = planBehavioralCheck(results, 'MY-FEATURE', 'ac1', CLASS_TO_ID);
    expect(plan.testFiles).toEqual(['test/a.test.ts', 'test/b.test.ts']);
  }

  @Verifies<BehavioralCheckFeature>('restrictsMutateFilesToConfiguredScope')
  'filters out targets that fall outside the mutateScope prefixes'() {
    const results = [
      pr('test/a.test.ts', [{
        className: 'AT', featureClass: 'MyFeature',
        methods: [{
          methodName: 'm', ac: 'ac1',
          targets: [
            { file: 'src/foo.ts', symbol: 'foo' },
            { file: 'scripts/helper.ts', symbol: 'helper' },
            { file: 'dist/foo.js', symbol: 'foo' },
          ],
        }],
      }]),
    ];
    const plan = planBehavioralCheck(results, 'MY-FEATURE', 'ac1', CLASS_TO_ID, { mutateScope: ['src/'] });
    expect(plan.mutateFiles).toEqual(['src/foo.ts']);
  }

  @Verifies<BehavioralCheckFeature>('dedupesMutateAndTestFilePaths')
  'deduplicates mutate + test file paths across multiple matching methods'() {
    const results = [
      pr('test/a.test.ts', [{
        className: 'AT', featureClass: 'MyFeature',
        methods: [
          { methodName: 'm1', ac: 'ac1', targets: [{ file: 'src/foo.ts', symbol: 'foo' }] },
          { methodName: 'm2', ac: 'ac1', targets: [{ file: 'src/foo.ts', symbol: 'foo' }] },
        ],
      }]),
    ];
    const plan = planBehavioralCheck(results, 'MY-FEATURE', 'ac1', CLASS_TO_ID);
    expect(plan.mutateFiles).toEqual(['src/foo.ts']);
    expect(plan.testFiles).toEqual(['test/a.test.ts']);
  }

  @Verifies<BehavioralCheckFeature>('reportsVacuousWhenNoTargetsForAc')
  'returns vacuous (no-targets) when matching methods exist but their targets are empty / out-of-scope'() {
    const results = [
      pr('test/a.test.ts', [{
        className: 'AT', featureClass: 'MyFeature',
        methods: [{ methodName: 'm', ac: 'ac1', targets: [] }],
      }]),
    ];
    const plan = planBehavioralCheck(results, 'MY-FEATURE', 'ac1', CLASS_TO_ID) as VacuousPlan;
    expect(plan.vacuous).toBe(true);
    expect(plan.reason).toBe('no-targets');
    expect(plan.testFiles).toEqual(['test/a.test.ts']);
  }

  @Verifies<BehavioralCheckFeature>('reportsVacuousWhenAcNotFoundInManifest')
  'returns vacuous (ac-not-in-test-files) when the feature appears but no method matches the AC'() {
    const results = [
      pr('test/a.test.ts', [{
        className: 'AT', featureClass: 'MyFeature',
        methods: [{ methodName: 'm', ac: 'other', targets: [{ file: 'src/foo.ts', symbol: 'foo' }] }],
      }]),
    ];
    const plan = planBehavioralCheck(results, 'MY-FEATURE', 'ac1', CLASS_TO_ID) as VacuousPlan;
    expect(plan.vacuous).toBe(true);
    expect(plan.reason).toBe('ac-not-in-test-files');
  }

  @Verifies<BehavioralCheckFeature>('reportsVacuousWhenFeatureNotFoundInManifest')
  'returns vacuous (feature-not-in-test-files) when no test class is decorated for the feature'() {
    const results = [
      pr('test/a.test.ts', [{
        className: 'OT', featureClass: 'OtherFeature',
        methods: [{ methodName: 'm', ac: 'ac1', targets: [{ file: 'src/foo.ts', symbol: 'foo' }] }],
      }]),
    ];
    const plan = planBehavioralCheck(results, 'MY-FEATURE', 'ac1', CLASS_TO_ID) as VacuousPlan;
    expect(plan.vacuous).toBe(true);
    expect(plan.reason).toBe('feature-not-in-test-files');
  }

  @Verifies<BehavioralCheckFeature>('expandsTestFilesToCoverAllMutateTargets')
  'expands testFiles to every test file touching a mutate target (across ACs / features)'() {
    // primary.test.ts directly verifies the requested AC → seeds mutateFiles=[src/shared.ts]
    // sibling.test.ts verifies a different AC of the same feature but also targets src/shared.ts → must be included
    // unrelated.test.ts targets src/other.ts → must NOT be included
    const results = [
      pr('test/primary.test.ts', [{
        className: 'PT', featureClass: 'MyFeature',
        methods: [{ methodName: 'm', ac: 'ac1', targets: [{ file: 'src/shared.ts', symbol: 'a' }] }],
      }]),
      pr('test/sibling.test.ts', [{
        className: 'ST', featureClass: 'MyFeature',
        methods: [{ methodName: 'n', ac: 'acOther', targets: [{ file: 'src/shared.ts', symbol: 'b' }] }],
      }]),
      pr('test/unrelated.test.ts', [{
        className: 'UT', featureClass: 'OtherFeature',
        methods: [{ methodName: 'k', ac: 'whatever', targets: [{ file: 'src/other.ts', symbol: 'c' }] }],
      }]),
    ];
    const plan = planBehavioralCheck(results, 'MY-FEATURE', 'ac1', CLASS_TO_ID);
    expect(plan.vacuous).toBe(false);
    expect(plan.mutateFiles).toEqual(['src/shared.ts']);
    expect(plan.testFiles).toEqual(['test/primary.test.ts', 'test/sibling.test.ts']);
  }

  @Verifies<BehavioralCheckFeature>('returnsSortedMutateAndTestFileLists')
  'returns deterministic, sorted file lists'() {
    const results = [
      pr('test/z.test.ts', [{
        className: 'ZT', featureClass: 'MyFeature',
        methods: [{ methodName: 'm', ac: 'ac1', targets: [{ file: 'src/zz.ts', symbol: 'z' }] }],
      }]),
      pr('test/a.test.ts', [{
        className: 'AT', featureClass: 'MyFeature',
        methods: [{ methodName: 'm', ac: 'ac1', targets: [{ file: 'src/aa.ts', symbol: 'a' }] }],
      }]),
    ];
    const plan = planBehavioralCheck(results, 'MY-FEATURE', 'ac1', CLASS_TO_ID);
    expect(plan.mutateFiles).toEqual(['src/aa.ts', 'src/zz.ts']);
    expect(plan.testFiles).toEqual(['test/a.test.ts', 'test/z.test.ts']);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// buildStrykerConfig
// ────────────────────────────────────────────────────────────────────────────

const ROOT = '/repo';
const SAMPLE_PLAN: BehavioralCheckPlan = {
  featureId: 'MY-FEATURE',
  acName: 'ac1',
  mutateFiles: ['src/foo.ts'],
  testFiles: ['test/a.test.ts'],
  vacuous: false,
};
const STUB_RESOLVER = (spec: string, root: string): string => `${root}/node_modules/${spec}/dist/index.js`;

@FeatureTest(BehavioralCheckFeature)
class BuildStrykerConfigTests {
  @Verifies<BehavioralCheckFeature>('buildsStrykerConfigWithMutateAndTestFiles')
  'embeds the plan mutate + test files into the resulting StrykerOptions'() {
    const cfg = buildStrykerConfig(SAMPLE_PLAN, { repoRoot: ROOT, resolvePluginPath: STUB_RESOLVER });
    expect(cfg.mutate).toEqual(SAMPLE_PLAN.mutateFiles);
    expect(cfg.testFiles).toEqual(SAMPLE_PLAN.testFiles);
  }

  @Verifies<BehavioralCheckFeature>('resolvesVitestRunnerPluginViaRepoRoot')
  'resolves the vitest-runner plugin from the repo root node_modules (pnpm hoist)'() {
    const cfg = buildStrykerConfig(SAMPLE_PLAN, { repoRoot: ROOT, resolvePluginPath: STUB_RESOLVER });
    expect(cfg.plugins).toEqual([`${ROOT}/node_modules/@stryker-mutator/vitest-runner/dist/index.js`]);
  }

  @Verifies<BehavioralCheckFeature>('disablesCheckersByDefault')
  'defaults checkers to an empty list (typescript-checker is opt-in)'() {
    const cfg = buildStrykerConfig(SAMPLE_PLAN, { repoRoot: ROOT, resolvePluginPath: STUB_RESOLVER });
    expect(cfg.checkers).toEqual([]);
  }

  @Verifies<BehavioralCheckFeature>('setsConcurrencyToOneForPredictability')
  'defaults concurrency to 1 (predictable, low-CPU, dev-mode default)'() {
    const cfg = buildStrykerConfig(SAMPLE_PLAN, { repoRoot: ROOT, resolvePluginPath: STUB_RESOLVER });
    expect(cfg.concurrency).toBe(1);
    // override flows through
    const cfg2 = buildStrykerConfig(SAMPLE_PLAN, { repoRoot: ROOT, resolvePluginPath: STUB_RESOLVER, concurrency: 4 });
    expect(cfg2.concurrency).toBe(4);
  }

  @Verifies<BehavioralCheckFeature>('setsCleanTempDirTrue')
  'cleanTempDir is true and tempDirName carries a sentinel name'() {
    const cfg = buildStrykerConfig(SAMPLE_PLAN, { repoRoot: ROOT, resolvePluginPath: STUB_RESOLVER });
    expect(cfg.cleanTempDir).toBe(true);
    expect(cfg.tempDirName).toBe('.stryker-tmp-behavioral');
    const cfg2 = buildStrykerConfig(SAMPLE_PLAN, { repoRoot: ROOT, resolvePluginPath: STUB_RESOLVER, tempDirName: '.stryker-foo' });
    expect(cfg2.tempDirName).toBe('.stryker-foo');
  }

  @Verifies<BehavioralCheckFeature>('pointsAtVitestConfigRelativeToPackage')
  'defaults vitest.configFile to a package-relative path'() {
    const cfg = buildStrykerConfig(SAMPLE_PLAN, { repoRoot: ROOT, resolvePluginPath: STUB_RESOLVER });
    expect(cfg.vitest.configFile).toBe('vitest.config.ts');
    const cfg2 = buildStrykerConfig(SAMPLE_PLAN, { repoRoot: ROOT, resolvePluginPath: STUB_RESOLVER, vitestConfigFile: 'vitest.unit.config.ts' });
    expect(cfg2.vitest.configFile).toBe('vitest.unit.config.ts');
  }

  @Verifies<BehavioralCheckFeature>('setsIgnoreStaticTrueByDefault')
  'ignoreStatic is true by default and overridable'() {
    // Stryker itself warns when static mutants dominate run-time (decorator-heavy
    // codebases trigger this); enabling ignoreStatic up-front is the documented fix.
    const cfg = buildStrykerConfig(SAMPLE_PLAN, { repoRoot: ROOT, resolvePluginPath: STUB_RESOLVER });
    expect(cfg.ignoreStatic).toBe(true);
    const cfg2 = buildStrykerConfig(SAMPLE_PLAN, { repoRoot: ROOT, resolvePluginPath: STUB_RESOLVER, ignoreStatic: false });
    expect(cfg2.ignoreStatic).toBe(false);
  }

  @Verifies<BehavioralCheckFeature>('enablesTypescriptCheckerWhenStrictTypesRequested')
  'strictTypes wires the typescript-checker plugin + checkers, off by default'() {
    // OFF by default — cheaper run, no compile-time mutant kills.
    const cfg = buildStrykerConfig(SAMPLE_PLAN, { repoRoot: ROOT, resolvePluginPath: STUB_RESOLVER });
    expect(cfg.checkers).toEqual([]);
    expect(cfg.plugins.some(p => p.includes('typescript-checker'))).toBe(false);
    // ON when requested — checker plugin loaded + activated.
    const cfg2 = buildStrykerConfig(SAMPLE_PLAN, { repoRoot: ROOT, resolvePluginPath: STUB_RESOLVER, strictTypes: true });
    expect(cfg2.checkers).toEqual(['typescript']);
    expect(cfg2.plugins.some(p => p.includes('typescript-checker'))).toBe(true);
    expect(cfg2.plugins.some(p => p.includes('vitest-runner'))).toBe(true); // vitest-runner still there
  }
}

// ────────────────────────────────────────────────────────────────────────────
// classifyVerdict
// ────────────────────────────────────────────────────────────────────────────

const VACUOUS_PLAN: VacuousPlan = {
  featureId: 'MY-FEATURE', acName: 'ac1',
  mutateFiles: [], testFiles: [],
  vacuous: true, reason: 'no-targets',
};
const REAL_PLAN: BehavioralCheckPlan = SAMPLE_PLAN;

@FeatureTest(BehavioralCheckFeature)
class ClassifyVerdictTests {
  @Verifies<BehavioralCheckFeature>('classifiesVacuousWhenPlanFlaggedVacuous')
  'returns "vacuous" whenever the plan is vacuous, regardless of score'() {
    expect(classifyVerdict(VACUOUS_PLAN, 0)).toBe('vacuous');
    expect(classifyVerdict(VACUOUS_PLAN, 100)).toBe('vacuous');
  }

  @Verifies<BehavioralCheckFeature>('classifiesFailWhenZeroMutantsKilled')
  'returns "fail" when the score is 0 on a non-vacuous plan'() {
    expect(classifyVerdict(REAL_PLAN, 0)).toBe('fail');
  }

  @Verifies<BehavioralCheckFeature>('classifiesWarnWhenScoreBelowThreshold')
  'returns "warn" when the score is between 0 and the threshold'() {
    expect(classifyVerdict(REAL_PLAN, 30, { thresholdPercent: 60 })).toBe('warn');
  }

  @Verifies<BehavioralCheckFeature>('classifiesPassWhenScoreAtOrAboveThreshold')
  'returns "pass" when the score is at or above the threshold'() {
    expect(classifyVerdict(REAL_PLAN, 60, { thresholdPercent: 60 })).toBe('pass');
    expect(classifyVerdict(REAL_PLAN, 100, { thresholdPercent: 60 })).toBe('pass');
  }

  @Verifies<BehavioralCheckFeature>('defaultsThresholdToZero')
  'default threshold is 0 — any non-zero score is "pass"'() {
    expect(classifyVerdict(REAL_PLAN, 1)).toBe('pass');
    expect(classifyVerdict(REAL_PLAN, 100)).toBe('pass');
  }
}

// Silence noUnusedLocals — the runtime decorator side-effect registers each
// class with vitest, but TS doesn't see them as referenced.
void PlanBehavioralCheckTests;
void BuildStrykerConfigTests;
void ClassifyVerdictTests;

// Plan type narrowing reference (unused at runtime — keeps the import live)
void (null as unknown as Plan);

// ────────────────────────────────────────────────────────────────────────────
// aggregateByAc — global Stryker report → per-AC scores
// ────────────────────────────────────────────────────────────────────────────

const AUDIT_CLASS_TO_ID = new Map<string, string>([
  ['FA', 'F-A'],
  ['FB', 'F-B'],
]);

function auditParseResults(): TestParseResult[] {
  // Two ACs in F-A: ac1 (test t1) targets src/a.ts, ac2 (test t2) targets src/b.ts.
  // One AC in F-B: ac3 (test t3) targets src/b.ts (shares file with F-A.ac2).
  return [
    pr('test/a.test.ts', [{
      className: 'AT', featureClass: 'FA',
      methods: [
        { methodName: 't1', ac: 'ac1', targets: [{ file: 'src/a.ts', symbol: 'a' }] },
        { methodName: 't2', ac: 'ac2', targets: [{ file: 'src/b.ts', symbol: 'b' }] },
      ],
    }]),
    pr('test/b.test.ts', [{
      className: 'BT', featureClass: 'FB',
      methods: [
        { methodName: 't3', ac: 'ac3', targets: [{ file: 'src/b.ts', symbol: 'b' }] },
      ],
    }]),
  ];
}

function auditReport(): MutationReport {
  // Mutant m1 in src/a.ts: covered + killed by AT.t1 (F-A.ac1)
  // Mutant m2 in src/b.ts: covered by AT.t2 & BT.t3; killed only by BT.t3 → F-B.ac3 kills, F-A.ac2 misses
  // Mutant m3 in src/b.ts: covered by AT.t2 & BT.t3; survived (killed by neither)
  return {
    testFiles: {
      'test/a.test.ts': { tests: [{ id: '0', name: 'AT > t1' }, { id: '1', name: 'AT > t2' }] },
      'test/b.test.ts': { tests: [{ id: '2', name: 'BT > t3' }] },
    },
    files: {
      'src/a.ts': { mutants: [{ status: 'Killed', killedBy: ['0'], coveredBy: ['0'] }] },
      'src/b.ts': {
        mutants: [
          { status: 'Killed', killedBy: ['2'], coveredBy: ['1', '2'] },
          { status: 'Survived', killedBy: [], coveredBy: ['1', '2'] },
        ],
      },
    },
  };
}

@FeatureTest(BehavioralCheckFeature)
class AggregateByAcTests {
  @Verifies<BehavioralCheckFeature>('aggregatesEntriesAcrossEveryAcSeenInParseResults')
  'emits exactly one entry per AC seen in parseResults'() {
    const r = aggregateByAc(auditReport(), auditParseResults(), AUDIT_CLASS_TO_ID);
    expect(r.entries.map(e => e.acId)).toEqual(['F-A.ac1', 'F-A.ac2', 'F-B.ac3']);
  }

  @Verifies<BehavioralCheckFeature>('countsMutantAsKilledOnlyWhenKilledByOneOfAcOwnTests')
  'a mutant killed by a sister-AC test counts as Survived for the AC that did not kill it'() {
    const r = aggregateByAc(auditReport(), auditParseResults(), AUDIT_CLASS_TO_ID);
    const ac2 = r.entries.find(e => e.acId === 'F-A.ac2')!;
    const ac3 = r.entries.find(e => e.acId === 'F-B.ac3')!;
    // Both ACs cover src/b.ts mutants (m2 + m3), 2 mutants each.
    // ac3 killed m2, so killed=1, survived=1 (m3).
    // ac2 did NOT kill m2 (BT.t3 did), so for ac2 m2 counts as survived too.
    expect(ac3.killed).toBe(1);
    expect(ac3.survived).toBe(1);
    expect(ac2.killed).toBe(0);
    expect(ac2.survived).toBe(2);
  }

  @Verifies<BehavioralCheckFeature>('restrictsMutantsToFilesThatAcTouches')
  'an AC scope is restricted to mutants in files it targets'() {
    const r = aggregateByAc(auditReport(), auditParseResults(), AUDIT_CLASS_TO_ID);
    const ac1 = r.entries.find(e => e.acId === 'F-A.ac1')!;
    // ac1 only touches src/a.ts (1 mutant), not src/b.ts.
    expect(ac1.relevantTotal).toBe(1);
    expect(ac1.killed).toBe(1);
    expect(ac1.survived).toBe(0);
  }

  @Verifies<BehavioralCheckFeature>('restrictsMutantsToThoseCoveredByAcOwnTests')
  'mutants in a touched file but not coveredBy this AC are ignored'() {
    // Build a scenario: ac2 touches src/b.ts but a mutant there has coveredBy=[] (no AC covers it)
    const results = [
      pr('test/a.test.ts', [{
        className: 'AT', featureClass: 'FA',
        methods: [{ methodName: 't2', ac: 'ac2', targets: [{ file: 'src/b.ts', symbol: 'b' }] }],
      }]),
    ];
    const report: MutationReport = {
      testFiles: { 'test/a.test.ts': { tests: [{ id: '0', name: 'AT > t2' }] } },
      files: { 'src/b.ts': { mutants: [{ status: 'Survived', killedBy: [], coveredBy: [] }] } },
    };
    const r = aggregateByAc(report, results, new Map([['FA', 'F-A']]));
    const ac2 = r.entries.find(e => e.acId === 'F-A.ac2')!;
    expect(ac2.relevantTotal).toBe(0);
  }

  @Verifies<BehavioralCheckFeature>('marksAcVacuousWhenNoMutantIsRelevant')
  'an AC with no covered mutants in its files is verdict=vacuous'() {
    const results = [
      pr('test/a.test.ts', [{
        className: 'AT', featureClass: 'FA',
        methods: [{ methodName: 't1', ac: 'ac1', targets: [{ file: 'src/a.ts', symbol: 'a' }] }],
      }]),
    ];
    const report: MutationReport = {
      testFiles: { 'test/a.test.ts': { tests: [{ id: '0', name: 'AT > t1' }] } },
      files: {}, // no mutants at all
    };
    const r = aggregateByAc(report, results, new Map([['FA', 'F-A']]));
    expect(r.entries[0]!.verdict).toBe('vacuous');
    expect(r.entries[0]!.relevantTotal).toBe(0);
  }

  @Verifies<BehavioralCheckFeature>('returnsGlobalScoreOverAllRelevantMutants')
  'globalScore counts every relevant mutant across every AC (deduped per AC)'() {
    const r = aggregateByAc(auditReport(), auditParseResults(), AUDIT_CLASS_TO_ID);
    // Per-AC tallies:
    //   ac1: killed=1, survived=0, timeout=0
    //   ac2: killed=0, survived=2, timeout=0   (relevant=2)
    //   ac3: killed=1, survived=1, timeout=0   (relevant=2)
    // Global = sum: killed=2, survived=3, timeout=0 → score = 2/5 = 40%
    expect(r.globalKilled).toBe(2);
    expect(r.globalSurvived).toBe(3);
    expect(r.globalTimeout).toBe(0);
    expect(r.globalTotal).toBe(5);
    expect(r.globalMutationScorePercent).toBe(40);
  }

  @Verifies<BehavioralCheckFeature>('sortsAuditEntriesByAcId')
  'entries are sorted lexicographically by acId for deterministic output'() {
    const r = aggregateByAc(auditReport(), auditParseResults(), AUDIT_CLASS_TO_ID);
    const ids = r.entries.map(e => e.acId);
    expect([...ids].sort()).toEqual(ids);
  }
}

void AggregateByAcTests;


@FeatureTest(BehavioralCheckFeature)
class MutationBoundaryTests {
  @Verifies<BehavioralCheckFeature>('aggregatesEntriesAcrossEveryAcSeenInParseResults')
  mergesSeveralMethodsForTheSameAc() {
    const results=auditParseResults();
    results.push(pr('test/more.test.ts', [{className:'MoreTests',featureClass:'FA',methods:[{methodName:'sameAc',ac:'ac1',targets:[{file:'src/b.ts',symbol:'b'}]}]}]));
    const result=aggregateByAc(auditReport(),results,AUDIT_CLASS_TO_ID);
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0]?.mutateFiles).toEqual(['src/a.ts','src/b.ts']);
  }
  @Verifies<BehavioralCheckFeature>('marksAcVacuousWhenNoMutantIsRelevant')
  handlesReportBoundaryStates() {
    const installed = buildStrykerConfig(SAMPLE_PLAN, { repoRoot: process.cwd(), strictTypes: true });
    expect(installed.plugins).toHaveLength(2);
    const results = auditParseResults();
    expect(aggregateByAc({}, results, new Map()).globalTotal).toBe(0);
    const report: MutationReport = {
      testFiles: { empty: {}, a: { tests: [{ id: "0", name: "AT > t1" }] } },
      files: { "src/a.ts": { mutants: [
        { status: "Timeout", coveredBy: ["0", "unknown"] },
        { status: "RuntimeError", coveredBy: ["0"] },
        { status: "Ignored", coveredBy: ["0"] },
        { status: "Killed", coveredBy: ["0"], killedBy: ["missing"] },
        { status: "Survived" },
      ] }, "src/b.ts": {} },
    };
    const r = aggregateByAc(report, results, AUDIT_CLASS_TO_ID);
    expect(r.entries[0]).toMatchObject({ timeout: 1, survived: 1, relevantTotal: 2, mutationScorePercent: 50 });
    expect(r.globalMutationScorePercent).toBe(50);
    const invalidOnly = { ...report, files: { "src/a.ts": { mutants: [{ status: "CompileError", coveredBy: ["0"] }] } } };
    expect(aggregateByAc(invalidOnly, results, AUDIT_CLASS_TO_ID).entries[0]?.verdict).toBe("vacuous");
    expect(aggregateByAc({ files: { "src/a.ts": { mutants: [{ status: "Survived", coveredBy: ["0"] }] } } }, results, AUDIT_CLASS_TO_ID).globalTotal).toBe(0);
  }
}
void MutationBoundaryTests;
