import ts from 'typescript';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

/** Feature specification. Participation never implies that an AC was verified. */
export interface CodeFeature {
  id: string; key: string; title: string;
  declaration?: {file:string;line:number};
  requirement: { id: string; rationale: string; status: string; provenance: string; declaration?: {file:string;line:number} };
  acs: readonly { name: string; title: string; file?: string; line?: number }[];
  deprecated?: boolean; replacedBy?: string;
}
/** Source coordinates are one-based, inclusive, and recomputed from current ASTs. */
export interface CodeRange { file: string; start: number; end: number; startOffset: number; endOffset: number }
export interface CodeLink extends CodeRange { featureId: string; origin: 'decorator' | 'instruction' | 'block'; symbol?: string }
export interface CodeDiagnostic extends CodeRange { code: string; message: string }
export interface GeneratedOrigin extends CodeRange { source: string; sourceStart: number; sourceEnd: number; generator: string; sourceHash?: string; state?: 'current' | 'stale' | 'unknown' }
/** An individual executed assertion linked to one acceptance criterion. */
export interface AcEvidence { featureId: string; ac: string; test: string; file: string; status: 'passed' | 'failed' | 'skipped' }
export interface TraceEvidence {
  runId: string; sources: Record<string, string>; tests: readonly AcEvidence[];
  versions: Record<string,string>; configurations: Record<string,string>;
  coverage?: unknown; runtimeCoverage?: Record<string,number[]>; mutation?: unknown; complete: boolean; inputs?: Record<string,string>;
}
/** Safe JSON configuration. Paths are relative to this configuration's directory. */
export interface CodeTraceConfig {
  sources: string[]; specification: string; evidence?: string;
  businessModule: string; catalogueExport?: string; featureExports?: Record<string,string>;
}
export interface CodeTraceProject {
  features: readonly CodeFeature[]; links: readonly CodeLink[]; diagnostics: readonly CodeDiagnostic[];
  sources: Record<string,string>; evidence?: TraceEvidence; inputHashes?: Record<string,string>; generatedOrigins?: GeneratedOrigin[];
}

/** SHA-256 associates evidence with actual source bytes, not modification timestamps. */
export function sourceHash(text: string): string { return createHash('sha256').update(text, 'utf8').digest('hex'); }
/** Normalizes identity paths consistently on Windows and Linux. */
export function tracePath(file: string): string { return path.resolve(file).replaceAll('\\','/'); }

