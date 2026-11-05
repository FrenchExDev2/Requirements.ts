import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { TraceCoreFeature } from '@frenchexdev2/requirements-requirements';
import {
  buildTraceIndex,
  queryGaps,
  queryMatrix,
  queryChain,
} from '../../src/trace-core';
import type { FeatureMeta, TestRef, MachineLink } from '@frenchexdev2/requirements-compliance';

function F(partial: Partial<FeatureMeta> = {}): FeatureMeta {
  return {
    id: 'F1', title: 'One', priority: 'high',
    acMethods: ['ac1'], acDetails: [{ name: 'ac1', expectedLevels: ['unit'] }],
    enabled: true, className: 'OneFeature', file: 'one.ts', satisfies: [],
    ...partial,
  };
}

@FeatureTest(TraceCoreFeature)
class QueryGapsTests {
  @Verifies<TraceCoreFeature>('reportsUnlinkedFsms')
  'reports FSMs without features'() {
    const idx = buildTraceIndex([F()], {}, []);
    const fsms: MachineLink[] = [
      { id: 'M', name: 'Linked', file: 'a', features: [{ id: 'F1', ac: 'ac1' }] },
      { id: 'M2', name: 'Unlinked1', file: 'b' },
      { id: 'M3', name: 'Unlinked2', file: 'c', features: [] },
    ];
    const r = queryGaps(idx, fsms, [F()], []);
    expect(r.unlinkedFsms.map(m => m.name).sort()).toEqual(['Unlinked1', 'Unlinked2']);
  }

  @Verifies<TraceCoreFeature>('skipsDisabledFeaturesInGaps')
  'skips disabled features'() {
    const disabled = F({ enabled: false });
    const idx = buildTraceIndex([disabled], {}, []);
    const r = queryGaps(idx, [], [disabled], []);
    expect(r.uncoveredAcs).toEqual([]);
  }

  @Verifies<TraceCoreFeature>('reportsUncoveredAcsMissingLevels')
  'reports missing levels'() {
    const f = F({
      acMethods: ['ac1'],
      acDetails: [{ name: 'ac1', expectedLevels: ['unit', 'e2e'] }],
    });
    const refs: TestRef[] = [
      { feature: 'OneFeature', featureId: 'F1', ac: 'ac1', testFile: 't.ts', testName: 'n', level: 'unit' },
    ];
    const idx = buildTraceIndex([f], {}, refs);
    const r = queryGaps(idx, [], [f], refs);
    expect(r.uncoveredAcs).toHaveLength(1);
    expect(r.uncoveredAcs[0]!.missingLevels).toEqual(['e2e']);
  }

  @Verifies<TraceCoreFeature>('defaultsAcDetailsToUnitWhenMissing')
  'defaults expected level to unit when no detail'() {
    const f = F({ acMethods: ['ac1'], acDetails: [] });
    const idx = buildTraceIndex([f], {}, []);
    const r = queryGaps(idx, [], [f], []);
    expect(r.uncoveredAcs[0]!.expectedLevels).toEqual(['unit']);
    expect(r.transitionsWithoutAcs).toEqual([]);
  }

  @Verifies<TraceCoreFeature>('usesClassToIdFallbackInGaps')
  'uses classToId fallback when featureId differs'() {
    const f = F();
    const refs: TestRef[] = [
      { feature: 'OneFeature', featureId: 'OTHER', ac: 'ac1', testFile: 't.ts', testName: 'n', level: 'unit' },
    ];
    const idx = buildTraceIndex([f], {}, refs);
    const r = queryGaps(idx, [], [f], refs);
    expect(r.uncoveredAcs).toEqual([]); // ac1 gets covered via class fallback
  }
}
void QueryGapsTests;

@FeatureTest(TraceCoreFeature)
class QueryMatrixTests {
  @Verifies<TraceCoreFeature>('returnsNullForUnknownMatrixFeature')
  'returns null for unknown feature'() {
    const idx = buildTraceIndex([F()], {}, []);
    expect(queryMatrix('NOPE', idx, [F()], [], [])).toBeNull();
  }

  @Verifies<TraceCoreFeature>('buildsRowsWithCoveredAndGapLevels')
  'builds rows with covered/gap levels'() {
    const f = F({
      acMethods: ['ac1'],
      acDetails: [{ name: 'ac1', expectedLevels: ['unit', 'e2e'] }],
    });
    const refs: TestRef[] = [
      { feature: 'OneFeature', featureId: 'F1', ac: 'ac1', testFile: 't.ts', testName: 'n', level: 'unit' },
    ];
    const idx = buildTraceIndex([f], {}, refs);
    const r = queryMatrix('F1', idx, [f], refs, [])!;
    expect(r.rows[0]!.coveredLevels).toEqual(['unit']);
    expect(r.rows[0]!.gapLevels).toEqual(['e2e']);
    expect(r.rows[0]!.fsmTransition).toBeNull();
  }

