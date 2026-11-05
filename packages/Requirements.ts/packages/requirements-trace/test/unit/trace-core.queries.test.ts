import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { TraceCoreFeature } from '@frenchexdev2/requirements-requirements';
import {
  buildTraceIndex,
  queryFileToFeatures,
  queryFeatureToFiles,
  queryFileToTests,
  queryFeatureToTests,
  queryImpact,
  queryHotspots,
  queryFragile,
  queryFsm,
  type TraceIndex,
  type FeatureNode,
} from '../../src/trace-core';
import type { FeatureMeta, TestRef, MachineLink } from '@frenchexdev2/requirements-compliance';
import type { BindingsManifest } from '@frenchexdev2/requirements-scanner';

const FEATURE_A: FeatureMeta = {
  id: 'F1', title: 'One', priority: 'critical',
  acMethods: ['ac1'], acDetails: [{ name: 'ac1', expectedLevels: ['unit'] }],
  enabled: true, className: 'OneFeature', file: 'one.ts', satisfies: [],
};
const FEATURE_B: FeatureMeta = {
  id: 'F2', title: 'Two', priority: 'low',
  acMethods: ['bx'], acDetails: [{ name: 'bx', expectedLevels: ['unit'] }],
  enabled: true, className: 'TwoFeature', file: 'two.ts', satisfies: [],
};
const FEATURE_WEIRD: FeatureMeta = {
  id: 'F3', title: 'Weird', priority: 'weirdprio',
  acMethods: ['wx'], acDetails: [{ name: 'wx', expectedLevels: ['unit'] }],
  enabled: true, className: 'WeirdFeature', file: 'weird.ts', satisfies: [],
};

function makeIdx() {
  const manifest: BindingsManifest = {
    F1: { ac1: [{ file: 'src/a.ts', symbol: 'fnA' }] },
    F2: {
      bx: [
        { file: 'src/a.ts', symbol: 'fnA' },
        { file: 'src/b.ts', symbol: 'fnB' },
      ],
    },
  };
  const refs: TestRef[] = [
    { feature: 'OneFeature', featureId: 'F1', ac: 'ac1', testFile: 't/a.test.ts', testName: 'n1', level: 'unit' },
    { feature: 'TwoFeature', featureId: 'F2', ac: 'bx', testFile: 't/b.test.ts', testName: 'n2', level: 'unit' },
  ];
  return buildTraceIndex([FEATURE_A, FEATURE_B], manifest, refs);
}

@FeatureTest(TraceCoreFeature)
class FileToFeaturesTests {
  @Verifies<TraceCoreFeature>('returnsEmptyFeaturesWhenFileUnknown')
  'returns empty features when file unknown'() {
    const r = queryFileToFeatures(makeIdx(), 'unknown.ts');
    expect(r).toEqual({ file: 'unknown.ts', features: [] });
  }

  @Verifies<TraceCoreFeature>('returnsFeatureDetailsForKnownFile')
  'returns feature details for known file'() {
    const r = queryFileToFeatures(makeIdx(), 'src/a.ts');
    expect(r.features.map(f => f.id).sort()).toEqual(['F1', 'F2']);
    const f1 = r.features.find(f => f.id === 'F1')!;
    expect(f1.title).toBe('One');
    expect(f1.priority).toBe('critical');
    expect(f1.acs).toContain('ac1');
    expect(f1.symbols).toContain('fnA');
  }

  @Verifies<TraceCoreFeature>('defaultsMissingFeatureNodeFieldsToEmpty')
  'defaults title/priority when feature node is missing'() {
    // Build an index where fileNodes references a feature id not in featureNodes
    const idx = makeIdx();
    const rawFeatureNodes = new Map(idx.featureNodes as Map<string, FeatureNode>);
    rawFeatureNodes.delete('F1');
    const hacked: TraceIndex = { ...idx, featureNodes: rawFeatureNodes };
    const r = queryFileToFeatures(hacked, 'src/a.ts');
    const f1 = r.features.find(f => f.id === 'F1')!;
    expect(f1.title).toBe('');
    expect(f1.priority).toBe('');
  }
}
void FileToFeaturesTests;

