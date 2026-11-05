/** Fingerprint executable sources, tests, declarations and dependency/build configuration. */
import { readdir, readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { assertCoveragePolicy } from './check-coverage-policy.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function fingerprintSources() {
  const files=[];
  async function walk(dir,recursive) {
    try {
      for(const entry of await readdir(dir,{withFileTypes:true})) {
        if(['node_modules','dist','test-results','.git','.stryker-tmp','reports','coverage'].includes(entry.name)) continue;
        const full=resolve(dir,entry.name);
        if(entry.isDirectory()&&recursive) await walk(full,true);
        else if(entry.isFile()&&/\.(?:ts|mjs|cjs|js|json|ya?ml)$/.test(entry.name)) files.push(full);
      }
    } catch(e) {if(e.code!=='ENOENT') throw e;}
  }
  await walk(root,false);
  for(const name of ['scripts','test']) await walk(resolve(root,name),true);
  for(const entry of await readdir(resolve(root,'packages'),{withFileTypes:true})) if(entry.isDirectory()) {
    const dir=resolve(root,'packages',entry.name);
    await walk(dir,false);
    for(const name of ['src','test','requirements','bin','schemas']) await walk(resolve(dir,name),true);
  }
  const entries=await Promise.all(files.sort().map(async file=>[relative(root,file).replaceAll('\\','/'),createHash('sha256').update(await readFile(file)).digest('hex')]));
  return Object.fromEntries(entries);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  await assertCoveragePolicy();
  const runId=process.env.TEST_RUN_ID;
  if(!runId||!/^[\w-]+$/.test(runId)) throw new Error('TEST_RUN_ID required');
  const dir=resolve(root,'test-results',runId);
  await mkdir(dir,{recursive:true});
  const files=await fingerprintSources();
  await writeFile(resolve(dir,'source-snapshot.json'),JSON.stringify({runId,createdAt:new Date().toISOString(),files},null,2)+'\n','utf8');
  console.log(JSON.stringify({runId,sourceFiles:Object.keys(files).length}));
}
