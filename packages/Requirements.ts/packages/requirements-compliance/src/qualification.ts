/** Complete qualification is deliberately separate from static compliance analysis. */
export type QualificationPlatform = 'win32' | 'linux';
export type QualificationState = 'passed' | 'failed' | 'missing' | 'stale' | 'unknown';
export type QualificationStrategy = 'example' | 'property' | 'fuzz' | 'type';

/** Blocking policy. There is no switch for excluding Draft or disabled contracts. */
export interface QualificationPolicy {
  readonly platforms: readonly QualificationPlatform[];
  readonly coverageThreshold: 100;
  readonly mutationThreshold: 100;
  readonly propertyRuns: number;
  readonly fuzzRuns: number;
}

export const COMPLETE_QUALIFICATION_POLICY: QualificationPolicy = {
  platforms: ['win32', 'linux'], coverageThreshold: 100, mutationThreshold: 100,
  propertyRuns: 1_000, fuzzRuns: 10_000,
};

export interface QualificationDiagnostic {
  readonly code: string;
  readonly subject: string;
  readonly message: string;
}

/** Criteria retain their own identities, rather than inheriting a Feature's verdict. */
export interface QualificationCriterion {
  readonly id: string;
  readonly kind: string;
  readonly binds: readonly string[];
}

export interface QualificationRequirement {
  readonly id: string;
  readonly className: string;
  readonly file: string;
  readonly criteria: readonly QualificationCriterion[];
}

export interface QualificationFeature {
  readonly id: string;
  readonly className: string;
  readonly file: string;
  readonly satisfies: readonly string[];
  readonly enabled: boolean;
  readonly acs: readonly { readonly name: string; readonly levels: readonly string[] }[];
}

export interface QualificationTest {
  readonly id: string;
  readonly file: string;
  readonly className: string;
  readonly name: string;
  readonly feature: string;
  readonly ac: string;
  readonly level: string;
  readonly targets: readonly string[];
  readonly hasAssertion: boolean;
  readonly strategy: QualificationStrategy;
}

export interface QualificationInventory {
  readonly requirements: readonly QualificationRequirement[];
  readonly features: readonly QualificationFeature[];
  readonly tests: readonly QualificationTest[];
  readonly executableFiles: readonly string[];
  readonly hashes: Readonly<Record<string, string>>;
  readonly diagnostics: readonly QualificationDiagnostic[];
  /** Files with no own executable statements after TypeScript erasure. */
  readonly exclusions?: readonly { readonly file: string; readonly reason: 'declaration-only' | 'no-own-runtime-statements' }[];
  /** Explicit test-only import forwarding; class/name alone never determines a source file. */
  readonly testAliases?: Readonly<Record<string, readonly string[]>>;
}

export interface QualificationMetric { readonly total: number; readonly covered: number }
export type QualificationCoverage = Readonly<Record<'lines' | 'branches' | 'functions' | 'statements', QualificationMetric>>;
export type QualificationMutantStatus = 'Killed' | 'Timeout' | 'Survived' | 'NoCoverage' | 'CompileError' | 'RuntimeError' | 'Ignored' | 'Pending';

/** One platform's completed campaign, derived from retained individual runner results. */
export interface QualificationEvidence {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly platform: QualificationPlatform;
  readonly projectRoot: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly state: 'complete' | 'interrupted';
  readonly hashesBefore: Readonly<Record<string, string>>;
  readonly hashesAfter: Readonly<Record<string, string>>;
  readonly buildHashesBefore: Readonly<Record<string, string>>;
  readonly buildHashesAfter: Readonly<Record<string, string>>;
  readonly artifacts: Readonly<Record<string, string>>;
  readonly toolsBefore: Readonly<Record<string, string>>;
  readonly tools: Readonly<Record<string, string>>;
  readonly tests: readonly { readonly id: string; readonly status: string }[];
  readonly coverage: Readonly<Record<string, QualificationCoverage>>;
  readonly strategies: readonly {
    readonly testId: string; readonly strategy: 'property' | 'fuzz'; readonly runs: number;
    readonly seed: number; readonly status: string; readonly counterexample?: unknown;
  }[];
  readonly mutation: {
    readonly staticMutants: boolean;
    readonly incremental: boolean;
    readonly files: Readonly<Record<string, readonly QualificationMutantStatus[]>>;
  };
  readonly checks: Readonly<Record<'typecheck' | 'distribution' | 'orchestration', string>>;
}

