import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { QualificationFeature } from '../../../requirements-requirements/src/qualification-contracts.js';
import {
  evaluateQualification, equalQualificationHashes, qualificationTestId,
  COMPLETE_QUALIFICATION_POLICY, type QualificationPolicy,
  type QualificationInventory, type QualificationEvidence, type QualificationPlatform,
} from '../../src/qualification.js';

/** A one-function independent product oracle; no report is copied from evaluator output. */
function fixture() {
  const id = qualificationTestId('test/unit/value.test.ts', 'ValueTests', 'accepts');
  const inventory: QualificationInventory = {
    requirements: [{ id: 'REQ-VALUE', className: 'ValueRequirement', file: 'spec/value.ts', criteria: [{ id: 'REQ-VALUE:fit:1', kind: 'unit-test', binds: ['accepts'] }] }],
    features: [{ id: 'VALUE', className: 'ValueFeature', file: 'spec/value.ts', satisfies: ['ValueRequirement'], enabled: false, acs: [{ name: 'accepts', levels: ['unit'] }] }],
    tests: [
      { id, file: 'test/unit/value.test.ts', className: 'ValueTests', name: 'accepts', feature: 'ValueFeature', ac: 'accepts', level: 'unit', targets: ['src/value.ts'], hasAssertion: true, strategy: 'property' },
      { id: 'fuzz', file: 'test/unit/value-fuzz.test.ts', className: 'ValueFuzzTests', name: 'rejects', feature: 'ValueFeature', ac: 'accepts', level: 'unit', targets: ['src/value.ts'], hasAssertion: true, strategy: 'fuzz' },
    ],
    executableFiles: ['src/value.ts'], hashes: { 'src/value.ts': 'a'.repeat(64) }, diagnostics: [],
  };
  const platform = (platform: QualificationPlatform): QualificationEvidence => ({
    schemaVersion: 1, runId: 'independent-fixture', platform, projectRoot: platform === 'win32' ? 'C:/fixture' : '/fixture',
    startedAt: '2026-11-03T00:00:00Z', completedAt: '2026-11-03T00:01:00Z', state: 'complete',
    hashesBefore: { ...inventory.hashes }, hashesAfter: { ...inventory.hashes }, artifacts: { 'dist/value.js': 'b'.repeat(64) },
    buildHashesBefore: { 'dist/value.js': 'b'.repeat(64) }, buildHashesAfter: { 'dist/value.js': 'b'.repeat(64) },
    toolsBefore: { node: '26', typescript: '5.9.3', vitest: '5', stryker: '9' },
    tools: { node: '26', typescript: '5.9.3', vitest: '5', stryker: '9' },
    tests: [{ id, status: 'passed' }, { id: 'fuzz', status: 'passed' }],
    coverage: { 'src/value.ts': { lines: { total: 1, covered: 1 }, branches: { total: 2, covered: 2 }, functions: { total: 1, covered: 1 }, statements: { total: 1, covered: 1 } } },
    strategies: [{ testId: id, strategy: 'property', runs: 1000, seed: 42, status: 'passed' }, { testId: 'fuzz', strategy: 'fuzz', runs: 10000, seed: 71, status: 'passed' }],
    mutation: { staticMutants: true, incremental: false, files: { 'src/value.ts': ['Killed', 'Timeout'] } },
    checks: { typecheck: 'passed', distribution: 'passed', orchestration: 'passed' },
  });
  return { inventory, evidence: [platform('win32'), platform('linux')] };
}

function codes(inventory: QualificationInventory, evidence: QualificationEvidence[]) {
  const report = evaluateQualification(inventory, evidence);
  const diagnostics = report.diagnostics;
  expect(report.state).toBe(diagnostics.length ? 'failed' : 'passed');
  for (const diagnostic of diagnostics) {
    expect(diagnostic.code.trim().length).toBeGreaterThan(0);
    expect(diagnostic.subject.trim().length).toBeGreaterThan(0);
    expect(diagnostic.message.trim().length).toBeGreaterThan(0);
  }
  return diagnostics.map(d => d.code);
}

