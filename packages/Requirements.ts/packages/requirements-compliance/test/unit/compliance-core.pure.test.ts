import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ComplianceCoreFeature } from '@frenchexdev2/requirements-requirements';
import {
  normalizeCoveragePath,
  computeRuntimeCoverage,
  findOrphanSourceFiles,
  type FileCov,
  type FeatureMeta,
} from '../../src/compliance-core';

const cov = (lines: number, branches = lines, functions = lines, statements = lines): FileCov =>
  ({ lines, branches, functions, statements });

const feature = (id: string): FeatureMeta => ({
  id,
  title: id,
  priority: 'medium',
  acMethods: [],
  acDetails: [],
  enabled: true,
  className: id,
  file: `${id}.ts`,
  satisfies: [],
});

@FeatureTest(ComplianceCoreFeature)
class NormalizeCoveragePathTests {
  @Verifies<ComplianceCoreFeature>('normalizesAbsoluteWindowsPath')
  'strips a Windows absolute path prefix to a posix relative path'() {
    const root = 'C:\\repo';
    const result = normalizeCoveragePath('C:\\repo\\src\\lib\\foo.ts', root);
    expect(result).toBe('src/lib/foo.ts');
    expect(normalizeCoveragePath('C:/repo/src/lib/foo.ts', root)).toBe('src/lib/foo.ts');
    expect(normalizeCoveragePath('\\\\server\\share\\repo\\src\\file.ts', '\\\\server\\share\\repo')).toBe('src/file.ts');
  }

  @Verifies<ComplianceCoreFeature>('normalizesAbsolutePosixPath')
  'strips a posix absolute path prefix to a relative path'() {
    const root = '/home/user/repo';
    const result = normalizeCoveragePath('/home/user/repo/src/lib/foo.ts', root);
    expect(result).toBe('src/lib/foo.ts');
  }

  @Verifies<ComplianceCoreFeature>('preservesRelativePathAndConvertsBackslashes')
  'preserves a relative path and converts backslashes to forward slashes'() {
    const result = normalizeCoveragePath('src\\lib\\bar.ts', '/anything');
    expect(result).toBe('src/lib/bar.ts');
  }
}

@FeatureTest(ComplianceCoreFeature)
class ComputeRuntimeCoverageTests {
  @Verifies<ComplianceCoreFeature>('runtimeCoverageDisabledFeature')
  'returns disabled status when enabled=false'() {
    const r = computeRuntimeCoverage(['a.ts', 'b.ts'], new Map(), false);
    expect(r.status).toBe('disabled');
    expect(r.declared).toBe(2);
    expect(r.found).toBe(0);
    expect(r.missing).toEqual([]);
    expect(r.minLinesPct).toBeNull();
  }

  @Verifies<ComplianceCoreFeature>('runtimeCoverageNoSourceFiles')
  'returns ok with zero counts when no source files declared'() {
    const r = computeRuntimeCoverage([], new Map([['x.ts', cov(80)]]));
    expect(r.status).toBe('ok');
    expect(r.declared).toBe(0);
    expect(r.found).toBe(0);
  }

  @Verifies<ComplianceCoreFeature>('runtimeCoverageNullCoverageMap')
  'returns missing with all source files when coverage map is null'() {
    const r = computeRuntimeCoverage(['a.ts', 'b.ts'], null);
    expect(r.status).toBe('missing');
    expect(r.declared).toBe(2);
    expect(r.found).toBe(0);
    expect(r.missing).toEqual(['a.ts', 'b.ts']);
    expect(r.minLinesPct).toBeNull();
  }

  @Verifies<ComplianceCoreFeature>('runtimeCoverageAllPresentReturnsOk')
  'returns ok when every source file has coverage'() {
    const map = new Map<string, FileCov>([
      ['a.ts', cov(90)],
      ['b.ts', cov(75)],
    ]);
    const r = computeRuntimeCoverage(['a.ts', 'b.ts'], map);
    expect(r.status).toBe('ok');
    expect(r.found).toBe(2);
    expect(r.missing).toEqual([]);
  }

  @Verifies<ComplianceCoreFeature>('runtimeCoverageSomeMissingReturnsPartial')
  'returns partial when some files are present and some missing'() {
    const map = new Map<string, FileCov>([['a.ts', cov(90)]]);
    const r = computeRuntimeCoverage(['a.ts', 'b.ts'], map);
    expect(r.status).toBe('partial');
    expect(r.found).toBe(1);
    expect(r.missing).toEqual(['b.ts']);
  }

