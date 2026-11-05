/** AST inventory for complete qualification. Reading specifications never executes them. */
import * as ts from 'typescript';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { parseTestFile, collectLocalHelpers, collectClassHelpers, collectReferencedNamesTransitive } from '@frenchexdev2/requirements-scanner';
import { parseFeatureSource, parseRequirementSource } from './compliance-core.js';
import { qualificationTestId, type QualificationDiagnostic, type QualificationInventory, type QualificationTest, type QualificationCriterion } from './qualification.js';

/** Explicit source texts make fixture assertions independent of filesystem discovery. */
export interface QualificationSource { readonly file: string; readonly text: string }

function unwrap(node: ts.Expression): ts.Expression {
  return ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;
}

function property(node: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  const entry = node.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText() === name);
  return entry && ts.isPropertyAssignment(entry) ? unwrap(entry.initializer) : undefined;
}

function strings(node: ts.Expression | undefined): string[] {
  return node && ts.isArrayLiteralExpression(unwrap(node)) ? (unwrap(node) as ts.ArrayLiteralExpression).elements.filter(ts.isStringLiteral).map(n => n.text) : [];
}

function criteria(cls: ts.ClassDeclaration, id: string): QualificationCriterion[] {
  const member = cls.members.find(m => ts.isPropertyDeclaration(m) && m.name.getText() === 'fitCriteria');
  if (!member || !ts.isPropertyDeclaration(member) || !member.initializer) return [];
  const value = unwrap(member.initializer);
  if (!ts.isArrayLiteralExpression(value)) return [];
  return value.elements.map((entry, index) => {
    const item = ts.isObjectLiteralExpression(entry) ? entry : undefined;
    const kind = item && property(item, 'kind');
    return { id: `${id}:fit:${index + 1}`, kind: kind && ts.isStringLiteral(kind) ? kind.text : 'unknown', binds: item ? strings(property(item, 'binds')) : [] };
  });
}

/** Resolve aliases including namespace imports, Vitest variants and simple alias chains. */
function aliases(sf: ts.SourceFile): Map<string, string> {
  const map = new Map<string, string>([['it', 'it'], ['test', 'test'], ['describe', 'describe'], ['suite', 'suite'], ['FeatureTest', 'FeatureTest'], ['Verifies', 'Verifies'], ['Exclude', 'Exclude'], ['TypeCheckOnly', 'TypeCheckOnly']]);
  for (const stmt of sf.statements) if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
    const bindings = stmt.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const spec of bindings.elements) map.set(spec.name.text, spec.propertyName?.text ?? spec.name.text);
    if (bindings && ts.isNamespaceImport(bindings)) map.set(bindings.name.text, `namespace:${stmt.moduleSpecifier.text}`);
  }
  const resolve = (node: ts.Expression): string | undefined => {
    if (ts.isIdentifier(node)) return map.get(node.text);
    if (ts.isCallExpression(node)) return resolve(node.expression);
    if (ts.isPropertyAccessExpression(node)) {
      const base = resolve(node.expression);
      return base?.startsWith('namespace:') ? node.name.text : base;
    }
    if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) {
      const base = resolve(node.expression);
      return base?.startsWith('namespace:') ? node.argumentExpression.text : base;
    }
    return undefined;
  };
  // Alias propagation terminates even with cycles: entries are only added once.
  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && !map.has(node.name.text)) {
        const value = resolve(unwrap(node.initializer));
        if (value) { map.set(node.name.text, value); changed = true; }
      }
      if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer) {
        const base = resolve(unwrap(node.initializer));
        if (base?.startsWith('namespace:')) for (const item of node.name.elements) {
          if (!ts.isIdentifier(item.name) || map.has(item.name.text)) continue;
          const key = item.propertyName ?? item.name;
          if (ts.isIdentifier(key) || ts.isStringLiteral(key)) { map.set(item.name.text, key.text); changed = true; }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return map;
}

function callee(node: ts.Expression, names: Map<string, string>): string {
  node = unwrap(node);
  if (ts.isIdentifier(node)) return names.get(node.text) ?? node.text;
  if (ts.isCallExpression(node)) return callee(node.expression, names);
  if (ts.isTaggedTemplateExpression(node)) return callee(node.tag, names);
  if (ts.isPropertyAccessExpression(node)) return callee(node.expression, names).startsWith('namespace:') ? node.name.text : callee(node.expression, names);
  if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) return callee(node.expression, names).startsWith('namespace:') ? node.argumentExpression.text : callee(node.expression, names);
  return '';
}