  @Verifies<TraceCoreFeature>('handlesMatrixWithFsmLinkingToFeature')
  'handles FSM linking to feature (linksToFeature branch)'() {
    const f = F();
    const fsms: MachineLink[] = [
      { id: 'M', name: 'Linked', file: 'a', features: [{ id: 'F1', ac: 'ac1' }] },
      { id: 'M2', name: 'NotLinked', file: 'b', features: [{ id: 'OTHER', ac: 'xx' }] },
      { id: 'M3', name: 'NoFeatures', file: 'c' },
    ];
    const idx = buildTraceIndex([f], {}, []);
    const r = queryMatrix('F1', idx, [f], [], fsms)!;
    expect(r.rows).toHaveLength(1);
  }

  @Verifies<TraceCoreFeature>('usesClassToIdFallbackInMatrix')
  'uses classToId fallback in matrix coverage'() {
    const f = F({
      acMethods: ['ac1'],
      acDetails: [{ name: 'ac1', expectedLevels: ['unit'] }],
    });
    const refs: TestRef[] = [
      { feature: 'OneFeature', featureId: 'OTHER', ac: 'ac1', testFile: 't.ts', testName: 'n', level: 'unit' },
    ];
    const idx = buildTraceIndex([f], {}, refs);
    const r = queryMatrix('F1', idx, [f], refs, [])!;
    expect(r.rows[0]!.coveredLevels).toEqual(['unit']);
  }

  @Verifies<TraceCoreFeature>('defaultsMatrixAcDetailsToUnit')
  'defaults expected levels to unit'() {
    const f = F({ acMethods: ['ac1'], acDetails: [] });
    const idx = buildTraceIndex([f], {}, []);
    const r = queryMatrix('F1', idx, [f], [], [])!;
    expect(r.rows[0]!.expectedLevels).toEqual(['unit']);
  }
}
void QueryMatrixTests;

@FeatureTest(TraceCoreFeature)
class QueryChainTests {
  @Verifies<TraceCoreFeature>('returnsNullWhenChainFeatureUnknown')
  'returns null when feature unknown'() {
    expect(queryChain('NOPE', 'ac', [F()], [], [])).toBeNull();
  }

  @Verifies<TraceCoreFeature>('returnsNullWhenChainAcUnknown')
  'returns null when ac unknown'() {
    expect(queryChain('F1', 'UNKNOWN', [F()], [], [])).toBeNull();
  }

  @Verifies<TraceCoreFeature>('buildsChainWithRequirementFsmAndTests')
  'builds chain with requirement + fsm + tests'() {
    const f = F();
    const fsms: MachineLink[] = [
      { id: 'M', name: 'NavMachine', file: 'src/lib/nav.ts', features: [{ id: 'F1', ac: 'ac1' }] },
    ];
    const refs: TestRef[] = [
      { feature: 'OneFeature', featureId: 'F1', ac: 'ac1', testFile: 't.ts', testName: 'n', level: 'unit' },
      // classToId fallback
      { feature: 'OneFeature', featureId: 'OTHER', ac: 'ac1', testFile: 'u.ts', testName: 'm', level: 'e2e' },
    ];
    const r = queryChain('F1', 'ac1', [f], fsms, refs)!;
    expect(r.nodes.map(n => n.kind)).toEqual(['requirement', 'fsm', 'test', 'test']);
  }

  @Verifies<TraceCoreFeature>('skipsFsmsWithoutFeatures')
  'skips FSMs without features array'() {
    const f = F();
    const fsms: MachineLink[] = [{ id: 'M', name: 'X', file: 'a' }];
    const r = queryChain('F1', 'ac1', [f], fsms, [])!;
    expect(r.nodes.filter(n => n.kind === 'fsm')).toEqual([]);
  }

  @Verifies<TraceCoreFeature>('skipsFsmsThatDoNotMatchAc')
  'skips FSMs that do not reference this feature/ac'() {
    const f = F();
    const fsms: MachineLink[] = [
      { id: 'M', name: 'X', file: 'a', features: [{ id: 'F1', ac: 'other' }] },
      { id: 'M2', name: 'Y', file: 'b', features: [{ id: 'OTHER', ac: 'ac1' }] },
    ];
    const r = queryChain('F1', 'ac1', [f], fsms, [])!;
    expect(r.nodes.filter(n => n.kind === 'fsm')).toEqual([]);
  }
}
void QueryChainTests;
