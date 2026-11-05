import ts from 'typescript';
/**
 * Returns an undoable edit plan; the UI previews it before application.
 * @param {string} text Current source text.
 * @param {number} selectionStart Selection start offset.
 * @param {number} selectionEnd Selection end offset.
 * @param {readonly import('./code-trace.js').CodeFeature[]} features Selected feature identities.
 * @param {string} moduleName Business kernel npm name.
 * @param {string} catalogueExport Export owning the feature references.
 */
export function planMark(text, selectionStart, selectionEnd, features, moduleName, catalogueExport='BuilderFeatures') {
 const sf=ts.createSourceFile('source.ts',text,ts.ScriptTarget.Latest,true);
 const statements=[], declarations=[];
 function visit(node){if(ts.isStatement(node)&&!ts.isBlock(node))statements.push(node);if(ts.isClassDeclaration(node)||ts.isMethodDeclaration(node))declarations.push(node);ts.forEachChild(node,visit);}visit(sf);
 const containing=declarations.filter(n=>n.getStart(sf)<=selectionStart&&n.end>=selectionEnd).sort((a,b)=>(a.end-a.pos)-(b.end-b.pos))[0];
 // A cursor or a whole declaration can use a decorator; a selection inside a body marks statements.
 const bodyStart=containing?.body?.getStart(sf)??containing?.members?.pos??containing?.end;
 const useDecorator=containing&&(selectionStart<=containing.getStart(sf)||selectionStart<bodyStart);
 if(useDecorator){
  let catalogue,marker;
  for(const node of sf.statements){if(!ts.isImportDeclaration(node)||node.moduleSpecifier.text!==moduleName)continue;const bindings=node.importClause?.namedBindings;if(bindings&&ts.isNamespaceImport(bindings)){catalogue=`${bindings.name.text}.${catalogueExport}`;marker=`${bindings.name.text}.ParticipatesIn`;}if(bindings&&ts.isNamedImports(bindings))for(const entry of bindings.elements){const original=(entry.propertyName??entry.name).text;if(original===catalogueExport)catalogue=entry.name.text;if(original==='ParticipatesIn')marker=entry.name.text;}}
  const names=new Set([...text.matchAll(/\b[A-Za-z_$][\w$]*\b/g)].map(m=>m[0]));
  const unique=prefix=>{let candidate=prefix,i=1;while(names.has(candidate))candidate=prefix+i++;names.add(candidate);return candidate;};
  const imports=[];
  if(!catalogue){catalogue=unique('__racFeatures');imports.push(`${catalogueExport} as ${catalogue}`);}
  if(!marker){marker=unique('__racParticipatesIn');imports.push(`ParticipatesIn as ${marker}`);}
  const edits=[{start:containing.getStart(sf),end:containing.getStart(sf),text:`@${marker}(${features.map(f=>`${catalogue}.${f.key}`).join(', ')})\n`}];
  if(imports.length){const insertion=sf.statements.filter(ts.isImportDeclaration).at(-1)?.end??(text.startsWith('#!')?text.indexOf('\n')+1:0);edits.push({start:insertion,end:insertion,text:`\nimport { ${imports.join(', ')} } from ${JSON.stringify(moduleName)};\n`});}
  return {kind:'decorator',edits};
 }
 const relevant=statements.filter(n=>n.end>selectionStart&&n.getStart(sf)<=selectionEnd&&!statements.some(parent=>parent!==n&&parent.getStart(sf)<=n.getStart(sf)&&parent.end>=n.end&&parent.getStart(sf)>=selectionStart&&parent.end<=selectionEnd));
 let start,end;
 if(selectionStart===selectionEnd){const closest=statements.filter(n=>n.getStart(sf)<=selectionStart&&n.end>=selectionEnd).sort((a,b)=>(a.end-a.pos)-(b.end-b.pos))[0];if(!closest)throw new Error('Select an instruction or declaration.');start=closest.getStart(sf);end=closest.end;}
 else{const enclosed=relevant.filter(n=>n.getStart(sf)>=selectionStart&&n.end<=selectionEnd);const chosen=enclosed.length?enclosed:relevant.sort((a,b)=>(a.end-a.pos)-(b.end-b.pos)).slice(0,1);if(!chosen.length)throw new Error('No complete instruction in selection.');start=Math.min(...chosen.map(n=>n.getStart(sf)));end=Math.max(...chosen.map(n=>n.end));}
 const before=features.map(f=>`// @rac-feature-begin ${f.id}\n`).join('');
 const after=[...features].reverse().map(f=>`\n// @rac-feature-end ${f.id}`).join('');
 return {kind:'block',edits:[{start,end:start,text:before},{start:end,end,text:after}]};
}
/**
 * Applies edits backwards so original coordinates remain valid.
 * @param {string} text Original source.
 * @param {{edits: {start:number,end:number,text:string}[]}} plan Planned edits.
 */
export function applyMarkPlan(text,plan){for(const edit of [...plan.edits].sort((a,b)=>b.start-a.start))text=text.slice(0,edit.start)+edit.text+text.slice(edit.end);return text;}
