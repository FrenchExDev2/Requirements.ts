import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { TraceCoreFeature } from '@frenchexdev2/requirements-requirements';
import { buildTraceIndex, normalizePath } from '../../src/trace-core';
import type { FeatureMeta, TestRef } from '@frenchexdev2/requirements-compliance';
import type { BindingsManifest } from '@frenchexdev2/requirements-scanner';
import * as path from 'path';

const FEATURE_A: FeatureMeta = {
  id: 'F1',
  title: 'Feature One',
  priority: 'critical',
  acMethods: ['ac1', 'ac2'],
  acDetails: [
    { name: 'ac1', expectedLevels: ['unit'] },
    { name: 'ac2', expectedLevels: ['unit', 'e2e'] },
  ],
  enabled: true,
  className: 'OneFeature',
  file: 'one.ts',
  satisfies: [],
};

const FEATURE_B: FeatureMeta = {
  id: 'F2',
  title: 'Feature Two',
  priority: 'high',
  acMethods: ['bx'],
  acDetails: [{ name: 'bx', expectedLevels: ['unit'] }],
  enabled: true,
  className: 'TwoFeature',
  file: 'two.ts',
  satisfies: [],
};

@FeatureTest(TraceCoreFeature)
class BuildTraceIndexTests {
  @Verifies<TraceCoreFeature>('buildsFeatureNodesFromMeta')
  'builds feature nodes from meta'() {
    const idx = buildTraceIndex([FEATURE_A], {}, []);
    const node = idx.featureNodes.get('F1');
    expect(node).toBeDefined();
    expect(node!.title).toBe('Feature One');
    expect(node!.priority).toBe('critical');
    expect(node!.enabled).toBe(true);
    expect(node!.acs).toEqual(['ac1', 'ac2']);
    expect(idx.classToId.get('OneFeature')).toBe('F1');
  }

  @Verifies<TraceCoreFeature>('buildsFileToFeaturesFromManifest')
  'builds fileToFeatures from manifest'() {
    const manifest: BindingsManifest = {
      F1: { ac1: [{ file: 'src/a.ts', symbol: 'fnA' }] },
    };
    const idx = buildTraceIndex([FEATURE_A], manifest, []);
    expect([...idx.fileToFeatures.get('src/a.ts')!]).toEqual(['F1']);
  }

  @Verifies<TraceCoreFeature>('buildsFeatureToFilesFromManifest')
  'builds featureToFiles from manifest'() {
    const manifest: BindingsManifest = {
      F1: { ac1: [{ file: 'src/a.ts', symbol: 'fnA' }] },
    };
    const idx = buildTraceIndex([FEATURE_A], manifest, []);
    expect([...idx.featureToFiles.get('F1')!]).toEqual(['src/a.ts']);
  }

  @Verifies<TraceCoreFeature>('mergesAcsAndSymbolsPerFileFeature')
  'merges multiple acs/symbols per (file,feature)'() {
    const manifest: BindingsManifest = {
      F1: {
        ac1: [{ file: 'src/a.ts', symbol: 'fnA' }],
        ac2: [{ file: 'src/a.ts', symbol: 'fnB' }],
      },
    };
    const idx = buildTraceIndex([FEATURE_A], manifest, []);
    const node = idx.fileNodes.get('src/a.ts')!;
    expect(node.features).toHaveLength(1);
    expect([...node.features[0]!.acs].sort()).toEqual(['ac1', 'ac2']);
    expect([...node.features[0]!.symbols].sort()).toEqual(['fnA', 'fnB']);
  }

  @Verifies<TraceCoreFeature>('buildsFeatureToTestsViaFeatureId')
  'builds featureToTests using ref.featureId'() {
    const refs: TestRef[] = [
      { feature: 'OneFeature', featureId: 'F1', ac: 'ac1', testFile: 't/a.test.ts', testName: 't1', level: 'unit' },
    ];
    const idx = buildTraceIndex([FEATURE_A], {}, refs);
    expect([...idx.featureToTests.get('F1')!]).toEqual(['t/a.test.ts']);
  }

  @Verifies<TraceCoreFeature>('fallsBackToClassToIdWhenFeatureIdMissing')
  'falls back to classToId when featureId is empty'() {
    const refs: TestRef[] = [
      { feature: 'OneFeature', featureId: '', ac: 'ac1', testFile: 't/a.test.ts', testName: 't1', level: 'unit' },
    ];
    const idx = buildTraceIndex([FEATURE_A], {}, refs);
    expect(idx.featureToTests.get('F1')).toBeDefined();
  }

  @Verifies<TraceCoreFeature>('fallsBackToRawFeatureNameWhenClassNotMapped')
  'falls back to raw feature name when class is not mapped'() {
    const refs: TestRef[] = [
      { feature: 'Unmapped', featureId: '', ac: 'ac1', testFile: 't/a.test.ts', testName: 't1', level: 'unit' },
    ];
    const idx = buildTraceIndex([FEATURE_A], {}, refs);
    expect(idx.featureToTests.get('Unmapped')).toBeDefined();
  }

  @Verifies<TraceCoreFeature>('derivesFileToTestsByJoiningFeatures')
  'derives fileToTests by joining through features'() {
    const manifest: BindingsManifest = { F1: { ac1: [{ file: 'src/a.ts', symbol: 'fnA' }] } };
    const refs: TestRef[] = [
      { feature: 'OneFeature', featureId: 'F1', ac: 'ac1', testFile: 't/a.test.ts', testName: 't1', level: 'unit' },
    ];
    const idx = buildTraceIndex([FEATURE_A], manifest, refs);
    expect([...idx.fileToTests.get('src/a.ts')!]).toEqual(['t/a.test.ts']);
  }

  @Verifies<TraceCoreFeature>('buildsFileNodesWithFeatureAndTestLinks')
  'builds fileNodes with feature and test links'() {
    const manifest: BindingsManifest = { F1: { ac1: [{ file: 'src/a.ts', symbol: 'fnA' }] } };
    const refs: TestRef[] = [
      { feature: 'OneFeature', featureId: 'F1', ac: 'ac1', testFile: 't/a.test.ts', testName: 't1', level: 'unit' },
    ];
    const idx = buildTraceIndex([FEATURE_A], manifest, refs);
    const n = idx.fileNodes.get('src/a.ts')!;
    expect(n.features[0]!.featureId).toBe('F1');
    expect(n.tests[0]).toEqual({ testFile: 't/a.test.ts', testName: 't1', featureId: 'F1', ac: 'ac1' });
  }

  @Verifies<TraceCoreFeature>('handlesEmptyManifestAndEmptyTests')
  'handles empty manifest and empty tests'() {
    const idx = buildTraceIndex([FEATURE_A, FEATURE_B], {}, []);
    expect(idx.fileNodes.size).toBe(0);
    expect(idx.featureToFiles.size).toBe(0);
    expect(idx.featureToTests.size).toBe(0);
  }
}
void BuildTraceIndexTests;

@FeatureTest(TraceCoreFeature)
class NormalizePathTests {
  @Verifies<TraceCoreFeature>('normalizesAbsoluteWindowsPath')
  'normalises absolute path to posix relative'() {
    const root = path.resolve('/tmp/root');
    const abs = path.join(root, 'src', 'a.ts');
    expect(normalizePath(abs, root)).toBe('src/a.ts');
  }

  @Verifies<TraceCoreFeature>('normalizesRelativePath')
  'normalises a relative path'() {
    const root = path.resolve('/tmp/root');
    expect(normalizePath('src/a.ts', root)).toBe('src/a.ts');
  }
}
void NormalizePathTests;
