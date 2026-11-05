import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { TestBindingsScannerFeature } from '@frenchexdev2/requirements-requirements';
import {
  aggregateTestBindings,
  sortManifest,
  diffManifests,
  type BindingsManifest,
  type TestParseResult,
} from '../../src/test-bindings-scanner';

function parsed(p: Partial<TestParseResult> & { classes: TestParseResult['classes'] }): TestParseResult {
  return { file: p.file ?? 'test/a.test.ts', classes: p.classes, warnings: p.warnings ?? [] };
}

@FeatureTest(TestBindingsScannerFeature)
class AggregateTests {
  @Verifies<TestBindingsScannerFeature>('aggregatesMultipleClassesIntoManifest')
  'aggregates multiple parsed files into manifest'() {
    const input = {
      parsed: [
        parsed({ classes: [{
          className: 'T1', featureClass: 'F1',
          methods: [{ methodName: 'a', ac: 'ac1', targets: [{ file: 'src/a.ts', symbol: 'a' }] }],
        }] }),
        parsed({ classes: [{
          className: 'T2', featureClass: 'F2',
          methods: [{ methodName: 'b', ac: 'ac2', targets: [{ file: 'src/b.ts', symbol: 'b' }] }],
        }] }),
      ],
      classToId: new Map([['F1', 'FEAT-1'], ['F2', 'FEAT-2']]),
    };
    const out = aggregateTestBindings(input);
    expect(out.manifest['FEAT-1']!['ac1']).toEqual([{ file: 'src/a.ts', symbol: 'a' }]);
    expect(out.manifest['FEAT-2']!['ac2']).toEqual([{ file: 'src/b.ts', symbol: 'b' }]);
    expect(out.methodCount).toBe(2);
  }

  @Verifies<TestBindingsScannerFeature>('aggregateUsesClassToIdMapping')
  'uses classToId mapping when present'() {
    const out = aggregateTestBindings({
      parsed: [parsed({ classes: [{
        className: 'T', featureClass: 'MyFeat',
        methods: [{ methodName: 'x', ac: 'a', targets: [{ file: 'src/x.ts', symbol: 'x' }] }],
      }] })],
      classToId: new Map([['MyFeat', 'MY-ID']]),
    });
    expect(Object.keys(out.manifest)).toEqual(['MY-ID']);
  }

  @Verifies<TestBindingsScannerFeature>('aggregateFallsBackToClassNameWhenNoIdMapping')
  'falls back to featureClass when not in map'() {
    const out = aggregateTestBindings({
      parsed: [parsed({ classes: [{
        className: 'T', featureClass: 'Unknown',
        methods: [{ methodName: 'x', ac: 'a', targets: [{ file: 'src/x.ts', symbol: 'x' }] }],
      }] })],
      classToId: new Map(),
    });
    expect(Object.keys(out.manifest)).toEqual(['Unknown']);
  }

  @Verifies<TestBindingsScannerFeature>('aggregateRecordsEmptyMethods')
  'records methods with zero targets into emptyMethods'() {
    const out = aggregateTestBindings({
      parsed: [parsed({ file: 'test/f.test.ts', classes: [{
        className: 'T', featureClass: 'F',
        methods: [{ methodName: 'empty', ac: 'ac1', targets: [] }],
      }] })],
      classToId: new Map([['F', 'F-ID']]),
    });
    expect(out.emptyMethods).toEqual([{
      testFile: 'test/f.test.ts', className: 'T', methodName: 'empty',
      featureClass: 'F', featureId: 'F-ID', ac: 'ac1',
    }]);
    expect(out.manifest['F-ID']).toEqual({});
    expect(out.methodCount).toBe(1);
  }

