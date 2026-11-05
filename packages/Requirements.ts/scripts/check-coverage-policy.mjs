/** Reject missing or weakened coverage/mutation thresholds before qualification. */
import ts from 'typescript';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function assertCoveragePolicy() {
  const directories=(await readdir(resolve(root,'packages'),{withFileTypes:true})).filter(entry=>entry.isDirectory());
  const files=directories.map(entry=>({file:`packages/${entry.name}/vitest.config.ts`,metrics:['lines','branches','functions','statements']}));
  files.push({file:'stryker.preset.cjs',metrics:['high','low','break']});
  files.push({file:'packages/requirements-lib/stryker.conf.cjs',metrics:['high','low','break']});
  for(const {file,metrics} of files) {
    const ast=ts.createSourceFile(file,await readFile(resolve(root,file),'utf8'),ts.ScriptTarget.Latest,true);
    const policies=[];
    function visit(node) {
      if(ts.isPropertyAssignment(node)&&node.name.getText(ast)==='thresholds'&&ts.isObjectLiteralExpression(node.initializer)) policies.push(node.initializer);
      ts.forEachChild(node,visit);
    }
    visit(ast);
    if(policies.length!==1) throw new Error(`${file}: exactly one explicit threshold policy is required`);
    for(const metric of metrics) {
      const property=policies[0].properties.find(node=>ts.isPropertyAssignment(node)&&node.name.getText(ast)===metric);
      if(!property||!ts.isNumericLiteral(property.initializer)||Number(property.initializer.text)!==100) throw new Error(`${file}: ${metric} must be 100`);
    }
  }
  return {coverageConfigurations:directories.length,mutationConfigurations:2,threshold:100};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) console.log(JSON.stringify(await assertCoveragePolicy()));
