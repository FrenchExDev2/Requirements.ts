/** Check every local package with the native compiler, retaining the classic API for analyzers. */
import { readdir, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiler = join(root, 'node_modules/@typescript/native/bin/tsc');
const output = join(root, 'test-results', process.env.TEST_RUN_ID || 'typescript7');
await mkdir(output, { recursive: true });
let failed = 0;
const entries=(await readdir(join(root,'packages'),{withFileTypes:true})).filter(entry=>entry.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name));
let next=0;
async function worker() {
 while(next<entries.length) {
  const entry=entries[next++];
  const child = spawn(process.execPath, [compiler, '--project', join(root, 'packages', entry.name, 'tsconfig.json'),
    '--types', 'node', '--noEmit', '--tsBuildInfoFile', join(output, `${entry.name}.tsbuildinfo`)], { cwd: root, stdio: 'inherit' });
  try {
    const [code] = await once(child, 'exit');
    console.log(`${entry.name}: ${code === 0 ? 'PASS' : 'FAIL'} (node:${child.pid})`);
    if (code !== 0) failed++;
  } catch (error) { console.error(error); failed++; }
}
}
await Promise.all(Array.from({length:Math.min(4,entries.length)},worker));
process.exitCode = failed ? 1 : 0;
