/** Audit the shared RaC specification against every package's actual test declarations. */
import { readdir, readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFeatures, readRequirements, crossReference } from '../packages/requirements-compliance/dist/index.js';
import { parseTestFile } from '../packages/requirements-scanner/dist/index.js';
import { evaluateTestEvidence } from './lib/test-evidence.mjs';
import { fingerprintSources } from './source-fingerprint.mjs';
import { assertCoveragePolicy } from './check-coverage-policy.mjs';
await assertCoveragePolicy();

const root = fileURLToPath(new URL('../', import.meta.url));
const packages = (await readdir(resolve(root,'packages'),{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name);
const features=[], requirements=[], refs=[], files=[];
async function exists(path) { try { return await stat(path); } catch(e) { if(e.code==='ENOENT') return null; throw e; } }
async function tests(dir) {
  if(!await exists(dir)) return;
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const full=resolve(dir,entry.name);
    if(entry.isDirectory()) await tests(full);
    else if(entry.name.endsWith('.test.ts')) files.push(full);
  }
}
for(const name of packages) {
  const dir=resolve(root,'packages',name);
  const featureDir=name==='requirements-requirements'?resolve(dir,'src'):resolve(dir,'requirements/features');
  if(await exists(featureDir)) features.push(...(await readFeatures(featureDir)).map(f=>({...f,file:relative(root,resolve(featureDir,f.file)).replaceAll('\\','/')})));
  const reqDir=name==='requirements-requirements'?resolve(dir,'src'):resolve(dir,'requirements/requirements');
  if(await exists(reqDir)) requirements.push(...await readRequirements(reqDir));
  await tests(resolve(dir,'test'));
}
for(const full of files) {
  const file=relative(root,full).replaceAll('\\','/');
  const level=file.match(/\/test\/(unit|functional|e2e|a11y|i18n|visual|perf|smoke)\//)?.[1]??'unit';
  const parsed=parseTestFile(await readFile(full,'utf8'),file,root,['packages/']);
  for(const cls of parsed.classes) for(const method of cls.methods) refs.push({feature:cls.featureClass,featureId:'',ac:method.ac,testFile:file,testName:method.methodName,className:cls.className,level});
}
const unique=(items,key)=>[...new Map(items.map(item=>[item[key],item])).values()];
// Canonical identities are mandatory: never synthesize a contract from divergent copies.
const merged=new Map();
for(const feature of features) {
  const prior=merged.get(feature.className);
  if(prior) throw new Error(`Duplicate feature declaration: ${feature.className}; use its canonical export.`);
  if([...merged.values()].some(f=>f.id===feature.id)) throw new Error(`Duplicate feature id: ${feature.id}`);
  merged.set(feature.className,feature);
}
const featureList=[...merged.values()];
const reqList=unique(requirements,'className');
const knownClasses=new Map(featureList.map(f=>[f.className,f]));
const invalidRefs=refs.filter(r=>!knownClasses.has(r.feature)||!knownClasses.get(r.feature).acMethods.includes(r.ac));
const result=crossReference(featureList,refs,null,null,new Map(reqList.map(r=>[r.className,r.id])));
const gaps=result.filter(f=>f.enabled).flatMap(f=>f.acs.filter(ac=>ac.gapLevels.length).map(ac=>({feature:f.id,ac:ac.method,missing:ac.gapLevels})));
const orphanFeatures=featureList.filter(f=>f.enabled&&(!f.satisfies.length||f.satisfies.some(r=>!reqList.some(req=>req.className===r)))).map(f=>f.id);
const unsatisfiedRequirements=reqList.filter(r=>['Approved','Implemented','Verified'].includes(r.status)&&!featureList.some(f=>f.enabled&&f.satisfies.includes(r.className))).map(r=>r.id);
const staticOnly=process.argv.includes('--static');
let runId=process.env.TEST_RUN_ID;
if(!runId&&!staticOnly) try {runId=JSON.parse(await readFile(resolve(root,'test-results/latest-validation.json'),'utf8')).runId;}catch{}
const reports=[],missingReports=[];
let sourceChanged=[];
if(!staticOnly&&runId) {
  for(const name of packages) {
    const dir=resolve(root,'packages',name);
    const manifest=JSON.parse(await readFile(resolve(dir,'package.json'),'utf8'));
    if(!manifest.scripts?.test) continue;
    for(const report of name==='requirements'?['tests.json','smoke-tests.json']:['tests.json']) {
      try{reports.push(JSON.parse(await readFile(resolve(dir,'test-results',runId,report),'utf8')));}
      catch{missingReports.push(`${name}/${report}`);}
    }
  }
  try {
    const snapshot=JSON.parse(await readFile(resolve(root,'test-results',runId,'source-snapshot.json'),'utf8'));
    const current=await fingerprintSources();
    sourceChanged=[...new Set([...Object.keys(current),...Object.keys(snapshot.files)])].filter(file=>current[file]!==snapshot.files[file]);
  }catch{sourceChanged=['source snapshot missing or unreadable'];}
}
const evidence=staticOnly?[]:evaluateTestEvidence(refs,reports);
const executionGaps=staticOnly?[]:evidence.filter(ref=>ref.execution!=='passed');
const reportFailures=reports.filter(report=>!report.success||report.numFailedTests||report.numFailedTestSuites).length;
const summary={packages:packages.length,features:featureList.length,requirements:reqList.length,acCount:result.reduce((n,f)=>n+f.totalCount,0),testFiles:files.length,bindings:refs.length,gaps,invalidRefs,orphanFeatures,unsatisfiedRequirements,mode:staticOnly?'static':'executed',runId:runId??null,missingReports,reportFailures,sourceChanged,executionGaps,passedBindings:evidence.filter(ref=>ref.execution==='passed').length,evidence:staticOnly?'Static declarations only.':'Bindings matched to individual passing tests of this run; SHA-256 source snapshot checked. Instrumented coverage has its own gates.'};
await mkdir(resolve(root,'test-results/workspace-compliance'),{recursive:true});
await writeFile(resolve(root,'test-results/workspace-compliance/report.json'),JSON.stringify(summary,null,2)+'\n','utf8');
console.log(JSON.stringify(summary,null,2));
if(!featureList.length||!reqList.length||gaps.length||invalidRefs.length||orphanFeatures.length||unsatisfiedRequirements.length||(!staticOnly&&(!runId||missingReports.length||reportFailures||sourceChanged.length||executionGaps.length))) process.exitCode=1;