function decorator(node: ts.ClassDeclaration | ts.MethodDeclaration, name: string, names: Map<string, string>): ts.CallExpression | undefined {
  return ts.getDecorators(node)?.map(d => d.expression).find((e): e is ts.CallExpression => ts.isCallExpression(e) && callee(e.expression, names) === name);
}

/** Bare registration is forbidden irrespective of alias, namespace, .each/.skip or comments. */
export function inspectQualificationTests(source: QualificationSource, root: string): { tests: QualificationTest[]; diagnostics: QualificationDiagnostic[] } {
  const sf = ts.createSourceFile(source.file, source.text, ts.ScriptTarget.Latest, true);
  const names = aliases(sf), diagnostics: QualificationDiagnostic[] = [], tests: QualificationTest[] = [];
  const add = (code: string, subject: string, message: string) => { diagnostics.push({ code, subject, message }); };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ['it', 'test', 'describe', 'suite'].includes(callee(node.expression, names))) add('bare-test-registration', `${source.file}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`, 'Register all tests through @FeatureTest/@Verifies, including parameterized and integration tests.');
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const helpers = collectLocalHelpers(sf);
  const parsed = parseTestFile(source.text, path.resolve(root, source.file), root, ['packages/', 'scripts/', 'src/', 'bin/']);
  for (const stmt of sf.statements) if (ts.isClassDeclaration(stmt) && stmt.name) {
    const binding = decorator(stmt, 'FeatureTest', names);
    if (!binding) continue;
    const featureArg = binding.arguments[0];
    const feature = featureArg && ts.isIdentifier(featureArg) ? names.get(featureArg.text) ?? featureArg.text : featureArg && ts.isPropertyAccessExpression(featureArg) ? featureArg.name.text : featureArg?.getText() ?? '';
    const classHelpers = collectClassHelpers(stmt);
    for (const member of stmt.members) if (ts.isMethodDeclaration(member)) {
      if (decorator(member, 'Exclude', names)) continue;
      if (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)) { add('dynamic-test-name', source.file, 'Use stable literal method names for individual execution evidence.'); continue; }
      const name = member.name.text;
      const verifies = decorator(member, 'Verifies', names);
      const validArgument = verifies && verifies.arguments.length === 1 && ts.isStringLiteral(verifies.arguments[0]!);
      if (verifies && !validArgument) add('invalid-verifies-argument', `${source.file}:${stmt.name.text}.${name}`, '@Verifies requires exactly one literal AC, matching its public TypeScript and runtime contract.');
      const acs = validArgument ? [(verifies.arguments[0] as ts.StringLiteral).text] : [];
      if (!acs.length) add('undecorated-test', `${source.file}:${stmt.name.text}.${name}`, 'Every executable test method needs @Verifies with a literal AC.');
      const declaredType = verifies?.typeArguments?.[0];
      if (declaredType && ts.isTypeReferenceNode(declaredType)) {
        const declared = ts.isIdentifier(declaredType.typeName) ? names.get(declaredType.typeName.text) ?? declaredType.typeName.text : declaredType.typeName.right.text;
        if (declared !== feature) add('mismatched-verifies-feature', `${source.file}:${stmt.name.text}.${name}`, '@Verifies must name the same Feature as @FeatureTest.');
      }
      const referenced = collectReferencedNamesTransitive(member, helpers, classHelpers);
      let hasAssertion = false;
      // Helpers can use namespace assertions; only calls constitute runtime assertions.
      const assertionVisit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ['expect', 'assert', 'fc'].includes(callee(node.expression, names))) hasAssertion = true;
        ts.forEachChild(node, assertionVisit);
      };
      if (member.body) assertionVisit(member.body);
      for (const name of referenced) {
        const helper = helpers.get(name) ?? classHelpers.get(name);
        if (helper) assertionVisit(helper);
      }
      if (!member.body?.statements.length) hasAssertion = false;
      const typeOnly = !!decorator(member, 'TypeCheckOnly', names);
      const strategy = typeOnly ? 'type' : /fuzz/i.test(source.file) ? 'fuzz' : /property/i.test(source.file) || referenced.includes('fc') ? 'property' : 'example';
      const level = source.file.match(/(?:^|\/)(?:test|tests)\/(unit|functional|e2e|a11y|i18n|visual|perf|smoke|integration)\//)?.[1] ?? 'unit';
      const targets = parsed.classes.find(c => c.className === stmt.name!.text)?.methods.find(m => m.methodName === name)?.targets.map(t => t.file) ?? [];
      for (const ac of acs) tests.push({ id: qualificationTestId(source.file, stmt.name.text, name), file: source.file, className: stmt.name.text, name, feature, ac, level, targets, hasAssertion, strategy });
    }
  }
  const forwardingOnly = sf.statements.length > 0 && sf.statements.every(stmt => ts.isImportDeclaration(stmt) && !stmt.importClause && ts.isStringLiteral(stmt.moduleSpecifier) && /\.test(?:\.[jt]s)?$/.test(stmt.moduleSpecifier.text));
  if (!tests.length && !forwardingOnly) add('unregistered-test-file', source.file, 'A test file must contain at least one @FeatureTest/@Verifies contract.');
  return { tests, diagnostics };
}