export interface QualificationReport {
  readonly schemaVersion: 1;
  readonly mode: 'qualification';
  readonly policy: QualificationPolicy;
  readonly state: QualificationState;
  readonly complete: boolean;
  /** Full identities and inverse targets let consumers resolve every individual obligation. */
  readonly traceability: QualificationInventory;
  /** Selected campaign claims retain their raw-artifact links, counters and source fingerprints. */
  readonly evidence: readonly QualificationEvidence[];
  readonly inventory: { readonly requirements: number; readonly criteria: number; readonly features: number; readonly acs: number; readonly tests: number; readonly executableFiles: number };
  readonly platforms: readonly {
    readonly platform: QualificationPlatform; readonly runId: string | null; readonly passedTests: number;
    readonly coveredAcs: number; readonly verifiedCriteria: number;
    readonly mutation: { readonly killed: number; readonly timeout: number; readonly survived: number; readonly noCoverage: number; readonly errors: number; readonly ignored: number; readonly pending: number; readonly total: number; readonly score: number | null };
  }[];
  readonly diagnostics: readonly QualificationDiagnostic[];
}

/** Exact key and value comparison also catches added/deleted sources and stale configuration. */
export function equalQualificationHashes(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>): boolean {
  const keys = Object.keys(a);
  return keys.length > 0 && keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
}

/** Stable identity shared by the AST inventory, runner adapter and strategy evidence. */
export function qualificationTestId(file: string, className: string, name: string): string {
  return JSON.stringify([file.replaceAll('\\', '/'), className, name]);
}

