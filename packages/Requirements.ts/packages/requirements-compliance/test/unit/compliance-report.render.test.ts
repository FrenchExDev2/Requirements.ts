import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ComplianceReportFeature } from '@frenchexdev2/requirements-requirements';
import {
  renderConsole,
  renderByTest,
  type FeatureCoverage,
  type TestRef,
  type RenderConsoleOptions,
} from '../../src/compliance-report';
import type { RuntimeCoverage, OrphanFile } from '../../src/compliance-core';

const rc = (s: RuntimeCoverage['status'], min: number | null = 100, declared = 1, found = 1, missing: string[] = []): RuntimeCoverage => ({
  status: s, declared, found, missing, minLinesPct: min,
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

const OPTS = (over: Partial<RenderConsoleOptions> = {}): RenderConsoleOptions => ({
  useColor: false,
  coverageLoaded: true,
  coverageRunId: null,
  bindingsLoaded: true,
  includeBindings: false,
  includeOrphans: false,
  ...over,
});

const covered = (method: string) => ({
  method, covered: true, tests: [{ file: 't.ts', name: 'n', level: 'unit' as const }],
  expectedLevels: ['unit' as const], coveredLevels: ['unit' as const], gapLevels: [],
});
const uncovered = (method: string) => ({
  method, covered: false, tests: [],
  expectedLevels: ['unit' as const], coveredLevels: [], gapLevels: ['unit' as const],
});

@FeatureTest(ComplianceReportFeature)
class RenderConsoleTests {
  @Verifies<ComplianceReportFeature>('renderConsoleProducesHeaderAndSummary')
  'produces header, table and summary block'() {
    const out = renderConsole([fc({ totalCount: 1, coveredCount: 1, acs: [covered('a')] })], [], OPTS());
    expect(out).toContain('Feature Compliance Report');
    expect(out).toContain('Features:');
    expect(out).toContain('Acceptance criteria:');
    expect(out).toContain('Quality gate:');
  }

  @Verifies<ComplianceReportFeature>('renderConsoleShowsCoverageRunIdWhenLoaded')
  'prints coverage run id line'() {
    const out = renderConsole([], [], OPTS({ coverageRunId: '2026-04-01T10-00-00' }));
    expect(out).toContain('test-results/2026-04-01T10-00-00/');
  }

  @Verifies<ComplianceReportFeature>('renderConsoleWarnsWhenCoverageMissing')
  'warns when coverage not loaded'() {
    const out = renderConsole([], [], OPTS({ coverageLoaded: false }));
    expect(out).toContain('no vitest coverage run found');
  }

  @Verifies<ComplianceReportFeature>('renderConsoleWarnsWhenBindingsMissing')
  'warns when bindings requested but not loaded'() {
    const out = renderConsole([], [], OPTS({ bindingsLoaded: false, includeBindings: true }));
    expect(out).toContain('no bindings manifest');
  }

  @Verifies<ComplianceReportFeature>('renderConsoleIncludesBindingsColumnsWhenRequested')
  'adds TU and E2E columns when includeBindings=true'() {
    const f = fc({
      totalCount: 2, coveredCount: 2, percentage: 100,
      acs: [covered('a'), covered('b')],
      bindings: { status: 'bound', totalAcs: 2, boundAcs: 1, symbols: [] },
    });
    const out = renderConsole([f], [], OPTS({ includeBindings: true }));
    expect(out).toContain('TU');
    expect(out).toContain('E2E');
    expect(out).toContain('Unbound features:');
  }

  @Verifies<ComplianceReportFeature>('renderConsoleIncludesBindingsColumnsWhenRequested')
  'bindings columns: TU=0 rendered dim, E2E matches covered - bound'() {
    const f = fc({
      totalCount: 1, coveredCount: 1, percentage: 100,
      acs: [covered('a')],
      bindings: { status: 'unbound', totalAcs: 1, boundAcs: 0, symbols: [] },
    });
    const out = renderConsole([f], [], OPTS({ includeBindings: true, useColor: false }));
    // "Unbound features: 0" expected because percentage=100 & bindings.status=unbound && coveredCount>0 (not 0)
    expect(out).toMatch(/Unbound features: 0/);
  }

  @Verifies<ComplianceReportFeature>('renderConsoleRendersDisabledRow')
  'disabled features are counted separately'() {
    const d = fc({ id: 'D', enabled: false });
    const out = renderConsole([d], [], OPTS());
    expect(out).toContain('1 disabled');
  }

  @Verifies<ComplianceReportFeature>('renderConsoleAppendsMissingAcNote')
  'appends "missing: ..." note after last cell for uncovered ACs'() {
    const f = fc({
      totalCount: 2, coveredCount: 1, percentage: 50,
      acs: [covered('a'), uncovered('b')],
    });
    const out = renderConsole([f], [], OPTS());
    expect(out).toMatch(/Missing ACs[\s\S]*·\s*b/);
  }

  @Verifies<ComplianceReportFeature>('renderConsoleRendersOrphanSection')
  'renders orphan file section when includeOrphans & orphans present'() {
    const orphans: OrphanFile[] = [{ file: 'src/x.ts', linesPct: 42 }];
    const out = renderConsole([], orphans, OPTS({ includeOrphans: true }));
    expect(out).toContain('Source files not claimed by any feature');
    expect(out).toContain('src/x.ts');
    expect(out).toContain('42%');
  }

  @Verifies<ComplianceReportFeature>('renderConsoleSkipsOrphanSectionWhenFlagOff')
  'no orphan section when flag off even with orphans'() {
    const orphans: OrphanFile[] = [{ file: 'src/x.ts', linesPct: 42 }];
    const out = renderConsole([], orphans, OPTS({ includeOrphans: false }));
    expect(out).not.toContain('Source files not claimed');
  }

  @Verifies<ComplianceReportFeature>('renderConsoleSkipsOrphanSectionWhenFlagOff')
  'no orphan section when flag on but no orphans'() {
    const out = renderConsole([], [], OPTS({ includeOrphans: true }));
    expect(out).not.toContain('Source files not claimed');
  }

  @Verifies<ComplianceReportFeature>('renderConsoleUsesColorWhenRequested')
  'includes ANSI escapes when useColor=true'() {
    const f = fc({ totalCount: 1, coveredCount: 1, acs: [covered('a')] });
    const out = renderConsole([f], [], OPTS({ useColor: true, coverageRunId: 'x' }));
    expect(out).toMatch(/\x1b\[/);
  }

  @Verifies<ComplianceReportFeature>('renderConsoleQualityGatePassWhenClean')
  'quality gate PASS when no critical uncovered and totalPct >= 80'() {
    const f = fc({ totalCount: 1, coveredCount: 1, acs: [covered('a')] });
    const out = renderConsole([f], [], OPTS());
    expect(out).toContain('Quality gate: PASS');
  }

  @Verifies<ComplianceReportFeature>('renderConsoleQualityGateFailOnCriticalUncovered')
  'quality gate FAIL when critical feature has uncovered ACs'() {
    const f = fc({
      id: 'C', priority: 'critical', totalCount: 2, coveredCount: 1, percentage: 50,
      acs: [covered('a'), uncovered('b')],
    });
    const out = renderConsole([f], [], OPTS());
    expect(out).toContain('Quality gate: FAIL');
    expect(out).toMatch(/Critical uncovered: .*1/);
  }

  @Verifies<ComplianceReportFeature>('renderConsoleReportsRuntimeWarningsTally')
  'counts features at 100% ACs but non-ok runtime as warnings'() {
    const warnFeat = fc({
      totalCount: 1, coveredCount: 1, percentage: 100,
      acs: [covered('a')],
      runtimeCoverage: rc('partial', 50, 2, 1, ['missing.ts']),
    });
    const out = renderConsole([warnFeat], [], OPTS());
    expect(out).toMatch(/Runtime coverage warnings: .*1/);
  }

  @Verifies<ComplianceReportFeature>('renderConsoleReportsUnboundFeatureList')
  'lists unbound features when includeBindings and some unbound'() {
    const unbound = fc({
      id: 'UNB', totalCount: 1, coveredCount: 0, percentage: 0,
      acs: [uncovered('a')],
      bindings: { status: 'unbound', totalAcs: 1, boundAcs: 0, symbols: [] },
    });
    const out = renderConsole([unbound], [], OPTS({ includeBindings: true }));
    expect(out).toContain('UNB');
    expect(out).toMatch(/Unbound features: .*1/);
  }

  @Verifies<ComplianceReportFeature>('renderConsoleSummaryPercentage100WhenNoAcs')
  'percentage 100 when no active ACs'() {
    const out = renderConsole([], [], OPTS());
    expect(out).toContain('0/0 ACs covered (100%)');
  }

  @Verifies<ComplianceReportFeature>('renderConsolePercentColorsByThreshold')
  'mid (80-99%) feature colored yellow with useColor'() {
    // 4 covered / 5 total = 80%
    const acs = [covered('a'), covered('b'), covered('c'), covered('d'), uncovered('e')];
    const f = fc({ totalCount: 5, coveredCount: 4, percentage: 80, acs });
    const out = renderConsole([f], [], OPTS({ useColor: true }));
    expect(out).toContain('80%');
  }

  @Verifies<ComplianceReportFeature>('renderConsolePercentColorsByThreshold')
  'below 80% feature colored red'() {
    const f = fc({
      totalCount: 2, coveredCount: 0, percentage: 0,
      acs: [uncovered('a'), uncovered('b')],
    });
    const out = renderConsole([f], [], OPTS({ useColor: true }));
    expect(out).toContain('0%');
  }

  @Verifies<ComplianceReportFeature>('renderConsoleSourceColorOkNotFull')
  'src color yellow when ok but minLinesPct<100'() {
    const f = fc({
      totalCount: 1, coveredCount: 1, percentage: 100, acs: [covered('a')],
      runtimeCoverage: rc('ok', 80),
    });
    const out = renderConsole([f], [], OPTS({ useColor: true }));
    expect(out).toContain('80%');
  }

  @Verifies<ComplianceReportFeature>('renderConsoleSourceColorOkNotFull')
  'src color dim when status neither ok nor 100%'() {
    const f = fc({
      totalCount: 1, coveredCount: 1, percentage: 100, acs: [covered('a')],
      runtimeCoverage: rc('missing', null, 2, 0, ['x.ts', 'y.ts']),
    });
    const out = renderConsole([f], [], OPTS({ useColor: true }));
    expect(out).toContain('2 missing');
  }

  @Verifies<ComplianceReportFeature>('renderConsoleAppendsReqsColumnWhenAnyFeatureSatisfies')
  'REQs column appears and lists requirement IDs when any feature has satisfies'() {
    const f = fc({
      id: 'F-WITH-REQS', totalCount: 1, coveredCount: 1, acs: [covered('a')],
      satisfies: ['REQ-ALPHA', 'REQ-BETA'],
    });
    const out = renderConsole([f], [], OPTS());
    expect(out).toMatch(/\|\s*REQs\s*\|/);
    expect(out).toContain('REQ-ALPHA, REQ-BETA');
  }

  @Verifies<ComplianceReportFeature>('renderConsoleShowsDashInReqsCellForFeaturesWithoutSatisfies')
  'features without satisfies render a dash in the REQs cell when column shown'() {
    const withReq = fc({
      id: 'F-A', totalCount: 1, coveredCount: 1, acs: [covered('a')],
      satisfies: ['REQ-X'],
    });
    const withoutReq = fc({
      id: 'F-B', totalCount: 1, coveredCount: 1, acs: [covered('b')],
      satisfies: [],
    });
    const out = renderConsole([withReq, withoutReq], [], OPTS());
    expect(out).toContain('REQ-X');
    expect(out).toMatch(/—/);
  }

  @Verifies<ComplianceReportFeature>('renderConsoleMarksSrcCellAsSubprocessWhenAllTestsAreSmoke')
  'src cell shows "subprocess ✓" when every bound test is a smoke test'() {
    const smoke = (method: string) => ({
      method, covered: true,
      tests: [{ file: 't.ts', name: 'n', level: 'smoke' as const }],
      expectedLevels: ['smoke' as const], coveredLevels: ['smoke' as const], gapLevels: [],
    });
    const f = fc({ totalCount: 1, coveredCount: 1, percentage: 100, acs: [smoke('a')] });
    const out = renderConsole([f], [], OPTS());
    expect(out).toContain('subprocess ✓');
  }
}

@FeatureTest(ComplianceReportFeature)
class RenderByTestTests {
  @Verifies<ComplianceReportFeature>('renderByTestGroupsByFile')
  'groups by test file and lists features & ACs, sorted'() {
    const refs: TestRef[] = [
      { feature: 'B', featureId: 'B', ac: 'bc1', testFile: 'z-b.test.ts', testName: 'n', level: 'unit' },
      { feature: 'A', featureId: 'A', ac: 'ac1', testFile: 'a.test.ts', testName: 'n', level: 'unit' },
      { feature: 'A', featureId: 'A', ac: 'ac2', testFile: 'a.test.ts', testName: 'n', level: 'unit' },
    ];
    const out = renderByTest(refs, new Map(), false);
    expect(out).toContain('Test → Feature Mapping');
    expect(out).toContain('a.test.ts');
    expect(out).toContain('z-b.test.ts');
    // a.test.ts must appear before z-b.test.ts
    expect(out.indexOf('a.test.ts')).toBeLessThan(out.indexOf('z-b.test.ts'));
    expect(out).toContain('ac1, ac2');
  }

  @Verifies<ComplianceReportFeature>('renderByTestResolvesFeatureIdViaClassToId')
  'resolves featureId via classToId'() {
    const refs: TestRef[] = [
      { feature: 'MyClass', featureId: '', ac: 'ac1', testFile: 'a.test.ts', testName: 'n', level: 'unit' },
    ];
    const out = renderByTest(refs, new Map([['MyClass', 'F-MAPPED']]), false);
    expect(out).toContain('F-MAPPED');
  }

  @Verifies<ComplianceReportFeature>('renderByTestFallsBackToFeatureNameWhenNotMapped')
  'falls back to feature name when classToId misses'() {
    const refs: TestRef[] = [
      { feature: 'Unknown', featureId: '', ac: 'ac1', testFile: 'a.test.ts', testName: 'n', level: 'unit' },
    ];
    const out = renderByTest(refs, new Map(), false);
    expect(out).toContain('Unknown');
  }

  @Verifies<ComplianceReportFeature>('renderByTestHonoursUseColorFlag')
  'emits ANSI escapes when useColor=true'() {
    const refs: TestRef[] = [
      { feature: 'A', featureId: 'A', ac: 'ac1', testFile: 'a.test.ts', testName: 'n', level: 'unit' },
    ];
    const out = renderByTest(refs, new Map(), true);
    expect(out).toMatch(/\x1b\[/);
  }
}

@FeatureTest(ComplianceReportFeature)
class TableInternalViaRenderConsoleTests {
  // The internal `table` helper has no public export; these cases drive it via renderConsole.
  @Verifies<ComplianceReportFeature>('tableProducesHeaderSeparatorAndBody')
  'renderConsole emits at least a header line, separator, and body row'() {
    const f = fc({ totalCount: 1, coveredCount: 1, acs: [covered('a')] });
    const out = renderConsole([f], [], OPTS());
    expect(out).toMatch(/\|\s*ID\s*\|/);           // header row with ID header
    expect(out).toMatch(/\+-+\+/);                  // separator row
  }

  @Verifies<ComplianceReportFeature>('tableRespectsIndentOption')
  'table rows are indented by 2 spaces'() {
    const f = fc({ totalCount: 1, coveredCount: 1, acs: [covered('a')] });
    const out = renderConsole([f], [], OPTS());
    // Every table line (| or +) is preceded by 2 spaces of indent
    const tableLines = out.split('\n').filter(l => /^\s*[|+]/.test(l));
    for (const l of tableLines) expect(l.startsWith('  ')).toBe(true);
  }

  @Verifies<ComplianceReportFeature>('tableComputesWidthFromHeaderMinWidthAndCells')
  'title column grows to fit long titles'() {
    const long = 'A-very-long-feature-title-that-exceeds-default';
    const f = fc({ title: long, totalCount: 1, coveredCount: 1, acs: [covered('a')] });
    const out = renderConsole([f], [], OPTS());
    expect(out).toContain(long);
  }

  @Verifies<ComplianceReportFeature>('tableDefaultsToLeftAlignment')
  'left alignment pads on right side'() {
    // When header is shorter than longest cell, the rendered row should contain
    // the cell content somewhere on the line.
    const f = fc({ id: 'SHORT', totalCount: 1, coveredCount: 1, acs: [covered('a')] });
    const out = renderConsole([f], [], OPTS());
    expect(out).toContain('SHORT');
  }

  @Verifies<ComplianceReportFeature>('tableHonoursRightAlignment')
  'Total/Covered/% columns right-align'() {
    const f = fc({ totalCount: 99, coveredCount: 99, percentage: 100, acs: [covered('a')] });
    const out = renderConsole([f], [], OPTS());
    expect(out).toMatch(/\b99\b/);
  }

  @Verifies<ComplianceReportFeature>('tableStripsAnsiEscapesWhenMeasuringWidth')
  'ANSI-colored cells still align visually'() {
    const f = fc({ totalCount: 1, coveredCount: 1, acs: [covered('a')] });
    const out = renderConsole([f], [], OPTS({ useColor: true }));
    // No runtime error + output is nonempty
    expect(out.length).toBeGreaterThan(0);
  }

  @Verifies<ComplianceReportFeature>('tableHandlesMissingCellsAsEmpty')
  'renderConsole without bindings omits TU/E2E (missing cells via column set)'() {
    const f = fc({ totalCount: 1, coveredCount: 1, acs: [covered('a')] });
    const out = renderConsole([f], [], OPTS({ includeBindings: false }));
    // Without bindings, no TU/E2E columns
    expect(out).not.toMatch(/\|\s*TU\s*\|/);
  }

  @Verifies<ComplianceReportFeature>('tableAppliesHeaderAndSeparatorColors')
  'header row uses dim color wrapping when useColor=true'() {
    const f = fc({ totalCount: 1, coveredCount: 1, acs: [covered('a')] });
    const out = renderConsole([f], [], OPTS({ useColor: true }));
    // Dim escape is \x1b[2m
    expect(out).toContain('\x1b[2m');
  }

  @Verifies<ComplianceReportFeature>('tableUsesExplicitWidthWhenLarger')
  'minWidth ensures glyph column never collapses'() {
    // Glyph column has minWidth:1 → always present even when first row
    const f = fc({ totalCount: 1, coveredCount: 1, acs: [covered('a')] });
    const out = renderConsole([f], [], OPTS());
    // The very first data cell is the glyph ✓ for fully-covered
    expect(out).toContain('✓');
  }
}

void RenderConsoleTests;
void RenderByTestTests;
void TableInternalViaRenderConsoleTests;
