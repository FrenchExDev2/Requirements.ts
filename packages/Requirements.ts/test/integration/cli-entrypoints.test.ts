import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve, join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements';
import { QualificationInfrastructureFeature } from '../../packages/requirements-requirements/src/qualification-contracts.js';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const bins = [
  resolve(root, 'packages/requirements/bin/requirements-entry.mjs'),
  resolve(root, 'packages/requirements-styles-demo/bin/rsd-entry.mjs'),
  resolve(dirname(createRequire(import.meta.url).resolve('@frenchexdev2/ts-codegen-pipeline')), '../bin/sourcegen-entry.mjs'),
];

@FeatureTest(QualificationInfrastructureFeature, { timeout: 150_000 })
class RealCliEntrypointTests {
  @Verifies<QualificationInfrastructureFeature>('resolvesInstalledCliEntrypoints')
  async resolvesLoadersFromUnrelatedDirectories() {
    for (const bin of bins) {
    const cwd = await mkdtemp(join(tmpdir(), 'rac cli é & '));
    try {
      const result = await execute(process.execPath, [bin, '--help'], {
        cwd, encoding: 'utf8', timeout: 45_000,
      });
      expect(result.stdout).toMatch(/Usage:/i);
    } finally { await rm(cwd, { recursive: true, force: true }); }
    }
  }

  @Verifies<QualificationInfrastructureFeature>('preservesLiteralCliArguments')
  async preservesLiteralShellSyntax() {
    for (const bin of bins) {
    const cwd = await mkdtemp(join(tmpdir(), 'rac-argv-'));
    const sentinel = join(cwd, 'unexpected.txt');
    // A shell-concatenating launcher would execute the second command.
    const injection = '&& echo compromised > unexpected.txt';
    try {
      await execute(process.execPath, [bin, '--help', injection], {
        cwd, encoding: 'utf8', timeout: 45_000,
      });
      await expect(access(sentinel)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(cwd, { recursive: true, force: true }); }
    }
  }
}
void RealCliEntrypointTests;
