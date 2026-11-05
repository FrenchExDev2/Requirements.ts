import { expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ComplianceReportFeature } from '@frenchexdev2/requirements-requirements';
import { generateReport, type GenerateReportOptions } from '../../src/compliance-report.js';

async function withCorpus(work: (options: GenerateReportOptions) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'rapport-é-'));
  try {
    for (const directory of ['features', 'requirements', 'test/unit/nested', 'src', 'output']) {
      await mkdir(join(root, directory), { recursive: true });
    }
    await writeFile(join(root, 'features/entry.ts'), `
@Satisfies(EntryRequirement)
export abstract class EntryFeature extends Feature {
 readonly id='ENTRY'; readonly title='Entrées'; readonly priority=Priority.Critical;
 abstract accepts(): ACResult;
}`, 'utf8');
    await writeFile(join(root, 'requirements/entry.ts'), `
export abstract class EntryRequirement extends Requirement { readonly id='REQ-ENTRY'; }
`, 'utf8');
    await writeFile(join(root, 'src/entry.ts'), 'export function accepts() { return true; }', 'utf8');
    await writeFile(join(root, 'test/unit/nested/entry.test.ts'), `
import { accepts } from '../../../src/entry.js';
@FeatureTest(EntryFeature) class EntryTests {
 @Verifies<EntryFeature>('accepts')
 acceptsEntries() { expect(accepts()).toBe(true); }
}`, 'utf8');
    await writeFile(join(root, 'test/unit/readme.md'), 'Aucun code exécutable.', 'utf8');
    await work({ root, featuresDir: join(root, 'features'), requirementsDir: join(root, 'requirements'),
      bindingsDir: join(root, 'output'), bindingsManifestPath: join(root, 'output/bindings.json'),
      testDirs: [join(root, 'missing-tests'), join(root, 'test')] });
  } finally { await rm(root, { recursive: true, force: true }); }
}

@FeatureTest(ComplianceReportFeature)
class ComplianceReportDiskContracts {
  @Verifies<ComplianceReportFeature>('reportAssemblesDiskContractsBindingsAndCoverage')
  async reportAssemblesDiskContractsBindingsAndCoverage() {
    await withCorpus(async options => {
      const coverageDirectory = join(options.root, 'test-results/disk-run/coverage');
      await mkdir(coverageDirectory, { recursive: true });
      const metric = { pct: 100, total: 1 };
      const coverage = { lines: metric, branches: metric, functions: metric, statements: metric };
      await writeFile(join(coverageDirectory, 'coverage-summary.json'), JSON.stringify({
        total: coverage, [join(options.root, 'src/entry.ts')]: coverage,
        [join(options.root, 'src/unclaimed.ts')]: coverage,
      }), 'utf8');
      const result = await generateReport({ ...options, coverageRunId: 'disk-run' });
      expect(result.reqClassToId.get('EntryRequirement')).toBe('REQ-ENTRY');
      expect(result.coverageRunId).toBe('disk-run');
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({ id: 'ENTRY', satisfies: ['REQ-ENTRY'],
        coveredCount: 1, totalCount: 1, percentage: 100,
        runtimeCoverage: { status: 'ok', found: 1, minLinesPct: 100 } });
      expect(result.bindingsManifest?.ENTRY?.accepts).toEqual([{ file: 'src/entry.ts', symbol: 'accepts' }]);
      expect(result.orphans.map(orphan => orphan.file)).toEqual(['src/unclaimed.ts']);
      expect(JSON.parse(await readFile(options.bindingsManifestPath, 'utf8'))).toEqual(result.bindingsManifest);
    });
  }

  @Verifies<ComplianceReportFeature>('reportDiffUsesPreviousArtifactWithoutImportingItsBindings')
  async reportDiffUsesPreviousArtifactWithoutImportingItsBindings() {
    await withCorpus(async options => {
      const inferredManifestPath = join(options.root, 'output/inferred.json');
      const inferredDiffPath = join(options.root, 'output/diff.json');
      const infer = { ...options, inferredManifestPath, inferredDiffPath };
      const first = await generateReport(infer);
      expect(first.inferredDiff?.featuresOnlyInInferred).toEqual(['ENTRY']);
      expect(first.inferredDiff?.symbolsOnlyInInferred).toEqual([
        { featureId: 'ENTRY', ac: 'accepts', target: { file: 'src/entry.ts', symbol: 'accepts' } },
      ]);
      const identical = await generateReport(infer);
      for (const changes of Object.values(identical.inferredDiff!)) expect(changes).toEqual([]);
      await writeFile(options.bindingsManifestPath, JSON.stringify({ STALE: { removed: [{ file: 'src/ghost.ts', symbol: 'ghost' }] } }), 'utf8');
      const changed = await generateReport(infer);
      expect(changed.inferredDiff?.featuresOnlyInManual).toEqual(['STALE']);
      expect(changed.inferredDiff?.featuresOnlyInInferred).toEqual(['ENTRY']);
      expect(changed.bindingsManifest).not.toHaveProperty('STALE');
      expect(JSON.parse(await readFile(inferredManifestPath, 'utf8'))).toEqual(changed.bindingsManifest);
      expect(JSON.parse(await readFile(inferredDiffPath, 'utf8'))).toEqual({ diff: changed.inferredDiff, emptyMethods: [] });
    });
  }

  @Verifies<ComplianceReportFeature>('reportOptionsAndInvalidArtifactsHaveExplicitOutcomes')
  async reportOptionsAndInvalidArtifactsHaveExplicitOutcomes() {
    await withCorpus(async options => {
      const without = await generateReport({ ...options, requirementsDir: undefined,
        includeBindings: false, writeBindingsManifest: false,
        inferredManifestPath: join(options.root, 'output/not-created.json'),
        inferredDiffPath: join(options.root, 'output/empty-diff.json') });
      expect(without.reqClassToId.size).toBe(0);
      expect(without.coverage).toBeNull(); expect(without.coverageRunId).toBeNull();
      expect(without.bindingsManifest).toBeNull(); expect(without.inferredDiff).toBeNull();
      expect(without.inferredEmptyMethods).toEqual([]); expect(without.orphans).toEqual([]);
      expect(JSON.parse(await readFile(join(options.root, 'output/empty-diff.json'), 'utf8'))).toEqual({ diff: null, emptyMethods: [] });
      await expect(readFile(options.bindingsManifestPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(join(options.root, 'output/not-created.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      const noWrite = await generateReport({ ...options, writeBindingsManifest: false });
      expect(noWrite.bindingsManifest?.ENTRY?.accepts).toHaveLength(1);
      await expect(readFile(options.bindingsManifestPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      await writeFile(options.bindingsManifestPath, '{malformed', 'utf8');
      await expect(generateReport({ ...options, inferredManifestPath: join(options.root, 'output/inferred.json') })).rejects.toBeInstanceOf(SyntaxError);
      expect(await readFile(options.bindingsManifestPath, 'utf8')).toBe('{malformed');
      await rm(options.bindingsManifestPath);
      await mkdir(options.bindingsManifestPath);
      await expect(generateReport({ ...options, inferredManifestPath: join(options.root, 'output/inferred.json') })).rejects.toBeInstanceOf(Error);
    });
  }
}
