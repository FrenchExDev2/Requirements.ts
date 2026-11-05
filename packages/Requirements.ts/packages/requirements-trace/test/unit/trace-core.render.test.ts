import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { TraceCoreFeature } from '@frenchexdev2/requirements-requirements';
import {
  renderFileToFeatures,
  renderFeatureToFiles,
  renderFileToTests,
  renderFeatureToTests,
  renderImpact,
  renderHotspots,
  renderFragile,
  renderFsm,
  renderGaps,
  renderMatrix,
  renderChain,
  type TraceFormatter,
} from '../../src/trace-core';

const fmt: TraceFormatter = {
  bold:   s => `B(${s})`,
  cyan:   s => `C(${s})`,
  dim:    s => `D(${s})`,
  green:  s => `G(${s})`,
  yellow: s => `Y(${s})`,
  red:    s => `R(${s})`,
};

@FeatureTest(TraceCoreFeature)
class RenderFileToFeaturesTests {
  @Verifies<TraceCoreFeature>('rendersFileToFeaturesEmpty')
  'empty features'() {
    const out = renderFileToFeatures({ file: 'a.ts', features: [] }, fmt).join('\n');
    expect(out).toContain('B(File: a.ts)');
    expect(out).toContain('D((no features linked))');
  }

  @Verifies<TraceCoreFeature>('rendersFileToFeaturesWithData')
  'with features'() {
    const out = renderFileToFeatures({
      file: 'a.ts',
      features: [{ id: 'F1', title: 'One', priority: 'high', acs: ['ac1'], symbols: ['fn'] }],
    }, fmt).join('\n');
    expect(out).toContain('1 feature(s) linked');
    expect(out).toContain('ACs: ac1');
    expect(out).toContain('Symbols:');
  }
}
void RenderFileToFeaturesTests;

@FeatureTest(TraceCoreFeature)
class RenderFeatureToFilesTests {
  @Verifies<TraceCoreFeature>('rendersFeatureToFilesEmpty')
  'empty'() {
    const out = renderFeatureToFiles({ featureId: 'F1', title: 'T', files: [] }, fmt).join('\n');
    expect(out).toContain('D((no source files linked))');
  }

  @Verifies<TraceCoreFeature>('rendersFeatureToFilesWithSymbols')
  'with symbols'() {
    const out = renderFeatureToFiles({
      featureId: 'F1', title: 'T',
      files: [{ file: 'src/a.ts', symbols: ['fn'] }],
    }, fmt).join('\n');
    expect(out).toContain('1 file(s)');
    expect(out).toContain('D(fn)');
  }

  @Verifies<TraceCoreFeature>('rendersFeatureToFilesWithoutSymbols')
  'without symbols'() {
    const out = renderFeatureToFiles({
      featureId: 'F1', title: 'T',
      files: [{ file: 'src/a.ts', symbols: [] }],
    }, fmt).join('\n');
    expect(out).toContain('C(src/a.ts)');
    expect(out).not.toContain('D(fn)');
  }
}
void RenderFeatureToFilesTests;

@FeatureTest(TraceCoreFeature)
class RenderFileToTestsTests {
  @Verifies<TraceCoreFeature>('rendersFileToTestsEmpty')
  'empty'() {
    const out = renderFileToTests({ file: 'a.ts', tests: [] }, fmt).join('\n');
    expect(out).toContain('D((no tests linked))');
  }

  @Verifies<TraceCoreFeature>('rendersFileToTestsGroupedByTestFile')
  'grouped by test file'() {
    const out = renderFileToTests({
      file: 'src/a.ts',
      tests: [
        { testFile: 't/a.test.ts', testName: 'n1', featureId: 'F1', ac: 'ac1' },
        { testFile: 't/a.test.ts', testName: 'n2', featureId: 'F1', ac: 'ac2' },
        { testFile: 't/b.test.ts', testName: 'n3', featureId: 'F2', ac: 'bx' },
      ],
    }, fmt).join('\n');
    expect(out).toContain('2 test file(s)');
    expect(out).toContain('n1');
    expect(out).toContain('n3');
  }
}
void RenderFileToTestsTests;

@FeatureTest(TraceCoreFeature)
class RenderFeatureToTestsTests {
  @Verifies<TraceCoreFeature>('rendersFeatureToTestsEmpty')
  'empty'() {
    const out = renderFeatureToTests({ featureId: 'F1', title: 'T', tests: [] }, fmt).join('\n');
    expect(out).toContain('D((no tests linked))');
  }

  @Verifies<TraceCoreFeature>('rendersFeatureToTestsWithData')
  'with tests'() {
    const out = renderFeatureToTests({
      featureId: 'F1', title: 'T',
      tests: [{ file: 't.ts', name: 'n', ac: 'ac1' }],
    }, fmt).join('\n');
    expect(out).toContain('1 test(s)');
  }
}
void RenderFeatureToTestsTests;