@FeatureTest(QualificationFeature)
class QualificationTests {
  @Verifies<QualificationFeature>('requiresAllLevelsIncludingDisabled')
  verifiesDisabledFeaturesWithoutRemovingTheirObligations() {
    const { inventory, evidence } = fixture();
    const report = evaluateQualification(inventory, evidence);
    expect(report.complete).toBe(true);
    expect(report.state).toBe('passed');
    expect(report.inventory).toEqual({ requirements: 1, criteria: 1, features: 1, acs: 1, tests: 2, executableFiles: 1 });
    expect(report.platforms.map(p => [p.coveredAcs, p.verifiedCriteria])).toEqual([[1, 1], [1, 1]]);
    expect(report.schemaVersion).toBe(1);
    expect(report.mode).toBe('qualification');
    expect(report.traceability).toEqual(inventory);
    expect(report.evidence).toEqual(evidence);
    expect(report.policy).toEqual({ platforms: ['win32', 'linux'], coverageThreshold: 100, mutationThreshold: 100, propertyRuns: 1000, fuzzRuns: 10000 });
    expect(report.platforms.map(p => [p.platform, p.runId, p.passedTests])).toEqual([['win32', 'independent-fixture', 2], ['linux', 'independent-fixture', 2]]);
    const withE2e = { ...inventory, features: [{ ...inventory.features[0]!, acs: [{ name: 'accepts', levels: ['unit', 'e2e'] }] }] };
    expect(codes(withE2e, evidence)).toContain('ac-gap');
    expect(codes(withE2e, evidence)).toContain('criterion-gap');
  }

  @Verifies<QualificationFeature>('rejectsEmptyOrContradictoryInventory')
  eachPolicyConstraintBlocksIndependently() {
    const { inventory, evidence } = fixture();
    const changes = [
      { platforms: ['win32', 'linux', 'win32'] }, { platforms: ['linux', 'linux'] }, { platforms: ['win32', 'win32'] },
      { coverageThreshold: 99 }, { mutationThreshold: 99 },
      { propertyRuns: 1000.5 }, { fuzzRuns: 10000.5 }, { propertyRuns: 999 }, { fuzzRuns: 9999 },
    ];
    for (const change of changes) {
      const report = evaluateQualification(inventory, evidence, { ...COMPLETE_QUALIFICATION_POLICY, ...change } as QualificationPolicy);
      expect(report.diagnostics).toContainEqual({ code: 'invalid-policy', subject: 'policy', message: 'Windows and Linux are mandatory and thresholds may not weaken the complete policy.' });
      expect(report.complete).toBe(false);
    }
    for (const empty of [{ features: [] }, { requirements: [] }, { tests: [] }, { executableFiles: [] }]) {
      const report = evaluateQualification({ ...inventory, ...empty }, evidence);
      expect(report.diagnostics).toContainEqual({ code: 'empty-inventory', subject: 'inventory', message: 'A complete qualification cannot have an empty contract, test or executable universe.' });
    }
    const mixedLinks = { ...inventory, features: [{ ...inventory.features[0]!, satisfies: ['ValueRequirement', 'AbsentRequirement'] }] };
    expect(codes(mixedLinks, evidence)).toContain('orphan-feature');
  }

  @Verifies<QualificationFeature>('verifiesEveryDeclaredCriterion')
  multipleValidSatisfiersAcsLevelsAndImplementationsQualifyTogether() {
    const { inventory, evidence } = fixture();
    const tests = [
      ...inventory.tests,
      { ...inventory.tests[0]!, id: 'second-ac', name: 'second', ac: 'secondAc', level: 'e2e', targets: ['src/other.ts'], strategy: 'example' as const },
      { ...inventory.tests[0]!, id: 'other-feature', name: 'other', feature: 'OtherFeature', ac: 'otherAc', targets: ['src/other.ts'], strategy: 'example' as const },
    ];
    const hash = { ...inventory.hashes, 'src/other.ts': 'c'.repeat(64) };
    const joined: QualificationInventory = {
      ...inventory, tests, hashes: hash, executableFiles: [...inventory.executableFiles, 'src/other.ts'],
      requirements: [
        { ...inventory.requirements[0]!, criteria: [{ id: 'both', kind: 'unit-test', binds: ['accepts', 'secondAc'] }] },
        { id: 'REQ-OTHER', className: 'OtherRequirement', file: 'spec/other.ts', criteria: [{ id: 'other', kind: 'unit-test', binds: ['otherAc'] }] },
      ],
      features: [
        { ...inventory.features[0]!, acs: [...inventory.features[0]!.acs, { name: 'secondAc', levels: ['e2e'] }] },
        { id: 'OTHER', className: 'OtherFeature', file: 'spec/other.ts', enabled: true, satisfies: ['OtherRequirement', 'ValueRequirement'], acs: [{ name: 'otherAc', levels: ['unit'] }] },
      ],
    };
    const proofs = evidence.map(run => ({ ...run, hashesBefore: hash, hashesAfter: hash,
      tests: [...run.tests, { id: 'second-ac', status: 'passed' }, { id: 'other-feature', status: 'passed' }],
      coverage: { ...run.coverage, 'src/other.ts': run.coverage['src/value.ts']! },
      mutation: { ...run.mutation, files: { ...run.mutation.files, 'src/other.ts': ['Killed' as const] } },
    }));
    const report = evaluateQualification(joined, proofs);
    expect(report.diagnostics).toEqual([]);
    expect(report.complete).toBe(true);
    expect(report.platforms.map(row => [row.coveredAcs, row.verifiedCriteria, row.passedTests])).toEqual([[3, 2, 4], [3, 2, 4]]);
    const misspelled = { ...joined, tests: tests.map(test => test.id === 'second-ac' ? { ...test, ac: 'typo' } : test) };
    expect(codes(misspelled, proofs)).toContain('invalid-binding');
  }