  @Verifies<TestBindingsScannerFeature>('aggregateMergesTargetsAcrossClassesForSameAc')
  'merges targets across multiple classes pointing to same ac'() {
    const out = aggregateTestBindings({
      parsed: [
        parsed({ classes: [{
          className: 'T1', featureClass: 'F',
          methods: [{ methodName: 'a', ac: 'shared', targets: [{ file: 'src/a.ts', symbol: 'a' }] }],
        }] }),
        parsed({ classes: [{
          className: 'T2', featureClass: 'F',
          methods: [{ methodName: 'b', ac: 'shared', targets: [{ file: 'src/b.ts', symbol: 'b' }] }],
        }] }),
      ],
      classToId: new Map([['F', 'F']]),
    });
    expect(out.manifest['F']!['shared']).toEqual([
      { file: 'src/a.ts', symbol: 'a' },
      { file: 'src/b.ts', symbol: 'b' },
    ]);
  }

  @Verifies<TestBindingsScannerFeature>('aggregateDedupesTargetsByFileAndSymbol')
  'dedupes targets by (file, symbol) key'() {
    const out = aggregateTestBindings({
      parsed: [
        parsed({ classes: [{
          className: 'T1', featureClass: 'F',
          methods: [{ methodName: 'a', ac: 'same', targets: [{ file: 'src/a.ts', symbol: 'x' }] }],
        }] }),
        parsed({ classes: [{
          className: 'T2', featureClass: 'F',
          methods: [{ methodName: 'b', ac: 'same', targets: [{ file: 'src/a.ts', symbol: 'x' }] }],
        }] }),
      ],
      classToId: new Map(),
    });
    expect(out.manifest['F']!['same']).toEqual([{ file: 'src/a.ts', symbol: 'x' }]);
  }

  @Verifies<TestBindingsScannerFeature>('aggregatePropagatesParserWarnings')
  'propagates parser warnings'() {
    const out = aggregateTestBindings({
      parsed: [parsed({ classes: [], warnings: ['warn-1', 'warn-2'] })],
      classToId: new Map(),
    });
    expect(out.warnings).toEqual(['warn-1', 'warn-2']);
  }
}

@FeatureTest(TestBindingsScannerFeature)
class SortManifestTests {
  @Verifies<TestBindingsScannerFeature>('sortManifestSortsFeatureIds')
  'sorts featureIds alphabetically'() {
    const m: BindingsManifest = {
      Z: { a: [] }, A: { a: [] }, M: { a: [] },
    };
    expect(Object.keys(sortManifest(m))).toEqual(['A', 'M', 'Z']);
  }

  @Verifies<TestBindingsScannerFeature>('sortManifestSortsAcsWithinFeature')
  'sorts AC names within a feature'() {
    const m: BindingsManifest = { F: { z: [], a: [], m: [] } };
    expect(Object.keys(sortManifest(m)['F']!)).toEqual(['a', 'm', 'z']);
  }

  @Verifies<TestBindingsScannerFeature>('sortManifestSortsTargetsByFileThenSymbol')
  'sorts targets by file then symbol'() {
    const m: BindingsManifest = { F: { ac: [
      { file: 'src/b.ts', symbol: 'b' },
      { file: 'src/a.ts', symbol: 'z' },
      { file: 'src/a.ts', symbol: 'a' },
    ] } };
    expect(sortManifest(m)['F']!['ac']).toEqual([
      { file: 'src/a.ts', symbol: 'a' },
      { file: 'src/a.ts', symbol: 'z' },
      { file: 'src/b.ts', symbol: 'b' },
    ]);
  }
}

@FeatureTest(TestBindingsScannerFeature)
class DiffManifestsTests {
  @Verifies<TestBindingsScannerFeature>('diffReportsFeaturesOnlyInManual')
  'reports features only in manual'() {
    const d = diffManifests({ A: { a: [] } }, {});
    expect(d.featuresOnlyInManual).toEqual(['A']);
  }

  @Verifies<TestBindingsScannerFeature>('diffReportsFeaturesOnlyInInferred')
  'reports features only in inferred'() {
    const d = diffManifests({}, { B: { b: [] } });
    expect(d.featuresOnlyInInferred).toEqual(['B']);
  }

