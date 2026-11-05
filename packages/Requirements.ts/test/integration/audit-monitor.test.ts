import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements';
import { QualificationInfrastructureFeature } from '../../packages/requirements-requirements/src/qualification-contracts.js';

const execute = promisify(execFile);

@FeatureTest(QualificationInfrastructureFeature)
class AuditMonitorTests {
@Verifies<QualificationInfrastructureFeature>('monitorsUtcDurations')
async preservesUtcDurations() {
  const dir = await mkdtemp(join(tmpdir(), 'rac-monitor-'));
  const state = join(dir, 'state.json');
  try {
    // The monitor may see an active process before its first output record.
    await writeFile(join(dir, 'utc.log'), '', 'utf8');
    await writeFile(state, JSON.stringify({ Project: 'RaC monitor regression', Task: 'UTC duration',
      Workspace: dir, Directory: dir, Done: true, Runs: [
        { Name: 'utc', State: 'Running', Started: new Date(Date.now() - 62_000).toISOString(), Duration: 0, Identity: 'fixture' },
        { Name: 'pending', State: 'Pending', Started: null, Duration: 0, Identity: 'fixture' },
      ] }), 'utf8');
    const script = fileURLToPath(new URL('../../scripts/Watch-Audit.ps1', import.meta.url));
    const { stdout, stderr } = await execute('pwsh', ['-NoProfile', '-File', script, '-StatePath', state], { encoding: 'utf8' });
    expect(stderr).toBe('');
    const platform=process.platform==='win32'?'Windows':'Linux';
    expect(stdout).toMatch(new RegExp(`\\|utc\\s*\\|${platform}\\s*\\|Running\\s*\\|\\s*1m\\d+s\\s*\\|`));
    expect(stdout).toMatch(new RegExp(`\\|pending\\s*\\|${platform}\\s*\\|Pending\\s*\\|\\s*-\\s*\\|`));
  } finally { await rm(dir, { recursive: true, force: true }); }
}
}
void AuditMonitorTests;