  @Verifies<QualificationFeature>('requiresAllLevelsIncludingDisabled')
  aDifferentFeatureAcOrLevelCannotFillADeclaredObligation() {
    const { inventory, evidence } = fixture();
    for (const change of [{ feature: 'OtherFeature' }, { ac: 'otherAc' }, { level: 'e2e' }]) {
      const changed = { ...inventory, tests: inventory.tests.map(test => ({ ...test, ...change })) };
      const report = evaluateQualification(changed, evidence);
      expect(report.diagnostics).toContainEqual({ code: 'declared-ac-gap', subject: 'VALUE.accepts:unit', message: 'No decorated test declares this mandatory AC/level, including disabled Features.' });
      expect(report.platforms.map(row => row.coveredAcs)).toEqual([0, 0]);
      expect(report.platforms.map(row => row.verifiedCriteria)).toEqual([0, 0]);
      expect(report.diagnostics).toContainEqual({ code: 'ac-gap', subject: 'win32:VALUE.accepts', message: 'All declared levels must pass, including disabled Features.' });
    }
    const failed = { ...evidence[0]!, tests: evidence[0]!.tests.map(test => ({ ...test, status: 'failed' })) };
    expect(evaluateQualification(inventory, [failed, evidence[1]!]).platforms.map(row => row.passedTests)).toEqual([0, 2]);
  }

  @Verifies<QualificationFeature>('verifiesEveryDeclaredCriterion')
  multipleRequirementsAndFeaturesKeepTheirOwnCriteriaAndTargets() {
    const { inventory, evidence } = fixture();
    const wrongFeature = { ...inventory.features[0]!, id: 'OTHER', className: 'OtherFeature', satisfies: ['MissingRequirement'] };
    const invalid = { ...inventory, features: [{ ...inventory.features[0]!, acs: [{ name: 'differentAc', levels: ['unit'] }] }, wrongFeature] };
    expect(codes(invalid, evidence)).toContain('unresolved-criterion');
    expect(evaluateQualification(invalid, evidence).platforms.map(row => row.verifiedCriteria)).toEqual([0, 0]);
    const noBindings = { ...inventory, requirements: [{ ...inventory.requirements[0]!, criteria: [{ id: 'REQ-VALUE:fit:1', kind: 'unit-test', binds: [] }] }] };
    expect(codes(noBindings, evidence)).toContain('non-executable-criterion');
    const secondFile = { ...inventory, executableFiles: ['src/value.ts', 'src/untested.ts'] };
    expect(evaluateQualification(secondFile, evidence).diagnostics).toContainEqual({ code: 'orphan-code', subject: 'src/untested.ts', message: 'Executable product code has no decorated test target.' });
    const unrelated = { ...inventory, features: [...inventory.features, { ...wrongFeature, acs: [] }] };
    expect(evaluateQualification(unrelated, evidence).platforms.map(row => row.verifiedCriteria)).toEqual([1, 1]);
    const multi = { ...inventory, requirements: [{ ...inventory.requirements[0]!, criteria: [{ id: 'both', kind: 'unit-test', binds: ['accepts', 'otherAc'] }] }], features: [{ ...inventory.features[0]!, acs: [...inventory.features[0]!.acs, { name: 'otherAc', levels: ['e2e'] }] }] };
    expect(evaluateQualification(multi, evidence).platforms.map(row => row.verifiedCriteria)).toEqual([0, 0]);
    const manualWithBinding = { ...inventory, requirements: [{ ...inventory.requirements[0]!, criteria: [{ id: 'manual', kind: 'inspection', binds: ['accepts'] }] }] };
    expect(evaluateQualification(manualWithBinding, evidence).platforms.map(row => row.verifiedCriteria)).toEqual([0, 0]);
    expect(codes(manualWithBinding, evidence)).toContain('non-executable-criterion');
  }