/** Analyzes decorators and comment tokens without evaluating application modules. */
export function scanParticipation(file: string, text: string, features: readonly CodeFeature[], businessModule: string, catalogueExport = 'BuilderFeatures') {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const links: CodeLink[] = [], diagnostics: CodeDiagnostic[] = [];
  const decorators = new Set<string>(), catalogues = new Set<string>(), namespaces = new Set<string>();
  const refs = new Map<string,string>();
  for (const node of sf.statements) if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    const module = node.moduleSpecifier.text;
    const trusted = module === businessModule || module === '@frenchexdev2/requirements-shared-kernel/participation';
    const bindings = node.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings) && trusted) namespaces.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) for (const imp of bindings.elements) {
      const name = (imp.propertyName ?? imp.name).text;
      if (trusted && name === 'ParticipatesIn') decorators.add(imp.name.text);
      if (module === businessModule && name === catalogueExport) catalogues.add(imp.name.text);
      if (module === businessModule) { const feature = features.find(f => f.key === name); if (feature) refs.set(imp.name.text, feature.id); }
    }
  }
  const coordinates = (start: number, end: number): CodeRange => ({file: tracePath(file), start:sf.getLineAndCharacterOfPosition(start).line+1, end:sf.getLineAndCharacterOfPosition(Math.max(start,end-1)).line+1, startOffset:start, endOffset:end});
  const report = (code:string,message:string,start:number,end:number) => diagnostics.push({...coordinates(start,end),code,message});
  const add = (id: string | undefined, start:number,end:number,origin:CodeLink['origin'],symbol?:string) => {
    const feature = features.find(f=>f.id===id);
    if (!feature) { report('RAC_UNKNOWN_FEATURE',`Unknown feature: ${id ?? 'unresolved reference'}`,start,end); return; }
    if (feature.deprecated) report('RAC_DEPRECATED_FEATURE',`${id} is deprecated${feature.replacedBy ? `; use ${feature.replacedBy}` : ''}`,start,end);
    links.push({...coordinates(start,end),featureId:feature.id,origin,...(symbol ? {symbol} : {})});
  };
  const resolveReference = (node:ts.Expression):string|undefined => {
    if (ts.isIdentifier(node)) return refs.get(node.text);
    if (ts.isPropertyAccessExpression(node)) {
      const owner=node.expression;
      if ((ts.isIdentifier(owner) && catalogues.has(owner.text)) || (ts.isPropertyAccessExpression(owner) && ts.isIdentifier(owner.expression) && namespaces.has(owner.expression.text) && owner.name.text===catalogueExport)) return features.find(f=>f.key===node.name.text)?.id;
    }
    return undefined;
  };
  const statements: ts.Node[] = [];
  function visit(node: ts.Node) {
    if (ts.isStatement(node) && !ts.isBlock(node)) statements.push(node);
    if (ts.canHaveDecorators(node)) for (const dec of ts.getDecorators(node) ?? []) {
      if (!ts.isCallExpression(dec.expression)) continue;
      const callee=dec.expression.expression;
      const known = (ts.isIdentifier(callee) && decorators.has(callee.text)) || (ts.isPropertyAccessExpression(callee) && callee.name.text==='ParticipatesIn' && ts.isIdentifier(callee.expression) && namespaces.has(callee.expression.text));
      if (!known) continue;
      if (!ts.isClassDeclaration(node) && !ts.isMethodDeclaration(node)) {report('RAC_INVALID_DECORATOR','Participation requires a class or method',dec.pos,dec.end);continue;}
      if (!dec.expression.arguments.length) report('RAC_EMPTY_PARTICIPATION','At least one feature is required',dec.pos,dec.end);
      for(const arg of dec.expression.arguments) add(resolveReference(arg),node.getStart(sf),node.end,'decorator',node.name?.getText(sf));
    }
    ts.forEachChild(node,visit);
  }
  visit(sf);
  // The scanner skips strings and template bodies; marker-looking example text is not executable annotation.
  const comments: {start:number;end:number;text:string}[]=[];
  function commentsAt(node:ts.Node) {
    for(const range of [...(ts.getLeadingCommentRanges(text,node.pos)??[]),...(ts.getTrailingCommentRanges(text,node.end)??[])]) {
      if(!comments.some(c=>c.start===range.pos)) comments.push({start:range.pos,end:range.end,text:text.slice(range.pos,range.end)});
    }
    ts.forEachChild(node,commentsAt);
  }
  commentsAt(sf);
  const stack:{id:string;start:number;end:number}[]=[];
  for(const comment of comments.sort((a,b)=>a.start-b.start)) {
    const marker=comment.text.match(/^\/\/\s*@rac-feature(?:(-begin|-end))?\s+([A-Z][A-Z0-9-]*)\s*$/);
    if(!marker){if(/^\/\/\s*@rac-feature/.test(comment.text))report('RAC_INVALID_MARKER','Malformed feature marker',comment.start,comment.end);continue;}
    const id=marker[2]!;
    if(marker[1]==='-begin'){stack.push({id,start:comment.start,end:comment.end});continue;}
    if(marker[1]==='-end') {
      const opening=stack.at(-1);
      if(!opening || opening.id!==id){report('RAC_UNBALANCED_BLOCK',`Unexpected end marker: ${id}`,comment.start,comment.end);continue;}
      stack.pop(); add(id,opening.end,comment.start,'block');continue;
    }
    const target=statements.filter(n=>n.getStart(sf)>=comment.end).sort((a,b)=>a.getStart(sf)-b.getStart(sf))[0];
    if(!target || text.slice(comment.end,target.getStart(sf)).trim())report('RAC_INVALID_MARKER','Marker must immediately precede a statement',comment.start,comment.end);
    else add(id,target.getStart(sf),target.end,'instruction');
  }
  for(const opening of stack)report('RAC_UNBALANCED_BLOCK',`Unclosed feature block: ${opening.id}`,opening.start,opening.end);
  return {links,diagnostics};
}