  @Verifies<TestBindingsScannerFeature>('diffReportsAcsOnlyInManual')
  'reports ACs only in manual for shared feature'() {
    const d = diffManifests(
      { F: { onlyMan: [], shared: [] } },
      { F: { shared: [] } },
    );
    expect(d.acsOnlyInManual).toEqual([{ featureId: 'F', ac: 'onlyMan' }]);
  }

  @Verifies<TestBindingsScannerFeature>('diffReportsAcsOnlyInInferred')
  'reports ACs only in inferred for shared feature'() {
    const d = diffManifests(
      { F: { shared: [] } },
      { F: { shared: [], onlyInf: [] } },
    );
    expect(d.acsOnlyInInferred).toEqual([{ featureId: 'F', ac: 'onlyInf' }]);
  }

  @Verifies<TestBindingsScannerFeature>('diffReportsSymbolsOnlyInManual')
  'reports symbols only in manual'() {
    const d = diffManifests(
      { F: { ac: [{ file: 'src/a.ts', symbol: 'only' }, { file: 'src/b.ts', symbol: 'both' }] } },
      { F: { ac: [{ file: 'src/b.ts', symbol: 'both' }] } },
    );
    expect(d.symbolsOnlyInManual).toEqual([{ featureId: 'F', ac: 'ac', target: { file: 'src/a.ts', symbol: 'only' } }]);
  }

  @Verifies<TestBindingsScannerFeature>('diffReportsSymbolsOnlyInInferred')
  'reports symbols only in inferred'() {
    const d = diffManifests(
      { F: { ac: [{ file: 'src/b.ts', symbol: 'both' }] } },
      { F: { ac: [{ file: 'src/a.ts', symbol: 'only' }, { file: 'src/b.ts', symbol: 'both' }] } },
    );
    expect(d.symbolsOnlyInInferred).toEqual([{ featureId: 'F', ac: 'ac', target: { file: 'src/a.ts', symbol: 'only' } }]);
  }

  @Verifies<TestBindingsScannerFeature>('diffWalksAcsOfFeaturesOnlyInInferred')
  'walks ACs of features only in inferred manifest'() {
    const d = diffManifests(
      {},
      { F: { ac1: [{ file: 'src/a.ts', symbol: 's' }] } },
    );
    expect(d.featuresOnlyInInferred).toEqual(['F']);
    expect(d.acsOnlyInInferred).toEqual([{ featureId: 'F', ac: 'ac1' }]);
    expect(d.symbolsOnlyInInferred).toEqual([{ featureId: 'F', ac: 'ac1', target: { file: 'src/a.ts', symbol: 's' } }]);
  }

  @Verifies<TestBindingsScannerFeature>('diffWalksAcsOfFeaturesOnlyInInferred')
  'handles feature-only-in-inferred with empty ac list (defaults branch)'() {
    // exercise the `?? []` default on infAcs[ac] in the outer inferred-only loop
    const d = diffManifests({}, { F: {} });
    expect(d.featuresOnlyInInferred).toEqual(['F']);
    expect(d.acsOnlyInInferred).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('diffEmptyForIdenticalManifests')
  'returns all-empty diff for identical manifests'() {
    const m: BindingsManifest = { F: { ac: [{ file: 'src/a.ts', symbol: 'x' }] } };
    const d = diffManifests(m, m);
    expect(d.featuresOnlyInManual).toEqual([]);
    expect(d.featuresOnlyInInferred).toEqual([]);
    expect(d.acsOnlyInManual).toEqual([]);
    expect(d.acsOnlyInInferred).toEqual([]);
    expect(d.symbolsOnlyInManual).toEqual([]);
    expect(d.symbolsOnlyInInferred).toEqual([]);
  }
}

void AggregateTests;
void SortManifestTests;
void DiffManifestsTests;