  @Verifies<ComplianceCoreFeature>('runtimeCoverageAllMissingReturnsMissing')
  'returns missing when none of the declared files appear in coverage'() {
    const map = new Map<string, FileCov>([['other.ts', cov(50)]]);
    const r = computeRuntimeCoverage(['a.ts'], map);
    expect(r.status).toBe('missing');
    expect(r.found).toBe(0);
    expect(r.missing).toEqual(['a.ts']);
  }

  @Verifies<ComplianceCoreFeature>('runtimeCoverageReportsMinLinesPct')
  'reports the minimum lines percentage across present files'() {
    const map = new Map<string, FileCov>([
      ['a.ts', cov(90)],
      ['b.ts', cov(60)],
      ['c.ts', cov(75)],
    ]);
    const r = computeRuntimeCoverage(['a.ts', 'b.ts', 'c.ts'], map);
    expect(r.minLinesPct).toBe(60);
  }
}

@FeatureTest(ComplianceCoreFeature)
class FindOrphanSourceFilesTests {
  @Verifies<ComplianceCoreFeature>('findOrphanReturnsUnclaimedCoverageKeys')
  'returns coverage keys not claimed by any feature'() {
    const cov_ = new Map<string, FileCov>([
      ['claimed.ts', cov(80)],
      ['orphan.ts', cov(50)],
    ]);
    const derived = new Map<string, readonly string[]>([['F1', ['claimed.ts']]]);
    const orphans = findOrphanSourceFiles([feature('F1')], cov_, derived);
    expect(orphans).toEqual([{ file: 'orphan.ts', linesPct: 50 }]);
  }

  @Verifies<ComplianceCoreFeature>('findOrphanExcludesClaimedFiles')
  'excludes every file claimed by any feature'() {
    const cov_ = new Map<string, FileCov>([
      ['a.ts', cov(80)],
      ['b.ts', cov(80)],
      ['c.ts', cov(80)],
    ]);
    const derived = new Map<string, readonly string[]>([
      ['F1', ['a.ts']],
      ['F2', ['b.ts', 'c.ts']],
    ]);
    const orphans = findOrphanSourceFiles([feature('F1'), feature('F2')], cov_, derived);
    expect(orphans).toEqual([]);
  }

  @Verifies<ComplianceCoreFeature>('findOrphanSortsAlphabetically')
  'sorts orphans by filename ascending'() {
    const cov_ = new Map<string, FileCov>([
      ['z.ts', cov(50)],
      ['a.ts', cov(60)],
      ['m.ts', cov(70)],
    ]);
    const orphans = findOrphanSourceFiles([], cov_, new Map());
    expect(orphans.map(o => o.file)).toEqual(['a.ts', 'm.ts', 'z.ts']);
  }

  @Verifies<ComplianceCoreFeature>('findOrphanHandlesFeatureWithoutDerivedFiles')
  'treats a feature with no derived files as claiming nothing'() {
    const cov_ = new Map<string, FileCov>([['lonely.ts', cov(50)]]);
    const orphans = findOrphanSourceFiles([feature('F1')], cov_, new Map());
    expect(orphans).toEqual([{ file: 'lonely.ts', linesPct: 50 }]);
  }

  @Verifies<ComplianceCoreFeature>('findOrphanExemptsTypeOnlyFiles')
  'exempts type-only files (linesTotal=0 and statementsTotal=0)'() {
    const cov_ = new Map<string, FileCov>([
      ['types.ts', { lines: 0, branches: 0, functions: 0, statements: 0, linesTotal: 0, statementsTotal: 0 }],
      ['real.ts', { lines: 0, branches: 0, functions: 0, statements: 0, linesTotal: 5, statementsTotal: 8 }],
      ['legacy.ts', cov(0)],
    ]);
    const orphans = findOrphanSourceFiles([], cov_, new Map());
    expect(orphans.map(o => o.file).sort()).toEqual(['legacy.ts', 'real.ts']);
  }
}

void NormalizeCoveragePathTests;
void ComputeRuntimeCoverageTests;
void FindOrphanSourceFilesTests;
