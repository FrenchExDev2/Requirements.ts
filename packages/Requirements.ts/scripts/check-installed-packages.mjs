/** Consumer-side qualification: only installed production artifacts and plain Node. */
import { readFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';

const require = createRequire(resolve(process.cwd(), 'package.json'));
const manifests = JSON.parse(await readFile(process.argv[2], 'utf8'));
let exportsChecked = 0, cliChecks = 0;
for (const manifest of manifests) {
  for (const [key, value] of Object.entries(manifest.exports ?? { '.': manifest.main })) {
    if (key.includes('*')) throw new Error(`Unqualified export pattern: ${manifest.name}${key}`);
    const target = typeof value === 'string' ? value : value.import ?? value.default;
    if (!target) continue;
    const installed=require.resolve(manifest.name + (key === '.' ? '' : key.slice(1)));
    if(target.endsWith('.json')) JSON.parse(await readFile(installed,'utf8'));
    else await import(pathToFileURL(installed).href);
    exportsChecked++;
  }
  const entry = Object.keys(manifest.exports ?? { '.': manifest.main }).find(k => k === '.');
  if (!entry) throw new Error(`No root export: ${manifest.name}`);
  const root = dirname(require.resolve(manifest.name)).replace(/[/\\]dist$/, '');
  await access(resolve(root, 'LICENSE'));
  for (const [name, bin] of Object.entries(manifest.bin ?? {})) {
    const args = name === 'rsd' ? [['--help'], ['list', '--json']] : [['--help']];
    for (const arguments_ of args) {
      const child = spawn(process.execPath, [resolve(root, bin), ...arguments_], { cwd: process.cwd(), stdio: ['ignore','pipe','pipe'] });
      let output = '', errors = '';
      child.stdout.setEncoding('utf8').on('data', chunk => output += chunk);
      child.stderr.setEncoding('utf8').on('data', chunk => errors += chunk);
      const timer = setTimeout(() => child.kill(), 45_000);
      try {
        const [code] = await once(child, 'exit');
        if (code !== 0 || !output.trim()) throw new Error(`${name} ${arguments_.join(' ')} failed (${code}): ${errors}`);
      } finally { clearTimeout(timer); }
      cliChecks++;
    }
  }
}
let schemaValidation = 'not-applicable';
if (manifests.some(manifest => manifest.name === '@frenchexdev2/requirements-spec-io')) {
const { validateSpec, defaultSchemasDir } = await import(pathToFileURL(require.resolve('@frenchexdev2/requirements-spec-io/schema-generate')).href);
await access(resolve(defaultSchemasDir(), 'feature-spec.schema.json'));
const invalid = await validateSpec({ kind: 'feature' });
if (invalid.ok || !invalid.errors.length) throw new Error('Packaged schema validator accepted an invalid feature');
schemaValidation = 'passed';
}
console.log(JSON.stringify({ packages: manifests.length, exportsChecked, cliChecks, schemaValidation, runtime: process.version, sourceLoader: false }));