@FeatureTest(TraceCoreFeature)
class FeatureToFilesTests {
  @Verifies<TraceCoreFeature>('returnsNullForUnknownFeature')
  'returns null when feature unknown'() {
    expect(queryFeatureToFiles(makeIdx(), 'NOPE')).toBeNull();
  }

  @Verifies<TraceCoreFeature>('returnsEmptyFilesArrayWhenFeatureHasNoFiles')
  'returns empty files array when feature has no files in manifest'() {
    const idx = buildTraceIndex([FEATURE_A], {}, []);
    const r = queryFeatureToFiles(idx, 'F1');
    expect(r).not.toBeNull();
    expect(r!.files).toEqual([]);
  }

  @Verifies<TraceCoreFeature>('listsFilesWithSymbolsForKnownFeature')
  'lists files with symbols for known feature'() {
    const r = queryFeatureToFiles(makeIdx(), 'F2');
    expect(r!.files.map(f => f.file).sort()).toEqual(['src/a.ts', 'src/b.ts']);
    const aEntry = r!.files.find(f => f.file === 'src/a.ts')!;
    expect(aEntry.symbols).toContain('fnA');
  }

  @Verifies<TraceCoreFeature>('handlesFileNodeMissingFeatureLink')
  'falls back to empty symbols when file node lacks a matching link'() {
    const idx = makeIdx();
    // Manually add F1 → orphan file path that has no FileNode entry
    const featureToFiles = new Map(idx.featureToFiles as Map<string, ReadonlySet<string>>);
    const orphanSet = new Set(['src/orphan.ts']);
    featureToFiles.set('F1', orphanSet);
    const hacked: TraceIndex = { ...idx, featureToFiles };
    const r = queryFeatureToFiles(hacked, 'F1');
    const orphan = r!.files.find(f => f.file === 'src/orphan.ts')!;
    expect(orphan.symbols).toEqual([]);
  }
}
void FeatureToFilesTests;

@FeatureTest(TraceCoreFeature)
class FileToTestsTests {
  @Verifies<TraceCoreFeature>('returnsEmptyTestsWhenFileUnknown')
  'returns empty tests when file unknown'() {
    expect(queryFileToTests(makeIdx(), 'nope.ts')).toEqual({ file: 'nope.ts', tests: [] });
  }

  @Verifies<TraceCoreFeature>('returnsTestLinksForKnownFile')
  'returns test links for known file'() {
    const r = queryFileToTests(makeIdx(), 'src/a.ts');
    expect(r.tests.length).toBeGreaterThan(0);
    expect(r.tests[0]).toHaveProperty('testFile');
  }
}
void FileToTestsTests;

@FeatureTest(TraceCoreFeature)
class FeatureToTestsTests {
  @Verifies<TraceCoreFeature>('returnsNullWhenFeatureUnknownForTests')
  'returns null when feature unknown'() {
    expect(queryFeatureToTests(makeIdx(), 'NOPE')).toBeNull();
  }

  @Verifies<TraceCoreFeature>('returnsTestsAcrossFileNodesDeduplicated')
  'returns tests deduplicated'() {
    // Make 2 refs with same file+name+ac so dedup kicks in
    const manifest: BindingsManifest = { F1: { ac1: [{ file: 'src/a.ts', symbol: 'fnA' }] } };
    const refs: TestRef[] = [
      { feature: 'OneFeature', featureId: 'F1', ac: 'ac1', testFile: 't/a.test.ts', testName: 'n1', level: 'unit' },
      { feature: 'OneFeature', featureId: 'F1', ac: 'ac1', testFile: 't/a.test.ts', testName: 'n1', level: 'unit' },
    ];
    const idx = buildTraceIndex([FEATURE_A], manifest, refs);
    const r = queryFeatureToTests(idx, 'F1');
    expect(r!.tests).toHaveLength(1);
    expect(r!.title).toBe('One');
  }

