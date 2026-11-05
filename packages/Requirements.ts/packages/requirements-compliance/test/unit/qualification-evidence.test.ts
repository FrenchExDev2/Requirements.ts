import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { QualificationFeature } from '../../../requirements-requirements/src/qualification-contracts.js';
import { adaptQualificationTests, adaptQualificationStrategy, adaptQualificationCoverage, adaptQualificationMutation, qualificationRelativeFile } from '../../src/qualification-evidence.js';
import { qualificationTestId, type QualificationInventory } from '../../src/qualification.js';

@FeatureTest(QualificationFeature)
class QualificationEvidenceAdapterTests {
  @Verifies<QualificationFeature>('matchesRunnerProofWithoutInferringSuccess')
  preservesUnknownStrategiesAndResolvesOnlyUnambiguousForwarding() {
    const id = qualificationTestId('test/unit/property.test.ts', 'Properties', 'accepts');
    const test = { id, file: 'test/unit/property.test.ts', className: 'Properties', name: 'accepts', feature: 'ValueFeature', ac: 'accepts', level: 'unit', targets: ['src/value.ts'], hasAssertion: true, strategy: 'property' as const };
    const inventory: QualificationInventory = { requirements: [], features: [], executableFiles: [], hashes: {}, diagnostics: [], tests: [test], testAliases: { 'test/unit/proxy.test.ts': [test.file] } };
    const strategy = { testId: id, strategy: 'property' as const, runs: 1000, seed: 42, status: 'passed' };
    expect(adaptQualificationStrategy(strategy, inventory)).toEqual(strategy);
    const forwarded = { ...strategy, testId: qualificationTestId('test/unit/proxy.test.ts', 'Properties', 'accepts') };
    expect(adaptQualificationStrategy(forwarded, inventory)).toEqual(strategy);
    expect(adaptQualificationStrategy(forwarded, { ...inventory, testAliases: undefined })).toEqual(forwarded);
    for (const testId of ['unknown', '{}', '[]', '[1,2,3]', '["a","b"]', qualificationTestId('other.test.ts', 'Properties', 'accepts')]) {
      const unknown = { ...strategy, testId };
      expect(adaptQualificationStrategy(unknown, inventory)).toEqual(unknown);
    }
    const other = { ...test, id: 'ambiguous', file: 'test/unit/other-property.test.ts' };
    expect(adaptQualificationStrategy(forwarded, { ...inventory, tests: [test, other], testAliases: { 'test/unit/proxy.test.ts': [test.file, other.file] } })).toEqual(forwarded);
    expect(adaptQualificationStrategy(forwarded, { ...inventory, tests: [test, { ...test, className: 'Other' }, { ...test, name: 'other' }] })).toEqual(strategy);
  }

  @Verifies<QualificationFeature>('matchesRunnerProofWithoutInferringSuccess')
  matchesOnlyFileClassAndTitleAndKeepsFailures() {
    const id = qualificationTestId('test/unit/value.test.ts', 'ValueTests', 'accepts');
    const inventory: QualificationInventory = { requirements: [], features: [], executableFiles: [], hashes: {}, diagnostics: [], tests: [{ id, file: 'test/unit/value.test.ts', className: 'ValueTests', name: 'accepts', feature: 'ValueFeature', ac: 'accepts', level: 'unit', targets: [], hasAssertion: true, strategy: 'example' }] };
    const assertion = { title: 'accepts', ancestorTitles: ['ValueTests'], status: 'passed' };
    const suite = { name: 'C:\\repo\\test\\unit\\value.test.ts', assertionResults: [assertion] };
    expect(adaptQualificationTests({ success: true, testResults: [suite] }, 'C:/repo', inventory)).toEqual([{ id, status: 'passed' }]);
    const failed = { ...suite, assertionResults: [{ ...assertion, status: 'failed' }] };
    expect(adaptQualificationTests({ success: false, testResults: [failed] }, 'C:/repo', inventory)).toEqual([{ id, status: 'failed' }]);
    expect(adaptQualificationTests({ success: false, testResults: [{ ...failed, status: 'failed' }] }, 'C:/repo', inventory)).toEqual([{ id, status: 'failed' }]);
    expect(adaptQualificationTests({ success: false, testResults: [{ ...suite, status: 'failed' }] }, 'C:/repo', inventory)).toHaveLength(2);
    for (const wrong of [{ ...suite, name: 'C:/repo/other.test.ts' }, { ...suite, assertionResults: [{ ...assertion, title: 'other' }] }, { ...suite, assertionResults: [{ ...assertion, ancestorTitles: ['Other'] }] }]) expect(adaptQualificationTests({ success: true, testResults: [wrong] }, 'C:/repo', inventory)[0]!.id).not.toBe(id);
    const forwarded = { ...inventory, testAliases: { 'test/unit/proxy.test.ts': ['test/unit/value.test.ts'] } };
    expect(adaptQualificationTests({ success: true, testResults: [{ ...suite, name: 'C:/repo/test/unit/proxy.test.ts' }] }, 'C:/repo', forwarded)).toEqual([{ id, status: 'passed' }]);
    expect(adaptQualificationTests({ success: false, testResults: [] }, '/repo', inventory)).toEqual([{ id: '<runner-failure>', status: 'failed' }]);
    expect(adaptQualificationTests({ success: false, testResults: [{ ...suite, status: 'failed', assertionResults: [] }] }, 'C:/repo', inventory)[0]!.status).toBe('failed');
  }

  @Verifies<QualificationFeature>('normalizesCoverageCounters')
  retainsActualDenominatorsAndNormalizesBothPlatformPaths() {
    const counters = { lines: { total: 3, covered: 2 }, statements: { total: 4, covered: 3 }, branches: { total: 2, covered: 1 }, functions: { total: 1, covered: 1 } };
    expect(adaptQualificationCoverage({ total: counters, 'C:\\repo\\src\\value.ts': counters }, 'C:/repo/')).toEqual({ 'src/value.ts': counters });
    expect(qualificationRelativeFile('/repo/src/value.ts', '/repo')).toBe('src/value.ts');
    expect(qualificationRelativeFile('src/../src/value.ts', '/repo')).toBe('src/value.ts');
    expect(qualificationRelativeFile('/other/src/value.ts', '/repo')).toBe('/other/src/value.ts');
  }

  @Verifies<QualificationFeature>('retainsEveryMutantStatus')
  keepsTimeoutsUncoveredIgnoredErrorsAndEmptyFilesVisible() {
    const statuses = ['Killed', 'Timeout', 'Survived', 'NoCoverage', 'Ignored', 'CompileError', 'RuntimeError', 'Pending'];
    expect(adaptQualificationMutation({ files: { '/repo/src/value.ts': { mutants: statuses.map(status => ({ status })) }, '/repo/src/empty.ts': { mutants: [] } } }, '/repo')).toEqual({ 'src/value.ts': statuses, 'src/empty.ts': [] });
  }
}
void QualificationEvidenceAdapterTests;