/** Loads only declared source roots; never traverses node_modules or executes workspace configuration. */
export async function loadCodeTrace(configFile:string, overrides:ReadonlyMap<string,string> = new Map(), signal?:AbortSignal):Promise<CodeTraceProject> {
  const base=path.dirname(configFile);
  const config=JSON.parse(await readFile(configFile,'utf8')) as CodeTraceConfig;
  if(!Array.isArray(config.sources)||!config.sources.every(s=>typeof s==='string')||typeof config.specification!=='string'||typeof config.businessModule!=='string')throw new TypeError('Invalid code trace configuration');
  const features=JSON.parse(await readFile(path.resolve(base,config.specification),'utf8')) as CodeFeature[];
  if(!Array.isArray(features)||new Set(features.map(f=>f.id)).size!==features.length)throw new TypeError('Invalid or duplicate feature catalogue');
  const specBase=path.dirname(path.resolve(base,config.specification));
  for(const feature of features){if(feature.declaration)feature.declaration.file=tracePath(path.resolve(specBase,feature.declaration.file));if(feature.requirement.declaration)feature.requirement.declaration.file=tracePath(path.resolve(specBase,feature.requirement.declaration.file));for(const ac of feature.acs)if(ac.file)ac.file=tracePath(path.resolve(specBase,'..',ac.file));}
  const project:CodeTraceProject={features,links:[],diagnostics:[],sources:{}};
  const links:CodeLink[]=[], diagnostics:CodeDiagnostic[]=[], generatedOrigins:GeneratedOrigin[]=[];
  async function walk(dir:string) {
    signal?.throwIfAborted();
    for(const entry of await readdir(dir,{withFileTypes:true})) {
      signal?.throwIfAborted();
      if(entry.isSymbolicLink()||['node_modules','.git','dist','test-results','.stryker-tmp'].includes(entry.name))continue;
      const file=path.join(dir,entry.name);
      if(entry.isDirectory())await walk(file);
      else if(/\.[cm]?tsx?$/.test(entry.name)&&!entry.name.endsWith('.d.ts')) {
        const key=tracePath(file), text=overrides.get(key)??await readFile(file,'utf8');
        project.sources[key]=sourceHash(text);
        const scanned=scanParticipation(file,text,features,config.businessModule,config.catalogueExport);
        links.push(...scanned.links);diagnostics.push(...scanned.diagnostics);
        const originLine=text.split(/\r?\n/).find(line=>line.startsWith('// @rac-generated '));
        if(originLine){try{const origin=JSON.parse(originLine.slice('// @rac-generated '.length)) as {source:string;start:number;end:number;generator:string;sourceHash?:string};if(typeof origin.source!=='string'||!Number.isInteger(origin.start)||!Number.isInteger(origin.end)||typeof origin.generator!=='string')throw new TypeError('Invalid origin');generatedOrigins.push({file:key,start:1,end:text.split(/\r?\n/).length,startOffset:0,endOffset:text.length,source:tracePath(path.resolve(path.dirname(file),origin.source)),sourceStart:origin.start,sourceEnd:origin.end,generator:origin.generator,sourceHash:origin.sourceHash});}catch{diagnostics.push({file:key,start:1,end:1,startOffset:0,endOffset:0,code:'RAC_INVALID_GENERATED_ORIGIN',message:'Invalid generated source correspondence'});}}
      }
    }
  }
  for(const source of config.sources)await walk(path.resolve(base,source));
  for(const origin of generatedOrigins){origin.state=!origin.sourceHash?'unknown':project.sources[origin.source]===origin.sourceHash?'current':'stale';if(origin.state==='stale')diagnostics.push({...origin,code:'RAC_STALE_GENERATED_ORIGIN',message:'Regenerate the companion: its source has changed.'});}
  project.links=links;project.diagnostics=diagnostics;project.generatedOrigins=generatedOrigins;
  if(config.evidence) {
    try{project.evidence=JSON.parse(await readFile(path.resolve(base,config.evidence),'utf8')) as TraceEvidence;}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  }
  if(project.evidence?.inputs){project.inputHashes={};for(const file of Object.keys(project.evidence.inputs)){signal?.throwIfAborted();try{project.inputHashes[file]=sourceHash(overrides.get(tracePath(file))??await readFile(file,'utf8'));}catch{project.inputHashes[file]='missing';}}}
  return project;
}