  @Verifies<QualificationFeature>('rejectsMissingStaleOrInterruptedProof')
  identifiesEachLifecycleHashAndArtifactFaultIndependently() {
    const { inventory, evidence } = fixture();
    const current = evidence[0]!;
    expect(evaluateQualification(inventory, [{ ...current, completedAt: current.startedAt }, evidence[1]!]).complete).toBe(true);
    expect(codes(inventory, [{ ...current, hashesAfter: {} }, evidence[1]!])).toContain('stale-evidence');
    expect(codes(inventory, [{ ...current, schemaVersion: 2 } as unknown as QualificationEvidence, evidence[1]!])).toContain('incomplete-campaign');
    const invalidArtifacts: Record<string, string>[] = [
      { valid: 'a'.repeat(64), invalid: 'invalid' },
      { invalid: 'x' + 'a'.repeat(64) }, { invalid: 'a'.repeat(64) + 'x' },
    ];
    for (const artifacts of invalidArtifacts) expect(codes(inventory, [{ ...current, artifacts }, evidence[1]!])).toContain('missing-artifacts');
    for (const tool of ['node', 'typescript', 'vitest', 'stryker']) {
      const tools = { ...current.tools }; delete tools[tool];
      expect(evaluateQualification(inventory, [{ ...current, tools }, evidence[1]!]).diagnostics).toContainEqual({ code: 'missing-tool', subject: `win32:${tool}`, message: 'Record the actual tool version.' });
    }
    const buildChanges: Partial<QualificationEvidence>[] = [{ buildHashesBefore: {} }, { buildHashesAfter: {} }, { buildHashesAfter: { added: 'c'.repeat(64) } }];
    for (const change of buildChanges) expect(codes(inventory, [{ ...current, ...change }, evidence[1]!])).toContain('changed-build');
    for (const change of [{ toolsBefore: {} }, { tools: { ...current.tools, node: 'other-version' } }]) expect(codes(inventory, [{ ...current, ...change }, evidence[1]!])).toContain('changed-tools');
  }

  @Verifies<QualificationFeature>('matchesRunnerProofWithoutInferringSuccess')
  onePassingResultCannotHideAnAbsentOrFailedIndividualExecution() {
    const { inventory, evidence } = fixture();
    const id = inventory.tests[0]!.id;
    for (const results of [
      [{ id, status: 'passed' }],
      [{ id, status: 'passed' }, { id: 'fuzz', status: 'passed' }, { id: 'fuzz', status: 'failed' }],
    ]) {
      const report = evaluateQualification(inventory, [{ ...evidence[0]!, tests: results }, evidence[1]!]);
      expect(report.platforms.map(row => row.passedTests)).toEqual([1, 2]);
      expect(report.diagnostics).toContainEqual({ code: 'test-not-passed', subject: 'win32:fuzz', message: 'Every decorated test must have an individual passing execution; ignored tests do not qualify.' });
      expect(report.diagnostics.some(d => d.code === 'test-not-passed' && d.subject === `win32:${id}`)).toBe(false);
    }
    const report = evaluateQualification(inventory, [{ ...evidence[0]!, tests: [...evidence[0]!.tests, { id: 'unknown', status: 'passed' }] }, evidence[1]!]);
    expect(report.diagnostics).toContainEqual({ code: 'unbound-result', subject: 'win32:unknown', message: 'Runner result has no declared test contract.' });
    expect(report.platforms[0]!.passedTests).toBe(2);
  }

