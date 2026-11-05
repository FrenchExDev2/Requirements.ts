import { expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements';
import { CliDispatchContractsFeature } from '../../packages/requirements-requirements/src/cli-contracts.js';
import { collectQualificationEvidence } from '../../scripts/collect-qualification-evidence.mjs';
import { qualifyWorkspace } from '../../scripts/qualify-workspace.mjs';
import { parseQualificationEvidence, verifyQualificationArtifacts, verifyQualificationProjection, qualifyProject } from '../../packages/requirements-compliance/src/qualification-project.js';
import { readQualificationInventory } from '../../packages/requirements-compliance/src/qualification-inventory.js';

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const runId = 'collector-fixture';

async function withWorkspace(work: (root: string, put: (file: string, value: unknown) => Promise<void>) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'rac-preuves-é-'));
  const put = async (file: string, value: unknown) => {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), typeof value === 'string' || value instanceof Uint8Array ? value : JSON.stringify(value), 'utf8');
  };
  try {
    await put('packages/demo/src/value.ts', 'export function value() { return 1; }');
    await put('packages/demo/dist/nested/value.js', new Uint8Array([0, 10, 127, 128, 255]));
    await mkdir(join(root, 'packages/not-built'), { recursive: true });
    await put('stryker.qualification.conf.cjs', 'module.exports = {ignoreStatic: false, incremental: false};');
    await work(root, put);
  } finally { await rm(root, { recursive: true, force: true }); }
}

async function retained(root: string) {
  return parseQualificationEvidence(await readFile(join(root, `test-results/${runId}/evidence-${process.platform}.json`), 'utf8'));
}

@FeatureTest(CliDispatchContractsFeature)
class QualificationCollectorContracts {
  @Verifies<CliDispatchContractsFeature>('workspaceQualificationPersistsThePublicEngineVerdict')
  async workspaceQualificationPersistsThePublicEngineVerdict() {
    await withWorkspace(async (root, put) => {
      const report = await qualifyWorkspace(['--strict', '--json'], { root });
      expect(report.mode).toBe('qualification'); expect(report.complete).toBe(false);
      expect(report.diagnostics.filter(diagnostic => diagnostic.code === 'missing-platform')).toHaveLength(2);
      expect(JSON.parse(await readFile(join(root, 'test-results/qualification/report.json'), 'utf8'))).toEqual(report);
      await put('broken.json', 'not json');
      const invalid = await qualifyWorkspace(['--evidence', 'broken.json'], { root });
      expect(invalid.diagnostics.map(diagnostic => diagnostic.code)).toContain('unreadable-evidence');
      expect(invalid.complete).toBe(false);
      await expect(qualifyWorkspace(['--unsupported'], { root })).rejects.toThrow('Unknown qualification option: --unsupported');
      expect(JSON.parse(await readFile(join(root, 'test-results/qualification/report.json'), 'utf8'))).toEqual(invalid);
    });
  }

  @Verifies<CliDispatchContractsFeature>('evidenceCollectorRetainsExactInputsBuildsAndPartialResults')
  async evidenceCollectorRetainsExactInputsBuildsAndPartialResults() {
    await withWorkspace(async (root, put) => {
      const beforeBytes = new Uint8Array([0, 10, 127, 128, 255]);
      const begin = await collectQualificationEvidence('begin', runId, { root });
      expect(begin).toMatchObject({ runId, platform: process.platform });
      expect('inputs' in begin && begin.inputs).toBeGreaterThan(0);
      await put('packages/demo/src/value.ts', 'export function value() { return 2; }');
      await put('packages/demo/dist/nested/value.js', 'export const value = "é";');
      const completed = await collectQualificationEvidence('finish', runId, { root });
      expect(completed).toMatchObject({ state: 'interrupted', tests: 0, coverageFiles: 0, mutantFiles: 0, strategyRuns: 0 });
      const evidence = await retained(root);
      const build = 'packages/demo/dist/nested/value.js';
      expect(evidence.buildHashesBefore[build]).toBe(hash(beforeBytes));
      expect(evidence.buildHashesAfter[build]).toBe(hash('export const value = "é";'));
      expect(new Uint8Array(await readFile(join(root, `test-results/${runId}/build-before/${build}`)))).toEqual(beforeBytes);
      expect(evidence.hashesBefore['packages/demo/src/value.ts']).not.toBe(evidence.hashesAfter['packages/demo/src/value.ts']);
      expect(Object.keys(evidence.tools).sort()).toEqual(['node', 'stryker', 'typescript', 'vitest']);
      expect(evidence.toolsBefore).toEqual(evidence.tools);
      expect(evidence.checks).toEqual({ typecheck: 'missing', distribution: 'missing', orchestration: 'missing' });
      expect(await verifyQualificationArtifacts(root, evidence.artifacts)).toEqual([]);
      const report = await qualifyProject({ root, evidencePaths: [`test-results/${runId}/evidence-${process.platform}.json`] });
      expect(report.complete).toBe(false);
      expect(report.diagnostics.map(diagnostic => diagnostic.code)).toEqual(expect.arrayContaining(['changed-build', 'stale-evidence', 'incomplete-campaign']));
    });
  }