/** Pure fail-closed evaluator. A passing test is evidence, never an inferred default. */
export function evaluateQualification(
  inventory: QualificationInventory,
  evidence: readonly QualificationEvidence[],
  policy: QualificationPolicy = COMPLETE_QUALIFICATION_POLICY,
): QualificationReport {
  const diagnostics = [...inventory.diagnostics];
  const add = (code: string, subject: string, message: string) => { diagnostics.push({ code, subject, message }); };
  const features = new Map(inventory.features.map(f => [f.className, f]));
  const requirements = new Map(inventory.requirements.map(r => [r.className, r]));
  const executable = new Set(inventory.executableFiles);
  if (!inventory.features.length || !inventory.requirements.length || !inventory.tests.length || !executable.size) add('empty-inventory', 'inventory', 'A complete qualification cannot have an empty contract, test or executable universe.');
  if (policy.platforms.length !== 2 || !policy.platforms.includes('win32') || !policy.platforms.includes('linux') || policy.coverageThreshold !== 100 || policy.mutationThreshold !== 100 || !Number.isInteger(policy.propertyRuns) || !Number.isInteger(policy.fuzzRuns) || policy.propertyRuns < 1000 || policy.fuzzRuns < 10000) add('invalid-policy', 'policy', 'Windows and Linux are mandatory and thresholds may not weaken the complete policy.');
  for (const feature of inventory.features) {
    if (!feature.acs.length) add('empty-feature', feature.id, 'A Feature must declare acceptance criteria.');
    if (!feature.satisfies.length || feature.satisfies.some(req => !requirements.has(req))) add('orphan-feature', feature.id, 'Every Feature must resolve its Requirement links.');
    for (const ac of feature.acs) {
      if (!ac.levels.length) add('empty-levels', `${feature.id}.${ac.name}`, 'At least one verification level is required.');
      for (const level of ac.levels) if (!inventory.tests.some(t => t.feature === feature.className && t.ac === ac.name && t.level === level)) add('declared-ac-gap', `${feature.id}.${ac.name}:${level}`, 'No decorated test declares this mandatory AC/level, including disabled Features.');
    }
  }
  for (const requirement of inventory.requirements) {
    if (!inventory.features.some(f => f.satisfies.includes(requirement.className))) add('orphan-requirement', requirement.id, 'Every declared Requirement needs a Feature, including Draft Requirements.');
    if (!requirement.criteria.length) add('missing-criteria', requirement.id, 'Every Requirement needs independently evaluated criteria.');
    for (const criterion of requirement.criteria) {
      const linked = inventory.features.filter(f => f.satisfies.includes(requirement.className));
      if (criterion.kind !== 'unit-test' || !criterion.binds.length) add('non-executable-criterion', criterion.id, 'Reformulate this criterion as an automated AC contract and retain its migration provenance.');
      for (const ac of criterion.binds) if (!linked.some(f => f.acs.some(a => a.name === ac))) add('unresolved-criterion', criterion.id, `Criterion AC ${ac} does not belong to a Feature satisfying this Requirement.`);
    }
  }
  for (const test of inventory.tests) {
    const feature = features.get(test.feature);
    if (!feature?.acs.some(ac => ac.name === test.ac)) add('invalid-binding', test.id, 'The referenced Feature/AC does not exist.');
    if (!test.hasAssertion) add('missing-assertion', test.id, 'The test needs an assertion, including assertions reached through helpers.');
    if (test.strategy !== 'type' && !test.targets.some(file => executable.has(file))) add('missing-target', test.id, 'The test must reach executable product code.');
  }
  for (const file of executable) if (!inventory.tests.some(t => t.targets.includes(file))) add('orphan-code', file, 'Executable product code has no decorated test target.');
  const platforms: QualificationReport['platforms'][number][] = [];
  for (const platform of policy.platforms) {
    const matches = evidence.filter(e => e.platform === platform);
    const run = matches[0];
    const mutation = { killed: 0, timeout: 0, survived: 0, noCoverage: 0, errors: 0, ignored: 0, pending: 0, total: 0, score: null as number | null };
    const row = { platform, runId: run?.runId ?? null, passedTests: 0, coveredAcs: 0, verifiedCriteria: 0, mutation };
    platforms.push(row);
    if (!run) { add('missing-platform', platform, 'No completed platform evidence.'); continue; }
    if (matches.length !== 1) add('ambiguous-evidence', platform, 'Exactly one campaign per platform must be selected.');
    if (run.schemaVersion !== 1 || !run.runId || run.state !== 'complete' || !Number.isFinite(Date.parse(run.startedAt)) || !Number.isFinite(Date.parse(run.completedAt)) || Date.parse(run.completedAt) < Date.parse(run.startedAt)) add('incomplete-campaign', platform, 'Campaign identity, schema, lifecycle and timestamps must be valid.');
    if (!equalQualificationHashes(inventory.hashes, run.hashesBefore) || !equalQualificationHashes(run.hashesBefore, run.hashesAfter)) add('stale-evidence', platform, 'Inputs changed, disappeared or were added before/after this campaign.');
    if (!equalQualificationHashes(run.buildHashesBefore, run.buildHashesAfter)) add('changed-build', platform, 'Built artifacts changed, disappeared or were added during this campaign.');
    if (!equalQualificationHashes(run.toolsBefore, run.tools)) add('changed-tools', platform, 'Tool versions must be identified and stable throughout the campaign.');
    if (!Object.keys(run.artifacts).length || !Object.values(run.artifacts).every(hash => /^[a-f0-9]{64}$/.test(hash))) add('missing-artifacts', platform, 'Retain SHA-256 identified built artifacts and raw reports.');
    for (const tool of ['node', 'typescript', 'vitest', 'stryker']) if (!run.tools[tool]) add('missing-tool', `${platform}:${tool}`, 'Record the actual tool version.');
    const passing = new Set<string>();
    for (const test of inventory.tests) {
      const results = run.tests.filter(t => t.id === test.id);
      if (!results.length || results.some(t => t.status !== 'passed')) add('test-not-passed', `${platform}:${test.id}`, 'Every decorated test must have an individual passing execution; ignored tests do not qualify.');
      else passing.add(test.id);
    }
    for (const result of run.tests) {
      if (!inventory.tests.some(t => t.id === result.id)) add('unbound-result', `${platform}:${result.id}`, 'Runner result has no declared test contract.');
    }
    row.passedTests = passing.size;
    const covered = new Set<string>();
    for (const feature of inventory.features) for (const ac of feature.acs) {
      const key = `${feature.className}.${ac.name}`;
      if (ac.levels.every(level => inventory.tests.some(t => t.feature === feature.className && t.ac === ac.name && t.level === level && passing.has(t.id)))) { covered.add(key); row.coveredAcs++; }
      else add('ac-gap', `${platform}:${feature.id}.${ac.name}`, 'All declared levels must pass, including disabled Features.');
    }
    for (const requirement of inventory.requirements) for (const criterion of requirement.criteria) {
      if (criterion.kind === 'unit-test' && criterion.binds.length && criterion.binds.every(ac => inventory.features.some(f => f.satisfies.includes(requirement.className) && covered.has(`${f.className}.${ac}`)))) row.verifiedCriteria++;
      else add('criterion-gap', `${platform}:${criterion.id}`, 'Criterion has no complete individual execution proof.');
    }
    for (const file of executable) {
      const coverage = run.coverage[file];
      if (!coverage) { add('missing-coverage', `${platform}:${file}`, 'Every executable file needs coverage, including CLI and scripts.'); continue; }
      for (const metric of ['lines', 'branches', 'functions', 'statements'] as const) {
        const counter = coverage[metric];
        if (!counter || !Number.isInteger(counter.total) || !Number.isInteger(counter.covered) || counter.total < 0 || counter.covered !== counter.total) add('coverage-gap', `${platform}:${file}:${metric}`, 'Coverage counters must establish exactly 100%.');
      }
      if (coverage.lines?.total === 0 && coverage.statements?.total === 0) add('empty-coverage', `${platform}:${file}`, 'Executable code cannot qualify with an empty coverage denominator.');
    }
    for (const test of inventory.tests.filter(t => t.strategy === 'property' || t.strategy === 'fuzz')) {
      const expected = test.strategy === 'property' ? policy.propertyRuns : policy.fuzzRuns;
      const entries = run.strategies.filter(s => s.testId === test.id && s.strategy === test.strategy);
      if (!entries.length || entries.some(s => s.status !== 'passed' || !Number.isInteger(s.seed) || !Number.isInteger(s.runs) || s.runs < expected || s.counterexample !== undefined)) add('strategy-gap', `${platform}:${test.id}`, 'Retain successful executed samples, seed and any minimized counterexample.');
    }
    for (const strategy of run.strategies) if (!inventory.tests.some(test => test.id === strategy.testId && test.strategy === strategy.strategy)) add('unbound-strategy', `${platform}:${strategy.testId}`, 'Random campaign proof has no matching declared test and strategy.');
    for (const strategy of ['property', 'fuzz'] as const) if (!inventory.tests.some(t => t.strategy === strategy)) add('missing-strategy', platform, `No ${strategy} test target is declared.`);
    if (!run.mutation.staticMutants || run.mutation.incremental) add('partial-mutation', platform, 'Final mutation campaigns include static mutants and disable incremental reuse.');
    for (const file of executable) {
      const mutants = run.mutation.files[file];
      if (!mutants) { add('missing-mutation', `${platform}:${file}`, 'The mutation campaign must inventory every executable file.'); continue; }
      for (const status of mutants) {
        mutation.total++;
        if (status === 'Killed') mutation.killed++;
        else if (status === 'Timeout') mutation.timeout++;
        else if (status === 'Survived') mutation.survived++;
        else if (status === 'NoCoverage') mutation.noCoverage++;
        else if (status === 'CompileError' || status === 'RuntimeError') mutation.errors++;
        else if (status === 'Ignored') mutation.ignored++;
        else mutation.pending++;
      }
    }
    const denominator = mutation.killed + mutation.timeout + mutation.survived + mutation.noCoverage;
    mutation.score = denominator ? 100 * (mutation.killed + mutation.timeout) / denominator : null;
    if (mutation.score !== 100 || mutation.errors || mutation.ignored || mutation.pending) add('mutation-gap', platform, 'Require the standard Stryker score of 100%, no ignored/error/pending mutants; empty campaigns are not success.');
    for (const check of ['typecheck', 'distribution', 'orchestration'] as const) if (run.checks[check] !== 'passed') add('check-gap', `${platform}:${check}`, 'This independent check must complete successfully.');
  }
  return {
    schemaVersion: 1, mode: 'qualification', policy, state: diagnostics.length ? 'failed' : 'passed', complete: diagnostics.length === 0,
    traceability: inventory, evidence,
    inventory: { requirements: inventory.requirements.length, criteria: inventory.requirements.reduce((n, r) => n + r.criteria.length, 0), features: inventory.features.length, acs: inventory.features.reduce((n, f) => n + f.acs.length, 0), tests: inventory.tests.length, executableFiles: executable.size },
    platforms, diagnostics,
  };
}