  @Verifies<TraceCoreFeature>('returnsEmptyWhenFeatureHasNoTests')
  'returns empty tests when feature has none'() {
    const idx = buildTraceIndex([FEATURE_A], {}, []);
    const r = queryFeatureToTests(idx, 'F1');
    expect(r!.tests).toEqual([]);
  }

  @Verifies<TraceCoreFeature>('returnsTestsAcrossFileNodesDeduplicated')
  'skips tests belonging to other features on the same file'() {
    // Full makeIdx has F1 and F2 on src/a.ts; query F1 and verify only F1 tests returned.
    const r = queryFeatureToTests(makeIdx(), 'F1');
    expect(r!.tests.every(t => /a\.test\.ts$/.test(t.file))).toBe(true);
    // No test from F2 (t/b.test.ts) sneaking in
    expect(r!.tests.find(t => t.file === 't/b.test.ts')).toBeUndefined();
  }
}
void FeatureToTestsTests;

@FeatureTest(TraceCoreFeature)
class ImpactTests {
  @Verifies<TraceCoreFeature>('aggregatesFeaturesAndTestsFromChangedFiles')
  'aggregates features and tests from changed files'() {
    const r = queryImpact(makeIdx(), ['src/a.ts']);
    expect(r.impactedFeatures.map(f => f.id).sort()).toEqual(['F1', 'F2']);
    expect(r.testsToRerun.length).toBeGreaterThan(0);
  }

  @Verifies<TraceCoreFeature>('skipsUnknownFilesInImpact')
  'skips files not in index'() {
    const r = queryImpact(makeIdx(), ['nope.ts']);
    expect(r.impactedFeatures).toEqual([]);
    expect(r.testsToRerun).toEqual([]);
    expect(r.changedFiles).toEqual(['nope.ts']);
  }

  @Verifies<TraceCoreFeature>('sortsImpactedFeaturesByPriority')
  'sorts features by priority (critical first)'() {
    const r = queryImpact(makeIdx(), ['src/a.ts']);
    expect(r.impactedFeatures[0]!.priority).toBe('critical');
  }

  @Verifies<TraceCoreFeature>('skipsUnknownFilesInImpact')
  'defaults title/priority to empty when featureNode missing for impacted feature'() {
    // Manifest references feature "GHOST" that has no FeatureMeta.
    const manifest: BindingsManifest = { GHOST: { gac: [{ file: 'src/g.ts', symbol: 'g' }] } };
    const idx = buildTraceIndex([FEATURE_A], manifest, []);
    const r = queryImpact(idx, ['src/g.ts']);
    const ghost = r.impactedFeatures.find(f => f.id === 'GHOST')!;
    expect(ghost.title).toBe('');
    expect(ghost.priority).toBe('');
  }

  @Verifies<TraceCoreFeature>('handlesUnknownPriorityInImpactSort')
  'handles unknown priority (sort fallback 9)'() {
    const manifest: BindingsManifest = {
      F3: { wx: [{ file: 'src/w.ts', symbol: 'w' }] },
      F1: { ac1: [{ file: 'src/w.ts', symbol: 'a' }] },
    };
    const idx = buildTraceIndex([FEATURE_A, FEATURE_WEIRD], manifest, []);
    const r = queryImpact(idx, ['src/w.ts']);
    // critical (F1) should precede weirdprio (F3) due to fallback 9
    expect(r.impactedFeatures.map(f => f.id)).toEqual(['F1', 'F3']);
  }

  @Verifies<TraceCoreFeature>('handlesUnknownPriorityInImpactSort')
  'handles two unknown priorities (both sides hit fallback)'() {
    const W2: FeatureMeta = { ...FEATURE_WEIRD, id: 'F4', className: 'W2F', file: 'w2.ts', priority: 'alsoweird' };
    const manifest: BindingsManifest = {
      F3: { wx: [{ file: 'src/w.ts', symbol: 'a' }] },
      F4: { wx: [{ file: 'src/w.ts', symbol: 'b' }] },
    };
    const idx = buildTraceIndex([FEATURE_WEIRD, W2], manifest, []);
    const r = queryImpact(idx, ['src/w.ts']);
    expect(r.impactedFeatures.map(f => f.id).sort()).toEqual(['F3', 'F4']);
  }
}
void ImpactTests;