/** Explains declared participation and separately reports evidence validity. */
export function codeEvidenceState(project:CodeTraceProject):'missing'|'stale'|'incomplete'|'current' {
  const evidence=project.evidence;
  if(!evidence)return 'missing';
  const stale=Object.keys({...evidence.sources,...project.sources}).some(f=>evidence.sources[f]!==project.sources[f]) || Object.keys(evidence.inputs??{}).some(f=>evidence.inputs![f]!==project.inputHashes?.[f]);
  return stale?'stale':!evidence.complete?'incomplete':'current';
}
export function explainCode(project:CodeTraceProject,file:string,line:number) {
  if(!Number.isInteger(line)||line<1)throw new RangeError('Line must be a positive integer');
  const key=tracePath(file);
  const links=project.links.filter(l=>l.file===key&&l.start<=line&&l.end>=line);
  const evidence=project.evidence;
  const evidenceState=codeEvidenceState(project);
  return {file:key,line,message:links.length?'Declared feature participation':'aucune association connue',links,
    features:project.features.filter(f=>links.some(l=>l.featureId===f.id)).map(feature=>({...feature,tests:evidence?.tests.filter(t=>t.featureId===feature.id)??[]})),
    evidenceState,
    runtimeCoverage:!evidence?.runtimeCoverage?.[key]?'missing':evidenceState==='stale'?'stale':evidence.runtimeCoverage[key]!.includes(line)?'covered':'not-observed',
    generatedOrigins:project.generatedOrigins?.filter(o=>o.file===key&&o.start<=line&&o.end>=line)??[],
    diagnostics:project.diagnostics.filter(d=>d.file===key&&d.start<=line&&d.end>=line)};
}

/** Reverse navigation and change impact are represented relationships, not a complete dependency analysis. */
export function featureCode(project:CodeTraceProject,id:string) {return {feature:project.features.find(f=>f.id===id),code:project.links.filter(l=>l.featureId===id),tests:project.evidence?.tests.filter(t=>t.featureId===id)??[]};}
export function codeImpact(project:CodeTraceProject,files:readonly string[]) {const paths=new Set(files.map(tracePath));return [...new Set(project.links.filter(l=>paths.has(l.file)).map(l=>l.featureId))].map(id=>featureCode(project,id));}
export function codeGaps(project:CodeTraceProject) {const valid=codeEvidenceState(project)==='current';return project.features.map(f=>({featureId:f.id,missingImplementation:!project.links.some(l=>l.featureId===f.id),unprovedAcs:f.acs.filter(ac=>!valid||!project.evidence?.tests.some(t=>t.featureId===f.id&&t.ac===ac.name&&t.status==='passed')).map(ac=>ac.name)}));}