  @Verifies<QualificationFeature>('requiresReplayableStrategies')
  distinguishesStrategyIdentityBudgetAndEveryAttempt() {
    const { inventory, evidence } = fixture();
    const current = evidence[0]!;
    for (const entry of current.strategies) {
      for (const change of [{ runs: entry.strategy === 'fuzz' ? 9999 : 999 }, { testId: 'unknown' }, { strategy: entry.strategy === 'fuzz' ? 'property' as const : 'fuzz' as const }]) {
        const strategies = current.strategies.map(item => item === entry ? { ...item, ...change } : item);
        expect(evaluateQualification(inventory, [{ ...current, strategies }, evidence[1]!]).diagnostics).toContainEqual({ code: 'strategy-gap', subject: `win32:${entry.testId}`, message: 'Retain successful executed samples, seed and any minimized counterexample.' });
      }
      const strategies = [...current.strategies, { ...entry, status: 'failed' }];
      expect(codes(inventory, [{ ...current, strategies }, evidence[1]!])).toContain('strategy-gap');
    }
    const example = { ...inventory.tests[0]!, id: 'example', name: 'example', strategy: 'example' as const };
    const withExample = { ...inventory, tests: [...inventory.tests, example] };
    const withProof = evidence.map(run => ({ ...run, tests: [...run.tests, { id: 'example', status: 'passed' }] }));
    expect(evaluateQualification(withExample, withProof).complete).toBe(true);
    for (const change of [{ testId: 'unknown' }, { strategy: 'fuzz' as const }]) {
      const strategies = [...current.strategies, { ...current.strategies[0]!, ...change }];
      expect(codes(inventory, [{ ...current, strategies }, evidence[1]!])).toContain('unbound-strategy');
    }
  }

  @Verifies<QualificationFeature>('requiresCompleteCoverage')
  acceptsInapplicableBranchDenominatorsAndRejectsMissingMetrics() {
    const { inventory, evidence } = fixture();
    const full = evidence[0]!.coverage['src/value.ts']!;
    const noBranches = evidence.map(run => ({ ...run, coverage: { 'src/value.ts': { ...full, branches: { total: 0, covered: 0 } } } }));
    expect(evaluateQualification(inventory, noBranches).complete).toBe(true);
    for (const metric of ['lines', 'branches', 'functions', 'statements'] as const) {
      const missing: Partial<typeof full> = { ...full }; delete missing[metric];
      if (metric === 'statements') Object.assign(missing, { lines: { total: 0, covered: 0 } });
      const coverage = { 'src/value.ts': missing } as QualificationEvidence['coverage'];
      expect(codes(inventory, [{ ...evidence[0]!, coverage }, evidence[1]!])).toContain('coverage-gap');
    }
    const noLines = evidence.map(run => ({ ...run, coverage: { 'src/value.ts': { ...full, lines: { total: 0, covered: 0 } } } }));
    const noStatements = evidence.map(run => ({ ...run, coverage: { 'src/value.ts': { ...full, statements: { total: 0, covered: 0 } } } }));
    expect(evaluateQualification(inventory, noLines).diagnostics.map(d => d.code)).not.toContain('empty-coverage');
    expect(evaluateQualification(inventory, noStatements).diagnostics.map(d => d.code)).not.toContain('empty-coverage');
  }

  @Verifies<QualificationFeature>('interpretsStrykerWithoutVacuousSuccess')
  keepsEveryMutantCounterAndTheStandardDenominatorObservable() {
    const { inventory, evidence } = fixture();
    const statuses = ['Killed', 'Timeout', 'Survived', 'NoCoverage', 'CompileError', 'RuntimeError', 'Ignored', 'Pending'] as const;
    const mutation = { ...evidence[0]!.mutation, files: { 'src/value.ts': statuses } };
    const report = evaluateQualification(inventory, [{ ...evidence[0]!, mutation }, evidence[1]!]);
    expect(report.platforms[0]!.mutation).toEqual({ killed: 1, timeout: 1, survived: 1, noCoverage: 1, errors: 2, ignored: 1, pending: 1, total: 8, score: 50 });
    for (const status of statuses) {
      const mutation = { ...evidence[0]!.mutation, files: { 'src/value.ts': [status] } };
      const counter = evaluateQualification(inventory, [{ ...evidence[0]!, mutation }, evidence[1]!]).platforms[0]!.mutation;
      const field = ({ Killed: 'killed', Timeout: 'timeout', Survived: 'survived', NoCoverage: 'noCoverage', CompileError: 'errors', RuntimeError: 'errors', Ignored: 'ignored', Pending: 'pending' } as const)[status];
      expect(counter).toEqual({ killed: 0, timeout: 0, survived: 0, noCoverage: 0, errors: 0, ignored: 0, pending: 0, total: 1, score: ['Killed', 'Timeout'].includes(status) ? 100 : ['Survived', 'NoCoverage'].includes(status) ? 0 : null, [field]: 1 });
    }
    const empty = { ...mutation, files: { 'src/value.ts': [] } };
    expect(evaluateQualification(inventory, [{ ...evidence[0]!, mutation: empty }, evidence[1]!]).platforms[0]!.mutation.score).toBeNull();
  }