@FeatureTest(TraceCoreFeature)
class HotspotsTests {
  @Verifies<TraceCoreFeature>('sortsHotspotsByFeatureCountDesc')
  'sorts hotspots by feature count desc'() {
    const r = queryHotspots(makeIdx());
    expect(r[0]!.file).toBe('src/a.ts');
    expect(r[0]!.featureCount).toBe(2);
  }

  @Verifies<TraceCoreFeature>('respectsHotspotsLimit')
  'respects limit argument'() {
    const r = queryHotspots(makeIdx(), 1);
    expect(r).toHaveLength(1);
  }
}
void HotspotsTests;

@FeatureTest(TraceCoreFeature)
class FragileTests {
  @Verifies<TraceCoreFeature>('sortsFragileByFileCountDesc')
  'sorts fragile by file count desc'() {
    const r = queryFragile(makeIdx());
    expect(r[0]!.featureId).toBe('F2');
    expect(r[0]!.fileCount).toBe(2);
  }

  @Verifies<TraceCoreFeature>('respectsFragileLimit')
  'respects limit'() {
    const r = queryFragile(makeIdx(), 1);
    expect(r).toHaveLength(1);
  }

  @Verifies<TraceCoreFeature>('fragileFallsBackWhenFeatureNodeMissing')
  'falls back to empty title when feature node missing'() {
    const idx = makeIdx();
    const hackedNodes = new Map(idx.featureNodes as Map<string, FeatureNode>);
    hackedNodes.delete('F1');
    const hacked: TraceIndex = { ...idx, featureNodes: hackedNodes };
    const r = queryFragile(hacked);
    const f1 = r.find(e => e.featureId === 'F1')!;
    expect(f1.title).toBe('');
  }
}
void FragileTests;

@FeatureTest(TraceCoreFeature)
class FsmTests {
  @Verifies<TraceCoreFeature>('listsAllFsmsWhenNoFilter')
  'lists all FSMs when no filter'() {
    const idx = makeIdx();
    const links: MachineLink[] = [
      { id: 'M1', name: 'NavMachine', file: 'src/lib/nav.ts', features: [{ id: 'F1', ac: 'ac1' }] },
      { id: 'M2', name: 'Other', file: 'src/lib/other.ts' },
    ];
    const r = queryFsm(links, idx.featureNodes);
    expect(r.entries).toHaveLength(2);
  }

  @Verifies<TraceCoreFeature>('filtersFsmsByNameCaseInsensitive')
  'filters FSMs by case-insensitive name'() {
    const idx = makeIdx();
    const links: MachineLink[] = [
      { id: 'M1', name: 'NavMachine', file: 'a' },
      { id: 'M2', name: 'Other', file: 'b' },
    ];
    const r = queryFsm(links, idx.featureNodes, 'nav');
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]!.name).toBe('NavMachine');
  }

  @Verifies<TraceCoreFeature>('handlesFsmWithoutFeatures')
  'handles FSM without features array'() {
    const idx = makeIdx();
    const links: MachineLink[] = [{ id: 'M', name: 'X', file: 'f' }];
    const r = queryFsm(links, idx.featureNodes);
    expect(r.entries[0]!.features).toEqual([]);
  }

  @Verifies<TraceCoreFeature>('handlesFsmFeatureWithUnknownId')
  'null title for unknown feature id'() {
    const idx = makeIdx();
    const links: MachineLink[] = [
      { id: 'M', name: 'X', file: 'f', features: [{ id: 'UNKNOWN', ac: 'ac' }] },
    ];
    const r = queryFsm(links, idx.featureNodes);
    expect(r.entries[0]!.features[0]!.featureTitle).toBeNull();
  }

}
void FsmTests;