@FeatureTest(TraceCoreFeature)
class RenderImpactTests {
  @Verifies<TraceCoreFeature>('rendersImpactWithCriticalAndOther')
  'renders impact with critical + other priorities'() {
    const out = renderImpact({
      changedFiles: ['src/a.ts'],
      impactedFeatures: [
        { id: 'F1', title: 'One', priority: 'critical' },
        { id: 'F2', title: 'Two', priority: 'high' },
      ],
      testsToRerun: ['t/a.test.ts'],
    }, fmt).join('\n');
    expect(out).toContain('R(!)');
    expect(out).toContain('Y(*)');
    expect(out).toContain('Tests to rerun: 1 file(s)');
  }
}
void RenderImpactTests;

@FeatureTest(TraceCoreFeature)
class RenderHotspotsTests {
  @Verifies<TraceCoreFeature>('rendersHotspotsEmpty')
  'empty'() {
    const out = renderHotspots([], fmt).join('\n');
    expect(out).toContain('D((no data))');
  }

  @Verifies<TraceCoreFeature>('rendersHotspotsBarScaled')
  'scaled bar'() {
    const out = renderHotspots([
      { file: 'a.ts', featureCount: 4, features: ['F1', 'F2', 'F3', 'F4'] },
      { file: 'b.ts', featureCount: 1, features: ['F1'] },
    ], fmt).join('\n');
    expect(out).toContain('4 feat');
    expect(out).toContain('1 feat');
  }

  @Verifies<TraceCoreFeature>('rendersHotspotsWithZeroMaxCount')
  'zero maxCount fallback'() {
    const out = renderHotspots([
      { file: 'a.ts', featureCount: 0, features: [] },
    ], fmt).join('\n');
    expect(out).toContain('0 feat');
  }
}
void RenderHotspotsTests;

@FeatureTest(TraceCoreFeature)
class RenderFragileTests {
  @Verifies<TraceCoreFeature>('rendersFragileEmpty')
  'empty'() {
    const out = renderFragile([], fmt).join('\n');
    expect(out).toContain('D((no data))');
  }

  @Verifies<TraceCoreFeature>('rendersFragileBarScaled')
  'scaled bar'() {
    const out = renderFragile([
      { featureId: 'F1', title: 'T1', fileCount: 4, files: ['a', 'b', 'c', 'd'] },
      { featureId: 'F2', title: 'T2', fileCount: 1, files: ['a'] },
    ], fmt).join('\n');
    expect(out).toContain('4 file(s)');
    expect(out).toContain('1 file(s)');
  }

  @Verifies<TraceCoreFeature>('rendersFragileWithZeroMaxCount')
  'zero maxCount'() {
    const out = renderFragile([
      { featureId: 'F1', title: 'T1', fileCount: 0, files: [] },
    ], fmt).join('\n');
    expect(out).toContain('0 file(s)');
  }
}
void RenderFragileTests;

@FeatureTest(TraceCoreFeature)
class RenderFsmTests {
  @Verifies<TraceCoreFeature>('rendersFsmEmpty')
  'empty'() {
    const out = renderFsm({ entries: [] }, fmt).join('\n');
    expect(out).toContain('D((no FSMs found))');
  }

  @Verifies<TraceCoreFeature>('rendersFsmUnlinked')
  'unlinked features'() {
    const out = renderFsm({
      entries: [{ name: 'M', file: 'a', features: [] }],
    }, fmt).join('\n');
    expect(out).toContain('R((unlinked))');
    expect(out).toContain('1 FSM(s)');
  }

  @Verifies<TraceCoreFeature>('rendersFsmWithFeaturesAndTitle')
  'with feature + title'() {
    const out = renderFsm({
      entries: [{
        name: 'M', file: 'a',
        features: [{ featureId: 'F1', ac: 'ac1', featureTitle: 'One' }],
      }],
    }, fmt).join('\n');
    expect(out).toContain('G(F1)');
    expect(out).toContain('D(One)');
  }

  @Verifies<TraceCoreFeature>('rendersFsmFeatureWithoutTitle')
  'feature without title'() {
    const out = renderFsm({
      entries: [{
        name: 'M', file: 'a',
        features: [{ featureId: 'F1', ac: 'ac1', featureTitle: null }],
      }],
    }, fmt).join('\n');
    expect(out).toContain('G(F1)');
    expect(out).not.toContain('D(One)');
  }
}
void RenderFsmTests;

@FeatureTest(TraceCoreFeature)
class RenderGapsTests {
  @Verifies<TraceCoreFeature>('rendersGapsAllEmpty')
  'all empty'() {
    const out = renderGaps({
      unlinkedFsms: [], uncoveredAcs: [], transitionsWithoutAcs: [],
    }, fmt).join('\n');
    expect(out).toContain('G(No gaps found.)');
    expect(out).toContain('0 gap(s) total');
  }