  @Verifies<QualificationFeature>('rejectsEmptyOrContradictoryInventory')
  rejectsEmptyInventoriesAndWeakenedPolicies() {
    const { inventory, evidence } = fixture();
    expect(codes({ ...inventory, features: [] }, evidence)).toContain('empty-inventory');
    expect(codes({ ...inventory, requirements: [] }, evidence)).toContain('orphan-feature');
    expect(codes({ ...inventory, features: [{ ...inventory.features[0]!, acs: [], satisfies: [] }] }, evidence)).toEqual(expect.arrayContaining(['empty-feature', 'orphan-feature', 'orphan-requirement']));
    expect(codes({ ...inventory, features: [{ ...inventory.features[0]!, acs: [{ name: 'accepts', levels: [] }] }] }, evidence)).toContain('empty-levels');
    expect(codes({ ...inventory, diagnostics: [{ code: 'duplicate-contract', subject: 'fixture', message: 'conflict' }] }, evidence)).toContain('duplicate-contract');
    expect(evaluateQualification(inventory, evidence, { platforms: [], coverageThreshold: 100, mutationThreshold: 100, propertyRuns: 1, fuzzRuns: 1 }).complete).toBe(false);
  }

  @Verifies<QualificationFeature>('verifiesEveryDeclaredCriterion')
  rejectsUnresolvedManualAndAbsentCriteria() {
    const { inventory, evidence } = fixture();
    const requirement = inventory.requirements[0]!;
    expect(codes({ ...inventory, requirements: [{ ...requirement, criteria: [] }] }, evidence)).toContain('missing-criteria');
    expect(codes({ ...inventory, requirements: [{ ...requirement, criteria: [{ id: 'inspection', kind: 'inspection', binds: [] }] }] }, evidence)).toEqual(expect.arrayContaining(['non-executable-criterion', 'criterion-gap']));
    expect(codes({ ...inventory, requirements: [{ ...requirement, criteria: [{ id: 'bad-reference', kind: 'unit-test', binds: ['missingAc'] }] }] }, evidence)).toContain('unresolved-criterion');
  }

  @Verifies<QualificationFeature>('rejectsUnboundOrAssertionlessTests')
  rejectsOrphanCodeAndTestsAndMissingAssertions() {
    const { inventory, evidence } = fixture();
    const invalid = { ...inventory, tests: [{ ...inventory.tests[0]!, feature: 'MissingFeature', targets: [], hasAssertion: false }] };
    expect(codes(invalid, evidence)).toEqual(expect.arrayContaining(['invalid-binding', 'missing-assertion', 'missing-target', 'orphan-code', 'unbound-result']));
    expect(codes({ ...inventory, tests: [{ ...inventory.tests[0]!, strategy: 'type' as const, targets: [] }] }, evidence)).not.toContain('missing-target');
    for (const status of ['failed', 'pending', 'skipped', 'unknown']) {
      const run = { ...evidence[0]!, tests: [{ id: inventory.tests[0]!.id, status }] };
      expect(codes(inventory, [run, evidence[1]!])).toContain('test-not-passed');
    }
    expect(codes(inventory, [{ ...evidence[0]!, tests: [] }, evidence[1]!])).toContain('test-not-passed');
  }

  @Verifies<QualificationFeature>('rejectsMissingStaleOrInterruptedProof')
  rejectsChangedAddedDeletedAndIncompleteEvidence() {
    const { inventory, evidence } = fixture();
    expect(equalQualificationHashes({}, {})).toBe(false);
    expect(equalQualificationHashes({ a: 'one' }, { a: 'one', b: 'two' })).toBe(false);
    expect(equalQualificationHashes({ a: 'one' }, { b: 'one' })).toBe(false);
    expect(qualificationTestId('a\\b', 'Class', 'Name')).toBe('["a/b","Class","Name"]');
    const changes: Partial<QualificationEvidence>[] = [
      { hashesBefore: {} }, { hashesAfter: {} }, { state: 'interrupted' as const },
      { startedAt: 'invalid' }, { completedAt: 'invalid' }, { completedAt: '2020-01-01' },
      { runId: '' }, { artifacts: {} }, { artifacts: { report: 'invalid hash' } }, { tools: {} },
    ];
    for (const change of changes) expect(evaluateQualification(inventory, [{ ...evidence[0]!, ...change }, evidence[1]!]).complete).toBe(false);
  }

