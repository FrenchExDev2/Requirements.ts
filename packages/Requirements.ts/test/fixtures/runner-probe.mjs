/** Synthetic scheduler probe, never used by product checks. */
import { setTimeout } from 'node:timers/promises';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
const [name,milliseconds,code,barrier]=process.argv.slice(2);
console.log(JSON.stringify({probe:name,pid:process.pid,state:'started'}));
const startedAt=Date.now();
if(barrier && ['a','b'].includes(name)) {
  await writeFile(join(barrier,`probe-${name}.ready`),JSON.stringify({pid:process.pid,startedAt}),'utf8');
  const deadline=Date.now()+60_000;
  let peerReady=false;
  while(Date.now()<deadline) {
    try { JSON.parse(await readFile(join(barrier,`probe-${name==='a'?'b':'a'}.ready`),'utf8')); peerReady=true; break; } catch {}
    await setTimeout(25);
  }
  if(!peerReady) throw new Error('The independent scheduler worker never reached the concurrency barrier.');
}
await setTimeout(Number(milliseconds));
if(barrier && ['a','b'].includes(name)) await writeFile(join(barrier,`probe-${name}.json`),JSON.stringify({pid:process.pid,startedAt,endedAt:Date.now()}),'utf8');
console.log(JSON.stringify({probe:name,pid:process.pid,state:'finished'}));
process.exitCode=Number(code);
