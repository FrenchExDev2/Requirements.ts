import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ComplianceReportFeature } from '@frenchexdev2/requirements-requirements';
import {
  buildJsonPayload,
  buildByTestJson,
  type FeatureCoverage,
  type TestRef,
} from '../../src/compliance-report';
import type { RuntimeCoverage, OrphanFile } from '../../src/compliance-core';

const rc = (s: RuntimeCoverage['status'], min: number | null = 100): RuntimeCoverage => ({
  status: s, declared: 1, found: 1, missing: [], minLinesPct: min,
});

function fc(over: Partial<FeatureCoverage> = {}): FeatureCoverage {
  return {
    id: 'F', title: 'F', priority: 'medium', enabled: true,
    sourceFiles: [], acs: [], coveredCount: 0, totalCount: 0, percentage: 100,
    runtimeCoverage: rc('ok'),
    bindings: { status: 'bound', totalAcs: 0, boundAcs: 0, symbols: [] },
    satisfies: [],
    ...over,
  };
}

@FeatureTest(ComplianceReportFeature)
class BuildJsonPayloadTests {
  @Verifies<ComplianceReportFeature>('buildJsonIncludesTimestampAndFeatures')
  'includes ISO timestamp and features array'() {
    const out = buildJsonPayload([fc()], []);
    expect(out.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(out.features).toHaveLength(1);
  }
  @Verifies<ComplianceReportFeature>('buildJsonComputesTotalAndCoveredAcs')
  'aggregates totalACs and coveredACs'() {
    const f = fc({
      totalCount: 3, coveredCount: 2, percentage: 67,
      acs: [
        { method: 'a', covered: true, tests: [], expectedLevels: ['unit'], coveredLevels: ['unit'], gapLevels: [] },
        { method: 'b', covered: true, tests: [], expectedLevels: ['unit'], coveredLevels: ['unit'], gapLevels: [] },
        { method: 'c', covered: false, tests: [], expectedLevels: ['unit'], coveredLevels: [], gapLevels: ['unit'] },
      ],
    });
    const out = buildJsonPayload([f], []);
    expect(out.summary.totalACs).toBe(3);
    expect(out.summary.coveredACs).toBe(2);
    expect(out.summary.percentage).toBe(67);
  }
  @Verifies<ComplianceReportFeature>('buildJsonCountsDisabledFeatures')
  'disabled features excluded from active counts'() {
    const active = fc({ totalCount: 1, coveredCount: 1,
      acs: [{ method: 'a', covered: true, tests: [], expectedLevels: ['unit'], coveredLevels: ['unit'], gapLevels: [] }] });
    const disabled = fc({ id: 'D', enabled: false, totalCount: 5, coveredCount: 0 });
    const out = buildJsonPayload([active, disabled], []);
    expect(out.summary.activeFeatures).toBe(1);
    expect(out.summary.disabledFeatures).toBe(1);
    expect(out.summary.totalACs).toBe(1);
  }
  @Verifies<ComplianceReportFeature>('buildJsonCollectsCriticalUncoveredAcs')
  'critical features with <100% list uncovered ACs'() {
    const f = fc({
      id: 'CRIT', priority: 'critical', percentage: 50, totalCount: 2, coveredCount: 1,
      acs: [
        { method: 'ok', covered: true, tests: [], expectedLevels: ['unit'], coveredLevels: ['unit'], gapLevels: [] },
        { method: 'bad', covered: false, tests: [], expectedLevels: ['unit'], coveredLevels: [], gapLevels: ['unit'] },
      ],
    });
    const out = buildJsonPayload([f], []);
    expect(out.summary.criticalUncovered).toEqual(['CRIT.bad']);
  }
  @Verifies<ComplianceReportFeature>('buildJsonSummaryPercentage100WhenNoAcs')
  'zero ACs → percentage 100'() {
    const out = buildJsonPayload([], []);
    expect(out.summary.percentage).toBe(100);
    expect(out.summary.totalACs).toBe(0);
  }
  @Verifies<ComplianceReportFeature>('buildJsonReportsRuntimeWarningsCount')
  'counts features at 100% with non-ok runtime'() {
    const warn = fc({ percentage: 100, runtimeCoverage: rc('partial', 50) });
    const out = buildJsonPayload([warn], []);
    expect(out.summary.runtimeWarnings).toBe(1);
  }
  @Verifies<ComplianceReportFeature>('buildJsonPropagatesOrphanList')
  'propagates orphan source files into summary'() {
    const orphans: OrphanFile[] = [{ file: 'src/x.ts', linesPct: 50 }];
    const out = buildJsonPayload([], orphans);
    expect(out.summary.orphanSourceFiles).toBe(orphans);
  }
}

@FeatureTest(ComplianceReportFeature)
class BuildByTestJsonTests {
  @Verifies<ComplianceReportFeature>('buildByTestGroupsByFileThenFeature')
  'groups test refs by file then by featureId'() {
    const refs: TestRef[] = [
      { feature: 'A', featureId: 'A', ac: 'ac1', testFile: 'a.ts', testName: 'x', level: 'unit' },
      { feature: 'A', featureId: 'A', ac: 'ac2', testFile: 'a.ts', testName: 'y', level: 'unit' },
      { feature: 'B', featureId: 'B', ac: 'ac1', testFile: 'b.ts', testName: 'z', level: 'unit' },
    ];
    const out = buildByTestJson(refs, new Map());
    expect(out.testFiles['a.ts']!['A']).toEqual(['ac1', 'ac2']);
    expect(out.testFiles['b.ts']!['B']).toEqual(['ac1']);
  }
  @Verifies<ComplianceReportFeature>('buildByTestResolvesFeatureIdFromClassName')
  'resolves featureId via classToId when ref has empty featureId'() {
    const refs: TestRef[] = [
      { feature: 'MyClass', featureId: '', ac: 'ac1', testFile: 'a.ts', testName: 'x', level: 'unit' },
    ];
    const out = buildByTestJson(refs, new Map([['MyClass', 'F-MAPPED']]));
    expect(out.testFiles['a.ts']!['F-MAPPED']).toEqual(['ac1']);
  }
  @Verifies<ComplianceReportFeature>('buildByTestFallsBackToFeatureNameWhenNotMapped')
  'falls back to raw feature name when classToId misses'() {
    const refs: TestRef[] = [
      { feature: 'Unknown', featureId: '', ac: 'ac1', testFile: 'a.ts', testName: 'x', level: 'unit' },
    ];
    const out = buildByTestJson(refs, new Map());
    expect(out.testFiles['a.ts']!['Unknown']).toEqual(['ac1']);
  }
  @Verifies<ComplianceReportFeature>('buildByTestIncludesTimestamp')
  'includes ISO timestamp'() {
    expect(buildByTestJson([], new Map()).timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  }
}

void BuildJsonPayloadTests;
void BuildByTestJsonTests;