  @Verifies<QualificationFeature>('requiresCompleteCoverage')
  rejectsMissingUncoveredNegativeAndEmptyCoverageCounters() {
    const { inventory, evidence } = fixture();
    expect(codes(inventory, [{ ...evidence[0]!, coverage: {} }, evidence[1]!])).toContain('missing-coverage');
    const full = evidence[0]!.coverage['src/value.ts']!;
    for (const metric of ['lines', 'branches', 'functions', 'statements'] as const) for (const counter of [{ total: 2, covered: 1 }, { total: -1, covered: -1 }, { total: 1.5, covered: 1.5 }, { total: 1, covered: 2 }]) {
      const coverage = { 'src/value.ts': { ...full, [metric]: counter } };
      expect(codes(inventory, [{ ...evidence[0]!, coverage }, evidence[1]!])).toContain('coverage-gap');
    }
    expect(codes(inventory, [{ ...evidence[0]!, coverage: { 'src/value.ts': { ...full, lines: { total: 0, covered: 0 }, statements: { total: 0, covered: 0 } } } }, evidence[1]!])).toContain('empty-coverage');
  }

  @Verifies<QualificationFeature>('requiresReplayableStrategies')
  rejectsMissingInsufficientOrFailingRandomCampaigns() {
    const { inventory, evidence } = fixture();
    expect(codes(inventory, [{ ...evidence[0]!, strategies: [] }, evidence[1]!])).toContain('strategy-gap');
    for (const change of [{ runs: 999 }, { runs: 0.1 }, { seed: NaN }, { status: 'failed' }, { counterexample: ['é'] }]) {
      const strategies = evidence[0]!.strategies.map(s => ({ ...s, ...change }));
      expect(codes(inventory, [{ ...evidence[0]!, strategies }, evidence[1]!])).toContain('strategy-gap');
    }
    expect(codes({ ...inventory, tests: inventory.tests.map(t => ({ ...t, strategy: 'example' as const })) }, evidence)).toContain('missing-strategy');
  }

  @Verifies<QualificationFeature>('interpretsStrykerWithoutVacuousSuccess')
  exposesStandardStrykerTimeoutsAndRejectsAllIncompleteMutantStates() {
    const { inventory, evidence } = fixture();
    expect(evaluateQualification(inventory, evidence).platforms[0]!.mutation).toEqual({ killed: 1, timeout: 1, survived: 0, noCoverage: 0, errors: 0, ignored: 0, pending: 0, total: 2, score: 100 });
    for (const status of ['Survived', 'NoCoverage', 'CompileError', 'RuntimeError', 'Ignored', 'Pending'] as const) {
      const mutation = { ...evidence[0]!.mutation, files: { 'src/value.ts': ['Killed' as const, status] } };
      expect(codes(inventory, [{ ...evidence[0]!, mutation }, evidence[1]!])).toContain('mutation-gap');
    }
    const changes: Partial<QualificationEvidence['mutation']>[] = [{ files: {} }, { files: { 'src/value.ts': [] } }, { staticMutants: false }, { incremental: true }];
    for (const change of changes) {
      expect(codes(inventory, [{ ...evidence[0]!, mutation: { ...evidence[0]!.mutation, ...change } }, evidence[1]!]).length).toBeGreaterThan(0);
    }
  }

  @Verifies<QualificationFeature>('requiresAllPlatformsAndChecks')
  requiresWindowsLinuxAndIndependentChecks() {
    const { inventory, evidence } = fixture();
    expect(codes(inventory, [evidence[0]!])).toContain('missing-platform');
    expect(codes(inventory, [...evidence, evidence[0]!])).toContain('ambiguous-evidence');
    for (const check of ['typecheck', 'distribution', 'orchestration'] as const) {
      expect(codes(inventory, [{ ...evidence[0]!, checks: { ...evidence[0]!.checks, [check]: 'failed' } }, evidence[1]!])).toContain('check-gap');
    }
  }
}
void QualificationTests;
