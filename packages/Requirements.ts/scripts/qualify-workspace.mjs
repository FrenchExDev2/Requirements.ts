/** Run the public qualification engine against this workspace; never infer missing evidence. */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { qualifyProject } from '../packages/requirements-compliance/dist/index.js';

/** Use the public engine for workspace qualification and persist every partial verdict. */
export async function qualifyWorkspace(args = process.argv.slice(2), { root = fileURLToPath(new URL('../', import.meta.url)) } = {}) {
root = resolve(root);
const evidencePaths = [];
for (const arg of args) {
  if (['--strict', '--json', '--evidence'].includes(arg)) continue;
  if (arg.startsWith('-')) throw new Error(`Unknown qualification option: ${arg}`);
  evidencePaths.push(arg);
}
const report = await qualifyProject({ root, evidencePaths });
const output = resolve(root, 'test-results/qualification');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = await qualifyWorkspace();
  console.log(JSON.stringify(report, null, 2));
  if (!report.complete) process.exitCode = 1;
}
