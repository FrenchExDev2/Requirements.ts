import { expect } from 'vitest';
import * as ts from 'typescript';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-shared-kernel';
import type { RequirementId } from '@frenchexdev2/requirements-shared-kernel/types';
import { ArchitectureContractsFeature } from '../../src/architecture-contracts.js';
import { hasQualificationRuntime } from '../../../requirements-compliance/src/qualification-inventory.js';
import { buildSatisfiedByIndex } from '../../../requirements-wizards/src/requirement-core.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const monorepoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const sharedKernelFile = (rel: string) => `Requirements.SharedKernel.ts/packages/requirements-shared-kernel/${rel}`;
const sharedKernelSource = (rel: string) => readFile(resolve(monorepoRoot, sharedKernelFile(rel)), 'utf8');
const source = (file: string) => readFile(resolve(root, file), 'utf8');
const ast = (file: string, text: string) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(resolve(root, directory), { withFileTypes: true });
  return (await Promise.all(entries.map(async entry => entry.isDirectory() ? sources(`${directory}/${entry.name}`) : entry.name.endsWith('.ts') ? [`${directory}/${entry.name}`] : []))).flat();
}

@FeatureTest(ArchitectureContractsFeature, { timeout: 120_000 })
class ArchitectureContractTests {
  @Verifies<ArchitectureContractsFeature>('styleUsesInterfacesAndInjectedVocabulary')
  async styleUsesInterfacesAndInjectedVocabulary() {
    const file = sharedKernelFile('src/style.ts');
    const text = await sharedKernelSource('src/style.ts');
    const sf = ast(file, text);
    expect(sf.statements.some(node => ts.isInterfaceDeclaration(node) && node.name.text === 'RequirementStyle')).toBe(true);
    expect(sf.statements.some(node => ts.isClassDeclaration(node) && node.name?.text === 'RequirementStyle')).toBe(false);
    expect(hasQualificationRuntime({ file, text })).toBe(false);
    const baseFile = sharedKernelFile('src/base.ts');
    const baseText = await sharedKernelSource('src/base.ts');
    const base = ast(baseFile, baseText);
    const requirement = base.statements.find((node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === 'Requirement');
    expect(requirement?.typeParameters?.[0]?.constraint?.getText(base)).toBe('RequirementStyle');
    expect(requirement?.typeParameters?.[0]?.default?.getText(base)).toBe('RequirementStyle');
    expect(hasQualificationRuntime({ file: baseFile, text: baseText })).toBe(true);
    const helpers = sf.statements.filter(ts.isTypeAliasDeclaration).filter(node => node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)).map(node => node.name.text);
    for (const helper of ['KindsOf', 'StatusesOf', 'RiskLevelsOf', 'VerificationMethodsOf', 'RationaleKindsOf', 'SourceKindsOf', 'StatementPatternsOf']) expect(helpers).toContain(helper);
    for (const file of await sources('packages/requirements-core/src')) {
      const sf = ast(file, await source(file));
      const imports = sf.statements.filter(ts.isImportDeclaration).map(node => ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : '');
      expect(imports.filter(name => name.startsWith('@frenchexdev2/requirements-styles')), file).toEqual([]);
    }
  }

  @Verifies<ArchitectureContractsFeature>('styleConcernsHaveIndependentPublicInterfaces')
  async styleConcernsHaveIndependentPublicInterfaces() {
    const file = sharedKernelFile('src/style.ts');
    const text = await sharedKernelSource('src/style.ts'), sf = ast(file, text);
    const concerns = ['StyleVocabulary', 'StyleValidators', 'StyleTemplates', 'RequirementReporter'];
    const interfaces = sf.statements.filter(ts.isInterfaceDeclaration);
    for (const concern of concerns) {
      const declaration = interfaces.find(node => node.name.text === concern);
      expect(declaration?.modifiers?.some(node => node.kind === ts.SyntaxKind.ExportKeyword), concern).toBe(true);
      const references: string[] = [];
      const visit = (node: ts.Node): void => {
        if (ts.isTypeReferenceNode(node)) references.push(node.typeName.getText(sf));
        ts.forEachChild(node, visit);
      };
      visit(declaration!);
      expect(references.filter(name => concerns.includes(name)), concern).toEqual([]);
    }
    const bundle = interfaces.find(node => node.name.text === 'RequirementStyle')!;
    expect(bundle.members.map(member => member.name?.getText(sf))).toEqual(expect.arrayContaining(['vocabulary', 'validators', 'templates', 'reporter', 'fitCriterionAdapters']));
    for (const concern of ['Vocabulary', 'Validators', 'Templates', 'Reporter', 'Adapters']) expect(text.slice(0, text.indexOf('import type'))).toContain(concern);
    expect(hasQualificationRuntime({ file, text })).toBe(false);
  }

  @Verifies<ArchitectureContractsFeature>('promptsStayBehindTheirPort')
  async promptsStayBehindTheirPort() {
    const files = [...await sources('packages/requirements/src'), ...await sources('packages/requirements-wizards/src')];
    const promptImports: string[] = [];
    for (const file of files) {
      const sf = ast(file, await source(file));
      const imports = sf.statements.filter(ts.isImportDeclaration).map(node => ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : '');
      expect(imports.filter(name => /^(?:node:)?readline(?:\/|$)/.test(name)), file).toEqual([]);
      if (imports.includes('@clack/prompts')) promptImports.push(file);
    }
    expect(promptImports).toEqual(['packages/requirements/src/cli/prompt-shell.ts']);
    const shell = await source(promptImports[0]!);
    expect(shell).toContain('Prompt');
    expect(hasQualificationRuntime({ file: promptImports[0]!, text: shell })).toBe(true);
  }

  @Verifies<ArchitectureContractsFeature>('documentsCanonicalTraceabilityAndInverseLinks')
  async documentsCanonicalTraceabilityAndInverseLinks() {
    const readme = await source('packages/requirements/README.md');
    for (const token of ['Requirement', 'Feature', 'AC', 'Test', '@Satisfies', '@Verifies']) expect(readme).toContain(token);
    const glossary = await source('packages/requirements/GLOSSARY.md');
    for (const term of ['Requirement', 'Feature', 'Specifies', 'SpecifiedBy', 'Satisfies', 'SatisfiedBy', 'Verifies', 'VerifiedBy']) expect(glossary).toMatch(new RegExp(`^\\*\\*[^\\n]*\\b${term}\\b[^\\n]*\\*\\*`, 'm'));
    expect(glossary.match(/\*\*Requirement\*\*[^\n]+/)?.[0]).toContain('29148');
    // This checks the project's attributed vocabulary, not the truth of a standards quotation.
    expect(buildSatisfiedByIndex().get('ReqDslCompleteRequirement' as RequirementId)).toContain('ArchitectureContractsFeature');
  }
}
void ArchitectureContractTests;
