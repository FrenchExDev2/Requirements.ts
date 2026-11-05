import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ComplianceReportFeature } from '@frenchexdev2/requirements-requirements';
import {
  validateFsmFeatureLinks,
  scanTestFiles,
  computeBindingsSummary,
  crossReference,
  type TestRef,
} from '../../src/compliance-report';
import type { FeatureMeta, FileCov } from '../../src/compliance-core';
import type { BindingsManifest } from '@frenchexdev2/requirements-scanner';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

async function withTmp(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cr-scan-'));
  try { await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

@FeatureTest(ComplianceReportFeature)
class ValidateFsmFeatureLinksTests {
  @Verifies<ComplianceReportFeature>('validateFsmReturnsEmptyBucketsForAllLinked')
  'all machines properly linked → empty buckets'() {
    const acs = new Map([['F1', new Set(['ac1'])]]);
    const r = validateFsmFeatureLinks(
      [{ id: 'M', name: 'M', file: 'm.ts', features: [{ id: 'F1', ac: 'ac1' }] }],
      acs,
    );
    expect(r).toEqual({ unlinked: [], unknownFeat: [], unknownAc: [] });
  }
  @Verifies<ComplianceReportFeature>('validateFsmDetectsMachineWithoutFeatures')
  'machine without features property → unlinked'() {
    const r = validateFsmFeatureLinks([{ id: 'M', name: 'M', file: 'm.ts' }], new Map());
    expect(r.unlinked).toEqual(['M  (m.ts)']);
  }
  @Verifies<ComplianceReportFeature>('validateFsmDetectsMachineWithEmptyFeaturesArray')
  'machine with empty features array → unlinked'() {
    const r = validateFsmFeatureLinks(
      [{ id: 'M', name: 'M', file: 'm.ts', features: [] }],
      new Map(),
    );
    expect(r.unlinked).toEqual(['M  (m.ts)']);
  }
  @Verifies<ComplianceReportFeature>('validateFsmDetectsUnknownFeatureId')
  'unknown feature id → unknownFeat'() {
    const r = validateFsmFeatureLinks(
      [{ id: 'M', name: 'M', file: 'm.ts', features: [{ id: 'GHOST', ac: 'ac1' }] }],
      new Map(),
    );
    expect(r.unknownFeat).toHaveLength(1);
    expect(r.unknownFeat[0]).toContain("'GHOST'");
  }
  @Verifies<ComplianceReportFeature>('validateFsmDetectsUnknownAcOnKnownFeature')
  'known feature but unknown AC → unknownAc'() {
    const acs = new Map([['F1', new Set(['real'])]]);
    const r = validateFsmFeatureLinks(
      [{ id: 'M', name: 'M', file: 'm.ts', features: [{ id: 'F1', ac: 'ghost' }] }],
      acs,
    );
    expect(r.unknownAc[0]).toContain('F1/ghost');
  }
  @Verifies<ComplianceReportFeature>('validateFsmHandlesMultipleFeatureLinksOnOneMachine')
  'multiple feature links collected separately'() {
    const acs = new Map([['F1', new Set(['ok'])]]);
    const r = validateFsmFeatureLinks(
      [{
        id: 'M', name: 'M', file: 'm.ts',
        features: [{ id: 'F1', ac: 'ok' }, { id: 'UNK', ac: 'x' }, { id: 'F1', ac: 'bad' }],
      }],
      acs,
    );
    expect(r.unknownFeat).toHaveLength(1);
    expect(r.unknownAc).toHaveLength(1);
    expect(r.unlinked).toHaveLength(0);
  }
}

@FeatureTest(ComplianceReportFeature)
class ScanTestFilesTests {
  @Verifies<ComplianceReportFeature>('scanTestFilesSkipsMissingDirs')
  async 'returns empty array when no dirs exist'() {
    const { realFileSystem } = await realFs();
    const bogus = path.join(os.tmpdir(), 'does-not-exist-' + Date.now());
    expect(await scanTestFiles([bogus], bogus, realFileSystem)).toEqual([]);
  }

  @Verifies<ComplianceReportFeature>('scanTestFilesIgnoresNonTsJsFiles')
  async 'ignores .md / .json entries and extracts from .ts'() {
    await withTmp(async root => {
      await fs.mkdir(path.join(root, 'test/unit'), { recursive: true });
      await fs.writeFile(path.join(root, 'test/unit/notes.md'), 'no tests here');
      await fs.writeFile(
        path.join(root, 'test/unit/a.test.ts'),
        `@Verifies<FooFeature>('ac1')\n'does a'() {}\n`,
      );
      const { realFileSystem } = await realFs();
      const refs = await scanTestFiles([path.join(root, 'test/unit')], root, realFileSystem);
      expect(refs.map(r => r.ac)).toEqual(['ac1']);
    });
  }

  @Verifies<ComplianceReportFeature>('scanTestFilesRecursesIntoSubdirectories')
  async 'recurses into nested directories'() {
    await withTmp(async root => {
      await fs.mkdir(path.join(root, 'test/unit/nested'), { recursive: true });
      await fs.writeFile(
        path.join(root, 'test/unit/nested/inner.test.ts'),
        `@Verifies<F>('deep')\n'x'() {}\n`,
      );
      const { realFileSystem } = await realFs();
      const refs = await scanTestFiles([path.join(root, 'test/unit')], root, realFileSystem);
      expect(refs.map(r => r.ac)).toEqual(['deep']);
    });
  }

  @Verifies<ComplianceReportFeature>('scanTestFilesExtractsVerifiesDecorator')
  async 'extracts @Verifies with feature and AC name and following test name'() {
    await withTmp(async root => {
      await fs.mkdir(path.join(root, 'test/unit'), { recursive: true });
      const src = `
@Verifies<MyFeature>('doesThing')
async 'my named test'() { }
`;
      await fs.writeFile(path.join(root, 'test/unit/t.test.ts'), src);
      const { realFileSystem } = await realFs();
      const refs = await scanTestFiles([path.join(root, 'test/unit')], root, realFileSystem);
      expect(refs[0]).toMatchObject({
        feature: 'MyFeature', ac: 'doesThing', testName: 'my named test', level: 'unit',
      });
    });
  }

  @Verifies<ComplianceReportFeature>('scanTestFilesUnnamedTestFallback')
  async 'uses (unnamed) fallback when no name follows'() {
    await withTmp(async root => {
      await fs.mkdir(path.join(root, 'test/unit'), { recursive: true });
      await fs.writeFile(path.join(root, 'test/unit/x.test.ts'), `@Verifies<F>('ac1')`);
      const { realFileSystem } = await realFs();
      const refs = await scanTestFiles([path.join(root, 'test/unit')], root, realFileSystem);
      expect(refs[0]!.testName).toBe('(unnamed)');
    });
  }

  @Verifies<ComplianceReportFeature>('scanTestFilesExtractsFeatureTestWithCoversAcs')
  async '@FeatureTest class with static coversACs = [...]'() {
    await withTmp(async root => {
      await fs.mkdir(path.join(root, 'test/unit'), { recursive: true });
      const src = `
@FeatureTest(MyFeature)
class DynamicTests {
  static readonly coversACs: string[] = ['one', 'two'];
}
`;
      await fs.writeFile(path.join(root, 'test/unit/dyn.test.ts'), src);
      const { realFileSystem } = await realFs();
      const refs = await scanTestFiles([path.join(root, 'test/unit')], root, realFileSystem);
      expect(refs.map(r => r.ac).sort()).toEqual(['one', 'two']);
      expect(refs[0]!.testName).toContain('DynamicTests');
    });
  }

  @Verifies<ComplianceReportFeature>('scanTestFilesExtractsFeatureTestWithCoversAcs')
  async 'coversACs with no quoted strings falls back to empty list'() {
    await withTmp(async root => {
      await fs.mkdir(path.join(root, 'test/unit'), { recursive: true });
      const src = `
@FeatureTest(MyFeature)
class WeirdDyn {
  static readonly coversACs = [...someSpread]
}
`;
      await fs.writeFile(path.join(root, 'test/unit/weird.test.ts'), src);
      const { realFileSystem } = await realFs();
      const refs = await scanTestFiles([path.join(root, 'test/unit')], root, realFileSystem);
      expect(refs).toEqual([]);
    });
  }

  @Verifies<ComplianceReportFeature>('scanTestFilesHandlesFeatureTestWithoutCoversAcs')
  async '@FeatureTest class without coversACs → no dynamic refs'() {
    await withTmp(async root => {
      await fs.mkdir(path.join(root, 'test/unit'), { recursive: true });
      const src = `
@FeatureTest(MyFeature)
class Plain {
}
`;
      await fs.writeFile(path.join(root, 'test/unit/plain.test.ts'), src);
      const { realFileSystem } = await realFs();
      const refs = await scanTestFiles([path.join(root, 'test/unit')], root, realFileSystem);
      expect(refs).toEqual([]);
    });
  }

  @Verifies<ComplianceReportFeature>('scanTestFilesExtractsLegacyFeatTag')
  async 'extracts legacy @FEAT:N tags from test() string names'() {
    await withTmp(async root => {
      await fs.mkdir(path.join(root, 'test/unit'), { recursive: true });
      const src = `test('legacy name @FEAT:3', () => {});`;
      await fs.writeFile(path.join(root, 'test/unit/legacy.test.ts'), src);
      const { realFileSystem } = await realFs();
      const refs = await scanTestFiles([path.join(root, 'test/unit')], root, realFileSystem);
      expect(refs[0]).toMatchObject({ feature: 'FEAT', featureId: 'FEAT', ac: 'ac3' });
    });
  }

  @Verifies<ComplianceReportFeature>('scanTestFilesInfersE2eLevel')
  async 'infers e2e from test/e2e/ path'() {
    await verifyLevel('test/e2e', 'e2e');
  }
  @Verifies<ComplianceReportFeature>('scanTestFilesInfersA11yLevel')
  async 'infers a11y'() {
    await verifyLevel('test/a11y', 'a11y');
  }
  @Verifies<ComplianceReportFeature>('scanTestFilesInfersVisualLevel')
  async 'infers visual'() {
    await verifyLevel('test/visual', 'visual');
  }
  @Verifies<ComplianceReportFeature>('scanTestFilesInfersPerfLevel')
  async 'infers perf'() {
    await verifyLevel('test/perf', 'perf');
  }
  @Verifies<ComplianceReportFeature>('scanTestFilesInfersUnitLevelByDefault')
  async 'defaults to unit for test/unit'() {
    await verifyLevel('test/unit', 'unit');
  }
  @Verifies<ComplianceReportFeature>('scanTestFilesInfersSmokeLevel')
  async 'infers smoke from test/smoke/ path'() {
    await verifyLevel('test/smoke', 'smoke');
  }
}

async function realFs() {
  const mod = await import('fs/promises');
  const realFileSystem = {
    async readFile(p: string, enc: 'utf8') { return mod.readFile(p, enc); },
    async writeFile(p: string, c: string) { await mod.writeFile(p, c, 'utf8'); },
    async exists(p: string) { try { await mod.access(p); return true; } catch { return false; } },
    async mkdir(p: string, opts?: { recursive?: boolean }) { await mod.mkdir(p, opts); },
    async readdir(p: string) { return mod.readdir(p); },
    async stat(p: string) {
      const st = await mod.stat(p);
      return { mtimeMs: st.mtimeMs, size: st.size, isDirectory: () => st.isDirectory() };
    },
  };
  return { realFileSystem };
}

async function verifyLevel(sub: string, expected: string): Promise<void> {
  await withTmp(async root => {
    await fs.mkdir(path.join(root, sub), { recursive: true });
    await fs.writeFile(path.join(root, sub, 'x.test.ts'), `@Verifies<F>('ac1')\n'n'() {}\n`);
    const { realFileSystem } = await realFs();
    const refs = await scanTestFiles([path.join(root, sub)], root, realFileSystem);
    expect(refs[0]!.level).toBe(expected);
  });
}

// ── computeBindingsSummary ────────────────────────────────────────────────
const fmeta = (over: Partial<FeatureMeta> = {}): FeatureMeta => ({
  id: 'F1', title: 'F1', priority: 'medium',
  acMethods: ['a', 'b'], acDetails: [
    { name: 'a', expectedLevels: ['unit'] }, { name: 'b', expectedLevels: ['unit'] },
  ],
  enabled: true, className: 'F1Feature', file: 'f.ts', satisfies: [], ...over,
});

@FeatureTest(ComplianceReportFeature)
class ComputeBindingsSummaryTests {
  @Verifies<ComplianceReportFeature>('computeBindingsReturnsDisabledWhenFeatureDisabled')
  'disabled feature short-circuits'() {
    const r = computeBindingsSummary(fmeta({ enabled: false }), null);
    expect(r).toEqual({ status: 'disabled', totalAcs: 2, boundAcs: 0, symbols: [] });
  }
  @Verifies<ComplianceReportFeature>('computeBindingsReturnsUnboundWhenNoManifest')
  'no manifest → unbound'() {
    const r = computeBindingsSummary(fmeta(), null);
    expect(r.status).toBe('unbound');
    expect(r.boundAcs).toBe(0);
  }
  @Verifies<ComplianceReportFeature>('computeBindingsReturnsBoundWhenAllAcsTargeted')
  'all ACs targeted → bound'() {
    const m: BindingsManifest = {
      F1: { a: [{ file: 's.ts', symbol: 'fa' }], b: [{ file: 's.ts', symbol: 'fb' }] },
    };
    const r = computeBindingsSummary(fmeta(), m);
    expect(r.status).toBe('bound');
    expect(r.boundAcs).toBe(2);
    expect(r.symbols).toHaveLength(2);
  }
  @Verifies<ComplianceReportFeature>('computeBindingsReturnsPartialWhenSomeAcsTargeted')
  'some ACs targeted → partial'() {
    const m: BindingsManifest = { F1: { a: [{ file: 's.ts', symbol: 'fa' }] } };
    const r = computeBindingsSummary(fmeta(), m);
    expect(r.status).toBe('partial');
    expect(r.boundAcs).toBe(1);
  }
  @Verifies<ComplianceReportFeature>('computeBindingsReturnsUnboundWhenFeatureMissingFromManifest')
  'feature absent from manifest → unbound'() {
    const m: BindingsManifest = { OTHER: { a: [{ file: 's.ts', symbol: 'f' }] } };
    const r = computeBindingsSummary(fmeta(), m);
    expect(r.status).toBe('unbound');
  }
  @Verifies<ComplianceReportFeature>('computeBindingsFlattensSymbolsIntoArray')
  'flattens multiple targets per AC into symbols array'() {
    const m: BindingsManifest = {
      F1: {
        a: [{ file: 's.ts', symbol: 'fa' }, { file: 's.ts', symbol: 'fa2' }],
        b: [{ file: 't.ts', symbol: 'fb' }],
      },
    };
    const r = computeBindingsSummary(fmeta(), m);
    expect(r.symbols).toHaveLength(3);
  }
  @Verifies<ComplianceReportFeature>('computeBindingsReturnsPartialWhenSomeAcsTargeted')
  'AC with empty targets array is treated as unbound'() {
    const m: BindingsManifest = { F1: { a: [] } };
    const r = computeBindingsSummary(fmeta(), m);
    expect(r.boundAcs).toBe(0);
    expect(r.status).toBe('unbound');
  }
}

// ── crossReference ────────────────────────────────────────────────────────
@FeatureTest(ComplianceReportFeature)
class CrossReferenceTests {
  @Verifies<ComplianceReportFeature>('crossRefBackfillsFeatureIdFromClassName')
  'backfills featureId from className when missing'() {
    const features = [fmeta({ className: 'MyFeature', id: 'MY', acMethods: ['a'], acDetails: [{ name: 'a', expectedLevels: ['unit'] }] })];
    const refs: TestRef[] = [
      { feature: 'MyFeature', featureId: '', ac: 'a', testFile: 't.ts', testName: 'x', level: 'unit' },
    ];
    const out = crossReference(features, refs, null, null);
    expect(refs[0]!.featureId).toBe('MY');
    expect(out[0]!.acs[0]!.covered).toBe(true);
  }
  @Verifies<ComplianceReportFeature>('crossRefKeepsExistingFeatureId')
  'keeps pre-existing featureId on refs'() {
    const features = [fmeta({ className: 'MyFeature', id: 'MY', acMethods: ['a'], acDetails: [{ name: 'a', expectedLevels: ['unit'] }] })];
    const refs: TestRef[] = [
      { feature: 'X', featureId: 'MY', ac: 'a', testFile: 't.ts', testName: 'x', level: 'unit' },
    ];
    crossReference(features, refs, null, null);
    expect(refs[0]!.featureId).toBe('MY');
  }
  @Verifies<ComplianceReportFeature>('crossRefBackfillsFeatureIdFromClassName')
  'when class name not mapped, falls back to feature string itself'() {
    const features = [fmeta({ className: 'Z', id: 'Z', acMethods: ['a'], acDetails: [{ name: 'a', expectedLevels: ['unit'] }] })];
    const refs: TestRef[] = [
      { feature: 'UnknownCls', featureId: '', ac: 'a', testFile: 't.ts', testName: 'x', level: 'unit' },
    ];
    crossReference(features, refs, null, null);
    expect(refs[0]!.featureId).toBe('UnknownCls');
  }
  @Verifies<ComplianceReportFeature>('crossRefMatchesTestsToAcs')
  'matching tests flow into ACCoverage'() {
    const features = [fmeta({ className: 'F1Feature', id: 'F1', acMethods: ['a'], acDetails: [{ name: 'a', expectedLevels: ['unit'] }] })];
    const refs: TestRef[] = [
      { feature: 'F1Feature', featureId: '', ac: 'a', testFile: 't.ts', testName: 'n', level: 'unit' },
    ];
    const out = crossReference(features, refs, null, null);
    expect(out[0]!.coveredCount).toBe(1);
    expect(out[0]!.percentage).toBe(100);
  }
  @Verifies<ComplianceReportFeature>('crossRefReportsPercentageAt100WhenNoAcs')
  'feature with zero ACs → 100% by convention'() {
    const features = [fmeta({ acMethods: [], acDetails: [] })];
    const out = crossReference(features, [], null, null);
    expect(out[0]!.percentage).toBe(100);
    expect(out[0]!.totalCount).toBe(0);
  }
  @Verifies<ComplianceReportFeature>('crossRefComputesCoveredAndGapLevels')
  'distinguishes covered vs gap levels'() {
    const features = [fmeta({
      className: 'F1Feature', id: 'F1',
      acMethods: ['a'],
      acDetails: [{ name: 'a', expectedLevels: ['unit', 'e2e'] }],
    })];
    const refs: TestRef[] = [
      { feature: 'F1Feature', featureId: '', ac: 'a', testFile: 't.ts', testName: 'n', level: 'unit' },
    ];
    const out = crossReference(features, refs, null, null);
    expect(out[0]!.acs[0]!.coveredLevels).toEqual(['unit']);
    expect(out[0]!.acs[0]!.gapLevels).toEqual(['e2e']);
  }
  @Verifies<ComplianceReportFeature>('crossRefFallsBackToUnitWhenNoAcDetails')
  'AC without acDetails entry defaults expectedLevels to [unit]'() {
    const features = [fmeta({
      className: 'F1Feature', id: 'F1',
      acMethods: ['orphan'],
      acDetails: [], // empty: no matching detail
    })];
    const out = crossReference(features, [], null, null);
    expect(out[0]!.acs[0]!.expectedLevels).toEqual(['unit']);
  }
  @Verifies<ComplianceReportFeature>('crossRefDerivesSourceFilesFromManifest')
  'derives sourceFiles set from manifest targets'() {
    const features = [fmeta({ id: 'F1', acMethods: ['a'], acDetails: [{ name: 'a', expectedLevels: ['unit'] }] })];
    const manifest: BindingsManifest = {
      F1: { a: [{ file: 'src/one.ts', symbol: 'x' }, { file: 'src/two.ts', symbol: 'y' }] },
    };
    const out = crossReference(features, [], null, manifest);
    expect(out[0]!.sourceFiles).toEqual(['src/one.ts', 'src/two.ts']);
  }
  @Verifies<ComplianceReportFeature>('crossRefFiltersDerivedFilesByCoverageMap')
  'filters derived files to those present in coverage map'() {
    const features = [fmeta({ id: 'F1', acMethods: ['a'], acDetails: [{ name: 'a', expectedLevels: ['unit'] }] })];
    const manifest: BindingsManifest = {
      F1: { a: [{ file: 'src/keep.ts', symbol: 'x' }, { file: 'src/drop.ts', symbol: 'y' }] },
    };
    const cov = new Map<string, FileCov>([
      ['src/keep.ts', { lines: 100, branches: 100, functions: 100, statements: 100 }],
    ]);
    const out = crossReference(features, [], cov, manifest);
    expect(out[0]!.sourceFiles).toEqual(['src/keep.ts']);
  }
  @Verifies<ComplianceReportFeature>('crossRefKeepsAllFilesWhenCoverageNull')
  'keeps all derived files when coverage null'() {
    const features = [fmeta({ id: 'F1', acMethods: ['a'], acDetails: [{ name: 'a', expectedLevels: ['unit'] }] })];
    const manifest: BindingsManifest = {
      F1: { a: [{ file: 'src/x.ts', symbol: 'x' }] },
    };
    const out = crossReference(features, [], null, manifest);
    expect(out[0]!.sourceFiles).toEqual(['src/x.ts']);
  }
  @Verifies<ComplianceReportFeature>('crossRefReturnsEmptyFilesWhenNoManifest')
  'no manifest → empty derivedFiles'() {
    const features = [fmeta()];
    const out = crossReference(features, [], null, null);
    expect(out[0]!.sourceFiles).toEqual([]);
  }
  @Verifies<ComplianceReportFeature>('crossRefReturnsEmptyFilesWhenFeatureAbsentFromManifest')
  'feature absent from manifest → empty derivedFiles'() {
    const features = [fmeta({ id: 'F1' })];
    const manifest: BindingsManifest = { OTHER: { a: [{ file: 'x', symbol: 'y' }] } };
    const out = crossReference(features, [], null, manifest);
    expect(out[0]!.sourceFiles).toEqual([]);
  }
  @Verifies<ComplianceReportFeature>('crossRefMapsSatisfiesClassNamesThroughReqClassToId')
  'satisfies class names are mapped through reqClassToId'() {
    const features = [fmeta({
      id: 'F1', acMethods: [], acDetails: [],
      satisfies: ['ReqOneRequirement', 'ReqTwoRequirement'],
    })];
    const reqClassToId = new Map([
      ['ReqOneRequirement', 'REQ-ONE'],
      ['ReqTwoRequirement', 'REQ-TWO'],
    ]);
    const out = crossReference(features, [], null, null, reqClassToId);
    expect(out[0]!.satisfies).toEqual(['REQ-ONE', 'REQ-TWO']);
  }
  @Verifies<ComplianceReportFeature>('crossRefKeepsRawSatisfiesNameWhenClassMappingMisses')
  'satisfies falls back to raw class name when reqClassToId has no entry'() {
    const features = [fmeta({
      id: 'F1', acMethods: [], acDetails: [],
      satisfies: ['UnmappedRequirement'],
    })];
    const out = crossReference(features, [], null, null, new Map());
    expect(out[0]!.satisfies).toEqual(['UnmappedRequirement']);
  }
  @Verifies<ComplianceReportFeature>('crossRefDefaultsSatisfiesToEmptyWhenFeatureMetaOmitsField')
  'satisfies defaults to [] when the FeatureMeta is missing the field at runtime'() {
    const rogue = fmeta({ id: 'F1', acMethods: [], acDetails: [] });
    // Simulate a legacy meta without the satisfies field (cross-pkg or older layer).
    delete (rogue as Partial<FeatureMeta>).satisfies;
    const out = crossReference([rogue], [], null, null);
    expect(out[0]!.satisfies).toEqual([]);
  }
}

void ValidateFsmFeatureLinksTests;
void ScanTestFilesTests;
void ComputeBindingsSummaryTests;
void CrossReferenceTests;
