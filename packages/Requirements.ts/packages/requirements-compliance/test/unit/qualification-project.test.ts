import { expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { QualificationFeature } from '../../../requirements-requirements/src/qualification-contracts.js';
import { parseQualificationEvidence, verifyQualificationArtifacts, verifyQualificationProjection, qualifyProject } from '../../src/qualification-project.js';
import { qualificationTestId, type QualificationEvidence, type QualificationInventory } from '../../src/qualification.js';

function emptyEvidence() {
  return { schemaVersion: 1, runId: 'fixture', platform: 'win32', projectRoot: '/fixture', state: 'complete', startedAt: '2026-11-03', completedAt: '2026-11-03', hashesBefore: {}, hashesAfter: {}, buildHashesBefore: {}, buildHashesAfter: {}, artifacts: {}, toolsBefore: {}, tools: {}, tests: [], coverage: {}, strategies: [], mutation: { staticMutants: true, incremental: false, files: {} }, checks: { typecheck: 'passed', distribution: 'passed', orchestration: 'passed' } };
}

@FeatureTest(QualificationFeature)
class QualificationProjectTests {
  @Verifies<QualificationFeature>('loadsRetainedEvidenceSafely')
  async recomputesClaimsFromRawReportsAndDetectsEditedSummaries() {
    const root = await mkdtemp(join(tmpdir(), 'rac-projections-'));
    const id = qualificationTestId('test/unit/value.test.ts', 'ValueTests', 'accepts');
    const inventory: QualificationInventory = { requirements: [], features: [], executableFiles: [], hashes: {}, diagnostics: [], tests: [{ id, file: 'test/unit/value.test.ts', className: 'ValueTests', name: 'accepts', feature: 'ValueFeature', ac: 'accepts', level: 'unit', targets: [], hasAssertion: true, strategy: 'example' }] };
    const tools = { node: '26', typescript: '6', vitest: '5', stryker: '10' };
    const counters = { lines: { total: 1, covered: 1 }, functions: { total: 1, covered: 1 }, statements: { total: 1, covered: 1 }, branches: { total: 0, covered: 0 } };
    const strategy = { testId: id, strategy: 'property' as const, runs: 1000, seed: 42, status: 'passed' };
    const secondStrategy = { ...strategy, seed: 43 };
    const documents: Record<string, unknown> = {
      'test-results/fixture/tests.json': { success: true, testResults: [{ name: '/fixture/test/unit/value.test.ts', assertionResults: [{ title: 'accepts', ancestorTitles: ['ValueTests'], status: 'passed' }, { title: 'accepts', ancestorTitles: ['ValueTests'], status: 'passed' }] }] },
      'test-results/fixture/coverage/coverage-summary.json': { '/fixture/src/value.ts': counters },
      'packages/pkg/test-results/fixture/coverage/coverage-summary.json': { '/fixture/packages/pkg/src/value.ts': counters, '/fixture/not-owned.ts': counters },
      'test-results/fixture/mutation/mutation-report.json': { files: { '/fixture/src/value.ts': { mutants: [{ status: 'Killed' }] } } },
      'test-results/fixture/mutation/pkg/mutation-report.json': { files: { 'src/value.ts': { mutants: [{ status: 'Timeout' }] } } },
      'test-results/fixture/strategies/value.json': strategy,
      'test-results/fixture/strategies/value-second.json': secondStrategy,
      'test-results/fixture/inputs-before.json': { runId: 'fixture', platform: 'win32', projectRoot: '/fixture', startedAt: '2026-11-03', hashes: {}, buildHashes: {}, tools },
      'test-results/fixture/summary.json': { TestRunId: 'fixture', Done: true, Runs: ['test-types', 'distribution', 'integration'].map(Name => ({ Name, State: 'Success' })) },
      'test-results/fixture/mutation-policy.json': { ignoreStatic: false, incremental: false },
      'test-results/fixture/tool-versions.json': tools,
    };
    const artifacts: Record<string, string> = {};
    const write = async (file: string, value: unknown) => {
      const text = JSON.stringify(value);
      await mkdir(dirname(join(root, file)), { recursive: true });
      await writeFile(join(root, file), text, 'utf8');
      artifacts[file] = createHash('sha256').update(text).digest('hex');
    };
    try {
      for (const [file, value] of Object.entries(documents)) await write(file, value);
      const run: QualificationEvidence = { ...emptyEvidence(), schemaVersion: 1, platform: 'win32', state: 'complete', toolsBefore: tools, tools, artifacts,
        tests: [{ id, status: 'passed' }, { id, status: 'passed' }], coverage: { 'src/value.ts': counters, 'packages/pkg/src/value.ts': counters }, strategies: [strategy, secondStrategy],
        mutation: { staticMutants: true, incremental: false, files: { 'src/value.ts': ['Killed'], 'packages/pkg/src/value.ts': ['Timeout'] } },
      };
      expect(await verifyQualificationProjection(root, run, inventory)).toEqual([]);
      expect(await verifyQualificationProjection(root, { ...run, buildHashesAfter: { 'dist/changed.js': 'a'.repeat(64) } }, inventory)).toContain('build snapshot');
      const archiveFile = 'packages/pkg/dist/value.js';
      await write(`test-results/fixture/build-before/${archiveFile}`, { executable: 'before' });
      await write(`test-results/fixture/build-after/${archiveFile}`, { executable: 'after' });
      const buildHashesBefore = { [archiveFile]: artifacts[`test-results/fixture/build-before/${archiveFile}`]! };
      const buildHashesAfter = { [archiveFile]: artifacts[`test-results/fixture/build-after/${archiveFile}`]! };
      await write('test-results/fixture/inputs-before.json', { runId: 'fixture', platform: 'win32', projectRoot: '/fixture', startedAt: '2026-11-03', hashes: {}, buildHashes: buildHashesBefore, tools });
      const archived = { ...run, buildHashesBefore, buildHashesAfter };
      expect(await verifyQualificationArtifacts(root, artifacts)).toEqual([]);
      expect(await verifyQualificationProjection(root, archived, inventory)).toEqual([]);
      expect(await verifyQualificationProjection(root, { ...archived, buildHashesBefore: {} }, inventory)).toContain('build snapshot');
      expect(await verifyQualificationProjection(root, { ...archived, buildHashesAfter: buildHashesBefore }, inventory)).toContain('build snapshot');
      delete artifacts[`test-results/fixture/build-before/${archiveFile}`];
      delete artifacts[`test-results/fixture/build-after/${archiveFile}`];
      await write('test-results/fixture/inputs-before.json', documents['test-results/fixture/inputs-before.json']);
      expect(await verifyQualificationProjection(root, { ...run, tests: [...run.tests].reverse(), strategies: [secondStrategy, strategy] }, inventory)).toEqual([]);
      await write('test-results/fixture/summary.json', { TestRunId: 'fixture', Done: true, Runs: ['test-types', 'distribution', 'qualification-tests'].map(Name => ({ Name, State: 'Success' })) });
      expect(await verifyQualificationProjection(root, run, inventory)).toEqual([]);
      const altered = { ...run, tests: [{ id: 'forged', status: 'passed' }], coverage: {}, strategies: [], mutation: { ...run.mutation, files: {} } };
      expect(await verifyQualificationProjection(root, altered, inventory)).toEqual(expect.arrayContaining(['tests', 'coverage', 'mutation', 'strategies']));
      const changedMetadata = { ...run, projectRoot: '/different-root', tools: {}, hashesBefore: { extra: 'changed' }, checks: { typecheck: 'missing', distribution: 'missing', orchestration: 'missing' }, mutation: { ...run.mutation, staticMutants: false, incremental: true }, state: 'interrupted' as const };
      expect(await verifyQualificationProjection(root, changedMetadata, inventory)).toEqual(expect.arrayContaining(['input snapshot', 'tool versions', 'independent checks', 'campaign lifecycle', 'mutation policy']));
      await writeFile(join(root, 'proof.json'), JSON.stringify(altered), 'utf8');
      expect((await qualifyProject({ root, evidencePaths: ['proof.json'] })).diagnostics.map(d => d.code)).toContain('altered-evidence-projection');
      const withoutTools = { ...run, artifacts: Object.fromEntries(Object.entries(artifacts).filter(([file]) => !file.endsWith('/tool-versions.json'))) };
      await expect(verifyQualificationProjection(root, withoutTools, inventory)).rejects.toThrow('Exactly one retained');
      await writeFile(join(root, 'partial.json'), JSON.stringify(withoutTools), 'utf8');
      const partial = await qualifyProject({ root, evidencePaths: ['partial.json'] });
      expect(partial.complete).toBe(false);
      expect(partial.evidence).toHaveLength(1);
      expect(partial.platforms.find(platform => platform.platform === 'win32')?.runId).toBe('fixture');
      expect(partial.diagnostics.map(diagnostic => diagnostic.code)).toContain('incomplete-evidence-projection');
      await write('test-results/fixture/summary.json', { TestRunId: 'fixture', Done: true, Runs: [null] });
      expect(await verifyQualificationProjection(root, run, inventory)).toContain('campaign lifecycle');
      await write('test-results/fixture/summary.json', { Runs: null });
      await expect(verifyQualificationProjection(root, run, inventory)).rejects.toThrow('Invalid campaign summary');
      await write('test-results/fixture/tests.json', { success: 'not boolean', testResults: [] });
      await expect(verifyQualificationProjection(root, run, inventory)).rejects.toThrow('Invalid test report');
      await write('test-results/fixture/tests.json', null);
      await expect(verifyQualificationProjection(root, run, inventory)).rejects.toThrow('Invalid raw report');
    } finally { await rm(root, { recursive: true, force: true }); }
  }

  @Verifies<QualificationFeature>('loadsRetainedEvidenceSafely')
  rejectsMalformedExternalSchemasBeforeEvaluation() {
    expect(parseQualificationEvidence(JSON.stringify(emptyEvidence())).runId).toBe('fixture');
    expect(() => parseQualificationEvidence('{invalid JSON')).toThrow();
    for (const value of [null, [], {}, { ...emptyEvidence(), platform: 'darwin' }, { ...emptyEvidence(), tests: [{}] }, { ...emptyEvidence(), strategies: [{}] }, { ...emptyEvidence(), mutation: { files: {} } }, { ...emptyEvidence(), coverage: { file: { lines: { total: 1 } } } }, { ...emptyEvidence(), checks: {} }, { ...emptyEvidence(), hashesBefore: { a: 1 } }]) expect(() => parseQualificationEvidence(JSON.stringify(value))).toThrow();
    const populated = { ...emptyEvidence(), tests: [{ id: 'a', status: 'passed' }], strategies: [{ testId: 'a', strategy: 'fuzz', runs: 10000, seed: 1, status: 'passed' }], coverage: { file: Object.fromEntries(['lines', 'branches', 'functions', 'statements'].map(metric => [metric, { total: 1, covered: 1 }])) }, mutation: { staticMutants: true, incremental: false, files: { file: ['Killed'] } } };
    expect(parseQualificationEvidence(JSON.stringify(populated)).coverage.file!.lines.total).toBe(1);
  }

  @Verifies<QualificationFeature>('loadsRetainedEvidenceSafely')
  async reportsMissingMalformedAndTamperedProofFiles() {
    const root = await mkdtemp(join(tmpdir(), 'rac-proof-'));
    try {
      await mkdir(join(root, 'src'));
      await writeFile(join(root, 'src/value.ts'), 'export const value = 1;', 'utf8');
      await writeFile(join(root, 'src/types.d.mts'), 'export declare const value: number;', 'utf8');
      await writeFile(join(root, 'src/types.d.cts'), 'export declare const value: number;', 'utf8');
      await writeFile(join(root, 'README.md'), 'Not executable product code.', 'utf8');
      await mkdir(join(root, 'node_modules'));
      await writeFile(join(root, 'node_modules/ignored.ts'), 'throw new Error("never execute")', 'utf8');
      await writeFile(join(root, 'broken.json'), 'not json', 'utf8');
      await writeFile(join(root, 'proof.json'), JSON.stringify({ ...emptyEvidence(), artifacts: { 'missing.js': 'a'.repeat(64) } }), 'utf8');
      const report = await qualifyProject({ root, evidencePaths: ['absent.json', 'broken.json', 'proof.json'] });
      expect(report.complete).toBe(false);
      expect(report.inventory.executableFiles).toBe(1);
      expect(report.traceability.hashes['src/types.d.mts']).toMatch(/^[a-f0-9]{64}$/);
      expect(report.traceability.hashes['src/types.d.cts']).toMatch(/^[a-f0-9]{64}$/);
      expect(report.diagnostics.map(d => d.code)).toEqual(expect.arrayContaining(['unreadable-evidence', 'changed-artifact', 'missing-platform', 'stale-evidence']));
      expect((await qualifyProject({ root })).diagnostics.filter(d => d.code === 'missing-platform')).toHaveLength(2);
    } finally { await rm(root, { recursive: true, force: true }); }
  }

  @Verifies<QualificationFeature>('loadsRetainedEvidenceSafely')
  async verifyArtifacts() {
    const root = await mkdtemp(join(tmpdir(), 'rac-artifacts-'));
    const outside = await mkdtemp(join(tmpdir(), 'rac-outside-artifacts-'));
    try {
      const text = 'const value = "é";';
      await writeFile(join(root, 'value.js'), text, 'utf8');
      const hash = createHash('sha256').update(text, 'utf8').digest('hex');
      expect(await verifyQualificationArtifacts(root, { 'value.js': hash })).toEqual([]);
      expect(await verifyQualificationArtifacts(root, { 'value.js': 'wrong', 'absent.js': hash, '../escape.js': hash, [join(root, 'value.js')]: hash })).toHaveLength(4);
      await writeFile(join(outside, 'value.js'), text, 'utf8');
      await symlink(outside, join(root, 'link'), 'junction');
      expect(await verifyQualificationArtifacts(root, { 'link/value.js': hash })).toEqual(['link/value.js']);
    } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
  }
}
void QualificationProjectTests;