  @Verifies<TraceCoreFeature>('rendersGapsUnlinkedFsms')
  'unlinked FSMs branch'() {
    const out = renderGaps({
      unlinkedFsms: [{ name: 'M', file: 'a' }],
      uncoveredAcs: [], transitionsWithoutAcs: [],
    }, fmt).join('\n');
    expect(out).toContain('FSMs without feature links:');
    expect(out).toContain('1 gap(s) total');
  }

  @Verifies<TraceCoreFeature>('rendersGapsUncoveredAcs')
  'uncovered ACs branch'() {
    const out = renderGaps({
      unlinkedFsms: [],
      uncoveredAcs: [{ featureId: 'F1', ac: 'ac1', expectedLevels: ['unit', 'e2e'], missingLevels: ['e2e'] }],
      transitionsWithoutAcs: [],
    }, fmt).join('\n');
    expect(out).toContain('ACs with missing test levels:');
    expect(out).toContain('missing: e2e');
  }

  @Verifies<TraceCoreFeature>('rendersGapsTransitionsWithoutAcs')
  'transitions branch'() {
    const out = renderGaps({
      unlinkedFsms: [],
      uncoveredAcs: [],
      transitionsWithoutAcs: [{ file: 'x', from: 'A', to: 'B', on: 'evt' }],
    }, fmt).join('\n');
    expect(out).toContain('Transitions without ACs:');
    expect(out).toContain('A -> B on:evt');
  }
}
void RenderGapsTests;

@FeatureTest(TraceCoreFeature)
class RenderMatrixTests {
  @Verifies<TraceCoreFeature>('rendersMatrixEmpty')
  'empty rows'() {
    const out = renderMatrix({ featureId: 'F1', title: 'T', rows: [] }, fmt).join('\n');
    expect(out).toContain('D((no ACs))');
  }

  @Verifies<TraceCoreFeature>('rendersMatrixRowsWithCoveredAndGap')
  'covered + gap rendering'() {
    const out = renderMatrix({
      featureId: 'F1', title: 'T',
      rows: [
        {
          ac: 'ac1',
          fsmTransition: null,
          expectedLevels: ['unit', 'e2e'],
          coveredLevels: ['unit'],
          gapLevels: ['e2e'],
        },
      ],
    }, fmt).join('\n');
    expect(out).toMatch(/G\(✓/);
    expect(out).toMatch(/R\(✗/);
    expect(out).toContain('1 AC(s), 1 gap(s)');
  }

  @Verifies<TraceCoreFeature>('rendersMatrixExpectedDash')
  'renders dash for non-expected level'() {
    const out = renderMatrix({
      featureId: 'F1', title: 'T',
      rows: [
        {
          ac: 'ac1', fsmTransition: null,
          expectedLevels: ['unit'], coveredLevels: ['unit'], gapLevels: [],
        },
        {
          ac: 'ac2', fsmTransition: null,
          expectedLevels: ['e2e'], coveredLevels: [], gapLevels: ['e2e'],
        },
      ],
    }, fmt).join('\n');
    // The first row should have '-' in the e2e column; dash char appears in output
    expect(out).toContain('-');
  }
}
void RenderMatrixTests;

@FeatureTest(TraceCoreFeature)
class RenderChainTests {
  @Verifies<TraceCoreFeature>('rendersChainEmpty')
  'empty'() {
    const out = renderChain({ featureId: 'F1', ac: 'ac1', nodes: [] }, fmt).join('\n');
    expect(out).toContain('D((no traceability data))');
  }

  @Verifies<TraceCoreFeature>('rendersChainAllKinds')
  'requirement + fsm + test + transition + implementation'() {
    const out = renderChain({
      featureId: 'F1', ac: 'ac1',
      nodes: [
        { kind: 'requirement', label: 'R', file: 'r.ts', detail: 'd' },
        { kind: 'fsm', label: 'M', file: 'm.ts' },
        { kind: 'test', label: 'T', file: 't.ts', detail: 'unit' },
        { kind: 'transition', label: 'Tr', file: 'x.ts' },
        { kind: 'implementation', label: 'I', file: 'i.ts' },
      ],
    }, fmt).join('\n');
    expect(out).toContain('REQ');
    expect(out).toContain('FSM');
    expect(out).toContain('TST');
    expect(out).toContain('C(R)');
    expect(out).toContain('G(T)');
  }

  @Verifies<TraceCoreFeature>('rendersChainWithoutDetail')
  'without detail'() {
    const out = renderChain({
      featureId: 'F1', ac: 'ac1',
      nodes: [{ kind: 'fsm', label: 'M', file: 'm.ts' }],
    }, fmt).join('\n');
    expect(out).not.toContain('D(unit)');
  }
}
void RenderChainTests;