  @Verifies<CliDispatchContractsFeature>('evidenceCollectorReconstructsActualRunnerOutputs')
  async evidenceCollectorReconstructsActualRunnerOutputs() {
    await withWorkspace(async (root, put) => {
      await put('packages/demo/test/unit/value.test.ts', `import {value} from '../../src/value.js'; @FeatureTest(ValueFeature) class ValueTests { @Verifies<ValueFeature>('accepts') accepts(){expect(value()).toBe(1)} }`);
      await collectQualificationEvidence('begin', runId, { root });
      const output = `test-results/${runId}`;
      const packageOutput = `packages/demo/${output}`;
      const test = { success: true, testResults: [{ name: join(root, 'packages/demo/test/unit/value.test.ts'), assertionResults: [{ title: 'accepts', ancestorTitles: ['ValueTests'], status: 'passed' }] }] };
      const counters = Object.fromEntries(['lines', 'branches', 'functions', 'statements'].map(metric => [metric, { total: 1, covered: 1 }]));
      const target = join(root, 'packages/demo/src/value.ts');
      for (const name of ['tests.json', 'smoke-tests.json']) await put(`${packageOutput}/${name}`, test);
      await put(`${packageOutput}/coverage/coverage-summary.json`, { [target]: counters, [join(root, 'unowned.ts')]: counters });
      await put(`${output}/mutation/demo/mutation-report.json`, { files: { 'src/value.ts': { mutants: [{ status: 'Timeout' }] } } });
      await put(`${output}/integration-tests.json`, { success: true, testResults: [] });
      await put(`${output}/qualification-tests.json`, test);
      await put(`${output}/coverage/coverage-summary.json`, { [target]: counters });
      await put(`${output}/mutation/mutation-report.json`, { files: { [target]: { mutants: [{ status: 'Killed' }] } } });
      await put(`${output}/strategies/property.json`, { testId: 'unknown', strategy: 'property', runs: 1000, seed: 42, status: 'passed' });
      await put(`${output}/strategies/readme.md`, 'Graines conservées dans les JSON.');
      await put(`${output}/summary.json`, { TestRunId: runId, Done: true, Runs: ['test-types', 'distribution', 'qualification-tests'].map(Name => ({ Name, State: 'Success' })) });
      await put(`${output}/Invoke-Audit.snapshot.ps1`, '# Immutable runner');
      await put(`${output}/Watch-Audit.ps1`, '# Read-only monitor');
      const completed = await collectQualificationEvidence('finish', runId, { root });
      expect(completed).toMatchObject({ state: 'complete', tests: 3, coverageFiles: 1, mutantFiles: 1, strategyRuns: 1 });
      const evidence = await retained(root);
      expect(evidence.coverage['packages/demo/src/value.ts']).toEqual(counters);
      expect(evidence.coverage).not.toHaveProperty('unowned.ts');
      expect(evidence.mutation).toEqual({ staticMutants: true, incremental: false, files: { 'packages/demo/src/value.ts': ['Killed'] } });
      expect(evidence.checks).toEqual({ typecheck: 'passed', distribution: 'passed', orchestration: 'passed' });
      expect(evidence.artifacts).toHaveProperty(`${output}/Invoke-Audit.snapshot.ps1`);
      expect(evidence.artifacts).toHaveProperty(`${output}/Watch-Audit.ps1`);
      expect(await verifyQualificationArtifacts(root, evidence.artifacts)).toEqual([]);
      expect(await verifyQualificationProjection(root, evidence, await readQualificationInventory(root))).toEqual([]);
      const report = await qualifyProject({ root, evidencePaths: [`${output}/evidence-${process.platform}.json`] });
      expect(report.complete).toBe(false);
      expect(report.diagnostics.map(diagnostic => diagnostic.code)).toContain('unbound-strategy');
      expect(report.diagnostics.map(diagnostic => diagnostic.code)).not.toContain('altered-evidence-projection');
    });
  }

  @Verifies<CliDispatchContractsFeature>('evidenceCollectorRejectsInvalidOrReusedCampaigns')
  async evidenceCollectorRejectsInvalidOrReusedCampaigns() {
    await withWorkspace(async (root, put) => {
      for (const [operation, id] of [['unknown', runId], ['begin', ''], ['begin', '../escape']]) {
        await expect(collectQualificationEvidence(operation!, id!, { root })).rejects.toThrow('Usage:');
      }
      await expect(collectQualificationEvidence('finish', runId, { root })).rejects.toMatchObject({ code: 'ENOENT' });
      await collectQualificationEvidence('begin', runId, { root });
      await expect(collectQualificationEvidence('begin', runId, { root })).rejects.toMatchObject({ code: 'EEXIST' });
      const marker = `test-results/${runId}/inputs-before.json`;
      const before = JSON.parse(await readFile(join(root, marker), 'utf8'));
      await put(marker, { ...before, runId: 'different' });
      await expect(collectQualificationEvidence('finish', runId, { root })).rejects.toThrow('Snapshot campaign/platform mismatch');
      await put(marker, { ...before, platform: 'darwin' });
      await expect(collectQualificationEvidence('finish', runId, { root })).rejects.toThrow('Snapshot campaign/platform mismatch');
      await put(marker, before);
      await put(`test-results/${runId}/qualification-tests.json`, { success: false, testResults: [] });
      await put(`test-results/${runId}/summary.json`, { TestRunId: runId, Done: true, Runs: ['integration', 'test-types', 'distribution'].map(Name => ({ Name, State: 'Success' })) });
      await collectQualificationEvidence('finish', runId, { root });
      expect((await retained(root)).checks.orchestration).toBe('passed');
      await expect(collectQualificationEvidence('finish', runId, { root })).rejects.toMatchObject({ code: 'EEXIST' });
    });
  }
}