/** TypeScript erasure distinguishes true type/re-export files from executable barrels. */
export function hasQualificationRuntime(source: QualificationSource): boolean {
  if (/\.d\.[cm]?ts$/.test(source.file)) return false;
  const output = ts.transpileModule(source.text, { fileName: source.file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, experimentalDecorators: true, removeComments: true } }).outputText;
  const sf = ts.createSourceFile('runtime.js', output, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return sf.statements.some(stmt => !ts.isImportDeclaration(stmt) && !ts.isExportDeclaration(stmt) && !ts.isEmptyStatement(stmt) && !(ts.isExpressionStatement(stmt) && ts.isStringLiteral(stmt.expression) && stmt.expression.text === 'use strict'));
}

/** Deterministic canonical inventory: duplicate identities are errors, never unions. */
export function buildQualificationInventory(sources: readonly QualificationSource[], root: string): QualificationInventory {
  const requirements: QualificationInventory['requirements'][number][] = [], features: QualificationInventory['features'][number][] = [];
  const tests: QualificationTest[] = [], executableFiles: string[] = [], diagnostics: QualificationDiagnostic[] = [];
  const hashes: Record<string, string> = {};
  const exclusions: NonNullable<QualificationInventory['exclusions']>[number][] = [];
  for (const source of [...sources].sort((a, b) => a.file.localeCompare(b.file))) {
    hashes[source.file] = createHash('sha256').update(source.text, 'utf8').digest('hex');
    if (/\.d\.[cm]?ts$/.test(source.file)) exclusions.push({ file: source.file, reason: 'declaration-only' });
    if (!/\.[cm]?[jt]sx?$/.test(source.file) || /\.d\.[cm]?ts$/.test(source.file)) continue;
    if (/\.test\.[cm]?[jt]sx?$/.test(source.file)) {
      const result = inspectQualificationTests(source, root); tests.push(...result.tests); diagnostics.push(...result.diagnostics); continue;
    }
    const sf = ts.createSourceFile(source.file, source.text, ts.ScriptTarget.Latest, true);
    // Visit every top-level class, rather than accepting only the first class in a file.
    for (const cls of sf.statements.filter(ts.isClassDeclaration)) {
      const text = cls.getText(sf);
      const feature = parseFeatureSource(text, source.file);
      if (feature) features.push({ ...feature, acs: feature.acDetails.map(ac => ({ name: ac.name, levels: ac.expectedLevels })) });
      const requirement = parseRequirementSource(text, source.file);
      if (requirement) requirements.push({ ...requirement, criteria: criteria(cls, requirement.id) });
    }
    if (/(?:^|\/)(?:src|bin)\//.test(source.file) || source.file.startsWith('scripts/')) {
      if (!hasQualificationRuntime(source)) { exclusions.push({ file: source.file, reason: 'no-own-runtime-statements' }); continue; }
      executableFiles.push(source.file);
      // Suppression directives are executable-code exclusions, not proof of coverage.
      // Parsed node boundaries distinguish comments from regex/template contents.
      // A stand-alone scanner cannot rescan division tokens as regular expressions.
      const seenComments = new Set<number>();
      const inspectComments = (node: ts.Node): void => {
        for (const position of [node.pos, node.end]) for (const comment of [...ts.getLeadingCommentRanges(source.text, position) ?? [], ...ts.getTrailingCommentRanges(source.text, position) ?? []]) {
          if (seenComments.has(comment.pos)) continue;
          seenComments.add(comment.pos);
          if (/^\/[/\*]\s*(?:(?:[cv]8|istanbul)\s+ignore\b|Stryker\s+disable\b)/i.test(source.text.slice(comment.pos, comment.end))) diagnostics.push({ code: 'suppressed-executable-code', subject: `${source.file}:${sf.getLineAndCharacterOfPosition(comment.pos).line + 1}`, message: 'Executable coverage and mutation exclusions must be removed; comments cannot establish non-applicability.' });
        }
        ts.forEachChild(node, inspectComments);
      };
      inspectComments(sf);
    }
  }
  for (const [kind, entries] of [['Feature', features], ['Requirement', requirements]] as const) {
    const ids = new Set<string>(), classes = new Set<string>();
    for (const entry of entries) {
      if (ids.has(entry.id) || classes.has(entry.className)) diagnostics.push({ code: 'duplicate-contract', subject: entry.file, message: `${kind} ${entry.id}/${entry.className} has more than one declaration; use a canonical export.` });
      ids.add(entry.id); classes.add(entry.className);
    }
  }
  // Resolve workspace package imports and re-export shims to their owning source,
  // rather than crediting an uninstrumented dist or an empty index.ts barrel.
  const texts = new Map(sources.map(s => [s.file, s.text]));
  const modules = new Map<string, string>();
  for (const source of sources.filter(s => /(?:^|\/)package\.json$/.test(s.file))) {
    let manifest: { name?: string; exports?: Record<string, string | { import?: string; default?: string }> };
    try {
      manifest = JSON.parse(source.text);
      if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new TypeError('Package manifest must be an object.');
    } catch (error) {
      diagnostics.push({ code: 'invalid-package-manifest', subject: source.file, message: String(error) });
      continue;
    }
    if (!manifest.name) continue;
    for (const [key, entry] of Object.entries(manifest.exports ?? {})) {
      const target = typeof entry === 'string' ? entry : entry.import ?? entry.default;
      if (target) modules.set(manifest.name + (key === '.' ? '' : key.slice(1)), path.posix.normalize(path.posix.join(path.posix.dirname(source.file), target.replace(/^\.\/dist\//, 'src/').replace(/\.js$/, '.ts'))));
    }
  }
  const targetFile = (from: string, spec: string): string | undefined => {
    if (!spec.startsWith('.')) return modules.get(spec);
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    return [target, target.replace(/\.js$/, '.ts'), target.replace(/\.mjs$/, '.mts'), target.replace(/\.cjs$/, '.cts'), target.replace(/\.jsx$/, '.tsx'), target + '.ts', target + '.mts', target + '.cts', target + '.js', target + '/index.ts'].find(file => texts.has(file));
  };
  const resolveExport = (file: string, symbol: string, visited = new Set<string>()): string[] => {
    const key = `${file}:${symbol}`;
    if (visited.has(key)) return [];
    visited.add(key);
    const text = texts.get(file);
    if (text === undefined) return [];
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const matches: string[] = [];
    for (const stmt of sf.statements) {
      if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
        const next = targetFile(file, stmt.moduleSpecifier.text);
        if (!next || stmt.isTypeOnly) continue;
        if (!stmt.exportClause) matches.push(...resolveExport(next, symbol, visited));
        else if (ts.isNamedExports(stmt.exportClause)) for (const spec of stmt.exportClause.elements) {
          if (!spec.isTypeOnly && (spec.name.text === symbol || symbol === '*')) matches.push(...resolveExport(next, spec.propertyName?.text ?? spec.name.text, visited));
        }
      } else if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) || ts.isEnumDeclaration(stmt)) {
        if (stmt.name?.text === symbol || symbol === '*' || (symbol === 'default' && stmt.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword))) matches.push(file);
      } else if (ts.isExportAssignment(stmt) && (symbol === 'default' || symbol === '*')) {
        matches.push(file);
      } else if (ts.isVariableStatement(stmt) && stmt.declarationList.declarations.some(d => ts.isIdentifier(d.name) && (d.name.text === symbol || symbol === '*'))) matches.push(file);
    }
    return matches;
  };
  const resolvedTests = tests.map(test => {
    const sf = ts.createSourceFile(test.file, texts.get(test.file)!, ts.ScriptTarget.Latest, true);
    const cls = sf.statements.find((s): s is ts.ClassDeclaration => ts.isClassDeclaration(s) && s.name?.text === test.className)!;
    const method = cls.members.find((m): m is ts.MethodDeclaration => ts.isMethodDeclaration(m) && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)) && m.name.text === test.name)!;
    const referenced = collectReferencedNamesTransitive(method, collectLocalHelpers(sf), collectClassHelpers(cls));
    const targets = test.targets.filter(file => executableFiles.includes(file));
    for (const stmt of sf.statements) if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const target = targetFile(test.file, stmt.moduleSpecifier.text), bindings = stmt.importClause?.namedBindings;
      if (!target || stmt.importClause?.isTypeOnly) continue;
      if (stmt.importClause?.name && referenced.includes(stmt.importClause.name.text)) targets.push(...resolveExport(target, 'default'));
      if (bindings && ts.isNamedImports(bindings)) for (const spec of bindings.elements) {
        if (!spec.isTypeOnly && referenced.includes(spec.name.text)) targets.push(...resolveExport(target, spec.propertyName?.text ?? spec.name.text));
      }
      if (bindings && ts.isNamespaceImport(bindings) && referenced.includes(bindings.name.text)) targets.push(...resolveExport(target, '*'));
    }
    return { ...test, targets: [...new Set(targets)].filter(file => executableFiles.includes(file)) };
  });
  const testAliases: Record<string, string[]> = {};
  for (const source of sources.filter(s => /\.test\.[jt]s$/.test(s.file))) {
    const sf = ts.createSourceFile(source.file, source.text, ts.ScriptTarget.Latest, true);
    for (const stmt of sf.statements) if (ts.isImportDeclaration(stmt) && !stmt.importClause && ts.isStringLiteral(stmt.moduleSpecifier) && /\.test(?:\.[jt]s)?$/.test(stmt.moduleSpecifier.text)) {
      const imported = targetFile(source.file, stmt.moduleSpecifier.text);
      if (imported) (testAliases[source.file] ??= []).push(imported);
      else diagnostics.push({ code: 'unresolved-test-forward', subject: source.file, message: 'The forwarded decorated test source does not exist.' });
    }
  }
  return { requirements, features, tests: resolvedTests, executableFiles, hashes, diagnostics, testAliases, exclusions };
}

/** Load source/configuration bytes without reading caches, results, vendor code or Git. */
export async function readQualificationInventory(root: string): Promise<QualificationInventory> {
  const sources: QualificationSource[] = [];
  const excluded = new Set(['node_modules', 'dist', 'test-results', '.git', '.stryker-tmp', 'reports', 'coverage', 'provenance', 'audits', 'icons']);
  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (excluded.has(entry.name) || entry.name.startsWith('.stryker-')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && /\.(?:[cm]?[jt]sx?|json|ya?ml|ps1|psm1|psd1)$/.test(entry.name)) sources.push({ file: path.relative(root, full).replaceAll('\\', '/'), text: await readFile(full, 'utf8') });
    }
  };
  await walk(root);
  return buildQualificationInventory(sources, root);
}
