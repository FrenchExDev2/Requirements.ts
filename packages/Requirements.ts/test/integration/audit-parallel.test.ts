import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements';
import { QualificationInfrastructureFeature } from '../../packages/requirements-requirements/src/qualification-contracts.js';

@FeatureTest(QualificationInfrastructureFeature, { timeout: 180_000 })
class AuditSchedulerTests {
@Verifies<QualificationInfrastructureFeature>('observesParallelWorkerFailures')
async retainsConcurrentWorkerFailures() {
  const output=await mkdtemp(join(tmpdir(),'rac-scheduler-'));
  const script=fileURLToPath(new URL('../../scripts/Invoke-Audit.ps1',import.meta.url));
  try {
    await promisify(execFile)('pwsh',['-NoProfile','-File',script,'-Phase','RunnerSelfTest','-MaxParallel','2','-OutputDirectory',output],{encoding:'utf8',timeout:60_000});
    const deadline=Date.now()+120_000;
    let summary:any;
    while(Date.now()<deadline) {
      try{summary=JSON.parse(await readFile(join(output,'summary.json'),'utf8'));if(summary.Done)break;}catch{}
      await setTimeout(100);
    }
    expect(summary?.Done).toBe(true);
    const [first,second,failing]=summary.Runs;
    expect([first.State,second.State,failing.State]).toEqual(['Success','Success','Failed']);
    expect(new Set(summary.Runs.map((row:any)=>row.Identity)).size).toBe(3);
    const firstEnd=Date.parse(first.Started)+first.Duration*1000;
    const secondEnd=Date.parse(second.Started)+second.Duration*1000;
    expect(Math.max(Date.parse(first.Started),Date.parse(second.Started))).toBeLessThan(Math.min(firstEnd,secondEnd));
    const native=await Promise.all(['a','b'].map(async name=>JSON.parse(await readFile(join(output,`probe-${name}.json`),'utf8'))));
    expect(native[0].pid).not.toBe(native[1].pid);
    expect(Math.max(...native.map(probe=>probe.startedAt))).toBeLessThan(Math.min(...native.map(probe=>probe.endedAt)));
    expect(failing.ExitCode).toBe(2);
  } finally {await rm(output,{recursive:true,force:true});}
}
}
void AuditSchedulerTests;
