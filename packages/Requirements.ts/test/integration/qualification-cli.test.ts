import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements';
import { QualificationFeature } from '../../packages/requirements-requirements/src/qualification-contracts.js';

@FeatureTest(QualificationFeature)
class QualificationCliTests {
  @Verifies<QualificationFeature>('exposesStrictQualificationCli')
  async rejectsMissingEvidenceAndKeepsThePartialJsonReport() {
    const root = await mkdtemp(join(tmpdir(), 'rac qualify é '));
    try {
      const bin = fileURLToPath(new URL('../../packages/requirements/bin/requirements-entry.mjs', import.meta.url));
      const result = await promisify(execFile)(process.execPath, [bin, 'qualify', '--strict', '--json'], { cwd: root, encoding: 'utf8' }).then(
        () => { throw new Error('Qualification of an empty project must fail.'); },
        (error: { code: number; stdout: string }) => error,
      );
      expect(result.code).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.mode).toBe('qualification');
      expect(report.complete).toBe(false);
      expect(report.diagnostics.map((d: { code: string }) => d.code)).toContain('missing-platform');
    } finally { await rm(root, { recursive: true, force: true }); }
  }
}
void QualificationCliTests;
