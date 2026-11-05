import { afterEach, beforeEach, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runStrykerForPlan, summariseReport } from '../../src/cli/behavioral-check-runner.js';
import type { StrykerConfigSnapshot } from '@frenchexdev2/requirements-lib/analysis';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn }));

import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { MutationRunnerFeature } from '../../../requirements-requirements/src/mutation-runner.js';
  let root: string;
  const quiet = { info: vi.fn(), error: vi.fn() };
  const config = {} as StrykerConfigSnapshot;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'rac-mutation-é-')); spawn.mockReset(); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });
  async function install(bin: unknown = { stryker: 'bin/stryker.js' }) {
    const dir = join(root, 'node_modules/@stryker-mutator/core');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: '@stryker-mutator/core', bin }), 'utf8');
  }
  function child(code: number | null = 0, report = true, error = false) {
    spawn.mockImplementation(() => {
      const events = new EventEmitter();
      setTimeout(async () => {
        if (report) {
          await mkdir(join(root, 'reports/mutation'), { recursive: true });
          await writeFile(join(root, 'reports/mutation/mutation.json'), JSON.stringify({ files: { a: { mutants: [{ status: 'Killed' }] } } }), 'utf8');
        }
        if (error) events.emit('error', new Error('spawn failed'));
        else events.emit('exit', code);
      }, 0);
      return events;
    });
  }
@FeatureTest(MutationRunnerFeature)
class MutationRunnerTests {
  @Verifies<MutationRunnerFeature>('scoreMatchesStryker')
  scoreMatchesStryker() {
    const statuses = ['Killed', 'Timeout', 'Survived', 'NoCoverage', 'RuntimeError', 'CompileError', 'Ignored', 'Pending'];
    expect(summariseReport({ files: { a: { mutants: statuses.map(status => ({ status })) }, empty: {} } }, 'report')).toMatchObject({
      killed: 1, timeout: 1, survived: 1, noCoverage: 1, runtimeErrors: 1, compileErrors: 1, total: 6, mutationScorePercent: 50,
    });
    expect(summariseReport({}, '').mutationScorePercent).toBe(0);
  }
  @Verifies<MutationRunnerFeature>('resolvesDocumentedBinShapes')
  async resolvesDocumentedBinShapes() {
    await install(); child();
    const result = await runStrykerForPlan({ packageRoot: root, repoRoot: root, config, logger: quiet });
    expect(result.mutationScorePercent).toBe(100);
    expect(spawn.mock.calls[0]?.[0]).toBe(process.execPath);
    expect(spawn.mock.calls[0]?.[1]).toContain(join(root, 'node_modules/@stryker-mutator/core/bin/stryker.js'));
    await expect(access(join(root, '.stryker-tmp-behavioral.conf.json'))).rejects.toThrow();
  }
  @Verifies<MutationRunnerFeature>('resolvesDocumentedBinShapes')
  async resolvesStringBin() {
    await install('bin/stryker.js'); child();
    const result = await runStrykerForPlan({ packageRoot: root, repoRoot: root, config, logger: quiet });
    expect(result.mutationScorePercent).toBe(100);
    expect(spawn.mock.calls[0]?.[1]).toContain(join(root, 'node_modules/@stryker-mutator/core/bin/stryker.js'));
  }
  @Verifies<MutationRunnerFeature>('supportsExplicitPaths')
  async supportsExplicitPaths() {
    await install(); child(0, false);
    spawn.mockImplementation(() => { const events = new EventEmitter(); setTimeout(async () => { await writeFile(join(root, 'custom.json'), '{}', 'utf8'); events.emit('exit', 0); }, 0); return events; });
    const result = await runStrykerForPlan({ packageRoot: root, repoRoot: root, config, configFileName: 'custom-config.json', reportFileName: 'custom.json' });
    expect(result.total).toBe(0);
    await expect(access(join(root, 'custom-config.json'))).rejects.toThrow();
  }
  @Verifies<MutationRunnerFeature>('rejectsFailedChildren')
  async rejectsFailedChildren() {
    for (const code of [2, null]) {
    await install(); child(code, false);
    await expect(runStrykerForPlan({ packageRoot: root, repoRoot: root, config, logger: quiet })).rejects.toThrow(`stryker exited with code ${code ?? 'null'}`);
    await expect(access(join(root, '.stryker-tmp-behavioral.conf.json'))).rejects.toThrow();
  }
    }
  @Verifies<MutationRunnerFeature>('rejectsSpawnFailure')
  async rejectsSpawnFailure() {
    await install(); child(0, false, true);
    await expect(runStrykerForPlan({ packageRoot: root, repoRoot: root, config, logger: quiet })).rejects.toThrow('spawn failed');
  }
  @Verifies<MutationRunnerFeature>('cleansConfigOnMissingExecutable')
  async cleansConfigOnMissingExecutable() {
    await install({});
    await expect(runStrykerForPlan({ packageRoot: root, repoRoot: root, config, logger: quiet })).rejects.toThrow('no "bin.stryker"');
    await expect(access(join(root, '.stryker-tmp-behavioral.conf.json'))).rejects.toThrow();
  }
  @Verifies<MutationRunnerFeature>('rejectsStaleReports')
  async rejectsStaleReports() {
    await install(); child(0, false);
    const report = join(root, 'reports/mutation/mutation.json');
    await mkdir(join(root, 'reports/mutation'), { recursive: true });
    await writeFile(report, '{"files":{}}', 'utf8');
    await expect(runStrykerForPlan({ packageRoot: root, repoRoot: root, config, logger: quiet })).rejects.toThrow('ENOENT');
    await expect(readFile(report, 'utf8')).rejects.toThrow();
  }
}
void MutationRunnerTests;
