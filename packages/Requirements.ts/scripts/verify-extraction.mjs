import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'provenance/extraction.json'),'utf8').replace(/^\uFEFF/,''));
const changes=new Map(manifest.adaptations.filter(x=>x.path).map(x=>[x.path,x]));
const mismatches=[];
for(const file of [...manifest.copiedFiles,...(manifest.addedFiles??[])]){
  const p=path.join(root,file.path);
  const hash=fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;
  const expected=changes.get(file.path)?.targetSha256??file.sha256;
  if(hash!==expected)mismatches.push(file.path);
}
const packages=manifest.packageDirectories.map(dir=>JSON.parse(fs.readFileSync(path.join(root,'packages',dir,'package.json'),'utf8')));
const names=new Set(packages.map(p=>p.name));
const missing=[];
for(const p of packages)for(const section of ['dependencies','devDependencies','peerDependencies','optionalDependencies'])for(const [name,spec]of Object.entries(p[section]??{}))if(spec.startsWith('workspace:')&&!names.has(name))missing.push(p.name+' -> '+name);
console.log(JSON.stringify({files:manifest.copiedFiles.length,packages:packages.length,mismatches,missingWorkspaceDependencies:missing}));
if(mismatches.length||missing.length)process.exitCode=1;
