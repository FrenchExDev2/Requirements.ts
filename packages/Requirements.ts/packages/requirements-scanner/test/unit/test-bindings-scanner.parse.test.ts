import { expect } from 'vitest';
import * as ts from 'typescript';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { TestBindingsScannerFeature } from '@frenchexdev2/requirements-requirements';
import {
  parseTestFile,
  extractFeatureTestArg,
  extractVerifiesArgs,
  resolveTarget,
  resolveBarrelTarget,
  isInScope,
  collectDynamicImportTargets,
  hasTypeCheckOnlyDecorator,
} from '../../src/test-bindings-scanner';

const ROOT = '/root';
const FILE = '/root/test/unit/fake.test.ts';

function parseCls(src: string): ts.ClassDeclaration {
  const sf = ts.createSourceFile('x.ts', src, ts.ScriptTarget.ES2022, true);
  for (const s of sf.statements) if (ts.isClassDeclaration(s)) return s;
  throw new Error('no class');
}

function firstMethod(cls: ts.ClassDeclaration): ts.MethodDeclaration {
  for (const m of cls.members) if (ts.isMethodDeclaration(m)) return m;
  throw new Error('no method');
}

@FeatureTest(TestBindingsScannerFeature)
class ParseTestFileTests {
  @Verifies<TestBindingsScannerFeature>('parsesFeatureTestDecoratedClass')
  'parses a @FeatureTest class with @Verifies methods and imports'() {
    const src = `
import { foo } from '../../src/lib/foo';
@FeatureTest(MyFeat)
class T {
  @Verifies<MyFeat>('ac1')
  m() { foo(); }
}`;
    const r = parseTestFile(src, FILE, ROOT);
    expect(r.classes).toHaveLength(1);
    expect(r.classes[0]!.className).toBe('T');
    expect(r.classes[0]!.featureClass).toBe('MyFeat');
    expect(r.classes[0]!.methods[0]!.ac).toBe('ac1');
    expect(r.classes[0]!.methods[0]!.targets).toEqual([
      { file: 'src/lib/foo.ts', symbol: 'foo' },
    ]);
  }

  @Verifies<TestBindingsScannerFeature>('skipsClassWithoutFeatureTestDecorator')
  'skips class without any @FeatureTest decorator'() {
    const src = `class NoDec { m() {} }`;
    const r = parseTestFile(src, FILE, ROOT);
    expect(r.classes).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('skipsAnonymousClass')
  'skips an anonymous class declaration'() {
    const src = `export default @FeatureTest(F) class { m() {} }`;
    // Anonymous class has no `.name` so should be skipped
    const r = parseTestFile(src, FILE, ROOT);
    expect(r.classes).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('skipsNonClassDeclarations')
  'skips interfaces, types, vars'() {
    const src = `
export const x = 1;
export interface I {}
export type T = number;
function free() {}`;
    const r = parseTestFile(src, FILE, ROOT);
    expect(r.classes).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('extractsFeatureTestArgIdentifier')
  'extracts Feature identifier arg from @FeatureTest(X)'() {
    const cls = parseCls(`@FeatureTest(Fx) class C {}`);
    expect(extractFeatureTestArg(cls)).toBe('Fx');
  }

  @Verifies<TestBindingsScannerFeature>('returnsNullWhenFeatureTestArgNotIdentifier')
  'returns null when @FeatureTest arg is not an identifier'() {
    const cls = parseCls(`@FeatureTest('notIdent') class C {}`);
    expect(extractFeatureTestArg(cls)).toBeNull();
  }

  @Verifies<TestBindingsScannerFeature>('returnsNullWhenFeatureTestArgNotIdentifier')
  'returns null when @FeatureTest has no argument'() {
    const cls = parseCls(`@FeatureTest() class C {}`);
    expect(extractFeatureTestArg(cls)).toBeNull();
  }

  @Verifies<TestBindingsScannerFeature>('returnsNullWhenFeatureTestHasNoCallExpression')
  'returns null when @FeatureTest is used bare (not a call)'() {
    const cls = parseCls(`@FeatureTest class C {}`);
    expect(extractFeatureTestArg(cls)).toBeNull();
  }

  @Verifies<TestBindingsScannerFeature>('returnsNullWhenDecoratorNameIsNotFeatureTest')
  'returns null when decorator is not @FeatureTest'() {
    const cls = parseCls(`@Other(F) class C {}`);
    expect(extractFeatureTestArg(cls)).toBeNull();
  }

  @Verifies<TestBindingsScannerFeature>('returnsNullWhenDecoratorNameIsNotFeatureTest')
  'returns null when decorator callee is not an identifier'() {
    const cls = parseCls(`@ns.FeatureTest(F) class C {}`);
    expect(extractFeatureTestArg(cls)).toBeNull();
  }

  @Verifies<TestBindingsScannerFeature>('handlesClassWithNoModifiers')
  'handles class declaration with no modifiers at all'() {
    const cls = parseCls(`class Bare {}`);
    expect(extractFeatureTestArg(cls)).toBeNull();
  }

  @Verifies<TestBindingsScannerFeature>('extractsAllVerifiesArgsFromMethod')
  'collects every @Verifies ac name from a method'() {
    const cls = parseCls(`class C {
      @Verifies<F>('a')
      @Verifies<F>('b')
      m() {}
    }`);
    const m = firstMethod(cls);
    expect(extractVerifiesArgs(m)).toEqual(['a', 'b']);
  }

  @Verifies<TestBindingsScannerFeature>('skipsMethodWithoutVerifiesDecorator')
  'returns empty array when method has no @Verifies'() {
    const cls = parseCls(`class C { m() {} }`);
    expect(extractVerifiesArgs(firstMethod(cls))).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('skipsVerifiesWithoutStringLiteralArg')
  'skips @Verifies whose first arg is not a string literal'() {
    const cls = parseCls(`class C {
      @Verifies(someIdent)
      m() {}
    }`);
    expect(extractVerifiesArgs(firstMethod(cls))).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('skipsVerifiesWithoutStringLiteralArg')
  'skips @Verifies called with no args'() {
    const cls = parseCls(`class C {
      @Verifies()
      m() {}
    }`);
    expect(extractVerifiesArgs(firstMethod(cls))).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('skipsVerifiesWithoutCallExpression')
  'skips bare @Verifies (no call expression)'() {
    const cls = parseCls(`class C {
      @Verifies
      m() {}
    }`);
    expect(extractVerifiesArgs(firstMethod(cls))).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('skipsVerifiesIfDecoratorNameDiffers')
  'skips @Verifies with non-Verifies callee name'() {
    const cls = parseCls(`class C {
      @SomeOther('ac')
      m() {}
    }`);
    expect(extractVerifiesArgs(firstMethod(cls))).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('skipsVerifiesIfDecoratorNameDiffers')
  'skips @Verifies when callee is a property access, not identifier'() {
    const cls = parseCls(`class C {
      @ns.Verifies('ac')
      m() {}
    }`);
    expect(extractVerifiesArgs(firstMethod(cls))).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('handlesMethodWithStringLiteralName')
  'handles method declared with a string-literal name'() {
    const src = `
import { foo } from '../../src/lib/foo';
@FeatureTest(F)
class C {
  @Verifies<F>('ac')
  'human readable description'() { foo(); }
}`;
    const r = parseTestFile(src, FILE, ROOT);
    expect(r.classes[0]!.methods[0]!.methodName).toBe('human readable description');
  }

  @Verifies<TestBindingsScannerFeature>('skipsNonMethodMembers')
  'skips constructor, properties, getters, setters'() {
    const src = `
@FeatureTest(F)
class C {
  prop = 1;
  constructor() {}
  get x() { return 1; }
  set x(v) {}
  @Verifies<F>('ac')
  m() {}
}`;
    const r = parseTestFile(src, FILE, ROOT);
    expect(r.classes[0]!.methods).toHaveLength(1);
    expect(r.classes[0]!.methods[0]!.methodName).toBe('m');
  }

  @Verifies<TestBindingsScannerFeature>('dedupesSymbolsWithinMethod')
  'dedupes the same (file,symbol) within a method'() {
    const src = `
import { foo } from '../../src/lib/foo';
@FeatureTest(F)
class C {
  @Verifies<F>('ac')
  m() { foo(); foo(); new foo(); }
}`;
    const r = parseTestFile(src, FILE, ROOT);
    expect(r.classes[0]!.methods[0]!.targets).toEqual([
      { file: 'src/lib/foo.ts', symbol: 'foo' },
    ]);
  }

  @Verifies<TestBindingsScannerFeature>('emitsEmptyTargetsWhenNoMatchingImports')
  'emits empty targets when no referenced name resolves to an import'() {
    const src = `
@FeatureTest(F)
class C {
  @Verifies<F>('ac')
  m() { bareCall(); }
}`;
    const r = parseTestFile(src, FILE, ROOT);
    expect(r.classes[0]!.methods[0]!.targets).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('emitsEmptyTargetsWhenNoMatchingImports')
  'drops imports that fall outside include scopes'() {
    const src = `
import { foo } from '../../elsewhere/foo';
@FeatureTest(F)
class C {
  @Verifies<F>('ac')
  m() { foo(); }
}`;
    const r = parseTestFile(src, FILE, ROOT);
    expect(r.classes[0]!.methods[0]!.targets).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('emitsEmptyTargetsWhenNoMatchingImports')
  'drops bare (non-relative) imports'() {
    const src = `
import { foo } from 'some-pkg';
@FeatureTest(F)
class C {
  @Verifies<F>('ac')
  m() { foo(); }
}`;
    const r = parseTestFile(src, FILE, ROOT);
    expect(r.classes[0]!.methods[0]!.targets).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('skipsMethodWithoutVerifiesDecorator')
  'skips method with only a non-string-literal @Verifies (acs empty)'() {
    const src = `
@FeatureTest(F)
class C {
  @Verifies(someIdent)
  m() {}
}`;
    const r = parseTestFile(src, FILE, ROOT);
    expect(r.classes[0]!.methods).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('addsClassEvenWhenNoMethodsHaveBindings')
  'adds class entry even when no @Verifies methods are present'() {
    const src = `@FeatureTest(F) class Empty {}`;
    const r = parseTestFile(src, FILE, ROOT);
    expect(r.classes).toHaveLength(1);
    expect(r.classes[0]!.className).toBe('Empty');
    expect(r.classes[0]!.methods).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('resolvesRelativeImportToRelPath')
  'resolveTarget resolves relative import to a root-relative posix path'() {
    const r = resolveTarget(
      { localName: 'foo', moduleSpec: '../../src/lib/bar', kind: 'named' },
      '/root/test/unit/a.test.ts',
      '/root',
    );
    expect(r).toEqual({ file: 'src/lib/bar.ts', symbol: 'foo' });
  }

  @Verifies<TestBindingsScannerFeature>('appendsTsExtensionWhenMissing')
  'appends .ts extension when missing'() {
    const r = resolveTarget(
      { localName: 'x', moduleSpec: '../x', kind: 'named' },
      '/root/test/unit/a.test.ts',
      '/root',
    );
    expect(r!.file.endsWith('.ts')).toBe(true);
  }

  @Verifies<TestBindingsScannerFeature>('returnsNullForBareModuleSpecifier')
  'returns null for bare (non-relative) module specifier'() {
    const r = resolveTarget(
      { localName: 'x', moduleSpec: 'vitest', kind: 'named' },
      '/root/a.test.ts',
      '/root',
    );
    expect(r).toBeNull();
  }

  @Verifies<TestBindingsScannerFeature>('preservesExistingTsExtension')
  'preserves existing .ts extension'() {
    const r = resolveTarget(
      { localName: 'x', moduleSpec: '../src/foo.ts', kind: 'named' },
      '/root/test/a.test.ts',
      '/root',
    );
    expect(r!.file).toBe('src/foo.ts');
  }

  @Verifies<TestBindingsScannerFeature>('mapsJsExtensionToTsForNodeNextImports')
  'maps .js extension to .ts for NodeNext-style imports'() {
    const r = resolveTarget(
      { localName: 'x', moduleSpec: '../src/foo.js', kind: 'named' },
      '/root/test/a.test.ts',
      '/root',
    );
    expect(r!.file).toBe('src/foo.ts');
  }

  @Verifies<TestBindingsScannerFeature>('isInScopeReturnsTrueForMatch')
  'returns true when relPath starts with one of the scopes'() {
    expect(isInScope('src/foo.ts', ['src/', 'scripts/'])).toBe(true);
    expect(isInScope('scripts/foo.ts', ['src/', 'scripts/'])).toBe(true);
  }

  @Verifies<TestBindingsScannerFeature>('isInScopeReturnsFalseForNoMatch')
  'returns false when relPath matches none of the scopes'() {
    expect(isInScope('elsewhere/foo.ts', ['src/', 'scripts/'])).toBe(false);
    expect(isInScope('src/foo.ts', [])).toBe(false);
  }

  // ── collectDynamicImportTargets ────────────────────────────────────────

  @Verifies<TestBindingsScannerFeature>('tracksDynamicImportFromMethodBody')
  'collects a target for await import("../../src/x") in a method body'() {
    const method = firstMethod(parseCls(`
class T {
  async m() { const lib = await import('../../src/index'); }
}`));
    const targets = collectDynamicImportTargets(method, FILE, ROOT, ['src/']);
    expect(targets).toEqual([{ file: 'src/index.ts', symbol: '*' }]);
  }

  @Verifies<TestBindingsScannerFeature>('emitsStarSymbolForDynamicImport')
  'dynamic import targets use "*" as symbol (whole module namespace)'() {
    const method = firstMethod(parseCls(`
class T {
  async m() { await import('../../src/foo'); }
}`));
    const targets = collectDynamicImportTargets(method, FILE, ROOT, ['src/']);
    expect(targets[0]!.symbol).toBe('*');
  }

  @Verifies<TestBindingsScannerFeature>('ignoresBareModuleDynamicImport')
  'ignores dynamic imports of bare module specifiers (cross-package)'() {
    const method = firstMethod(parseCls(`
class T {
  async m() { await import('node:fs'); await import('vitest'); }
}`));
    const targets = collectDynamicImportTargets(method, FILE, ROOT, ['src/']);
    expect(targets).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('ignoresOutOfScopeDynamicImport')
  'ignores dynamic imports that resolve outside the configured scope'() {
    const method = firstMethod(parseCls(`
class T {
  async m() { await import('../../scripts/helper'); }
}`));
    const targets = collectDynamicImportTargets(method, FILE, ROOT, ['src/']);
    expect(targets).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('ignoresNonStringLiteralDynamicImportArg')
  'ignores dynamic imports whose argument is a template literal or variable'() {
    const method = firstMethod(parseCls(`
class T {
  async m() { const p = './foo'; await import(p); await import(\`./bar\`); }
}`));
    const targets = collectDynamicImportTargets(method, FILE, ROOT, ['src/']);
    expect(targets).toEqual([]);
  }

  // ── resolveBarrelTarget ────────────────────────────────────────────────

  @Verifies<TestBindingsScannerFeature>('resolvesBarrelImportToIndexTs')
  'resolveBarrelTarget maps "../../src" → "src/index.ts"'() {
    const r = resolveBarrelTarget(
      { localName: 'getSatisfactionLinks', moduleSpec: '../../src', kind: 'named' },
      '/root/test/unit/a.test.ts',
      '/root',
    );
    expect(r).toEqual({ file: 'src/index.ts', symbol: 'getSatisfactionLinks' });
  }

  @Verifies<TestBindingsScannerFeature>('returnsNullForBarrelTargetOnBareModule')
  'resolveBarrelTarget returns null for non-relative specifiers'() {
    expect(resolveBarrelTarget(
      { localName: 'x', moduleSpec: 'lodash', kind: 'named' },
      '/root/test/unit/a.test.ts',
      '/root',
    )).toBeNull();
    expect(resolveBarrelTarget(
      { localName: 'x', moduleSpec: '@frenchexdev2/requirements-core', kind: 'named' },
      '/root/test/unit/a.test.ts',
      '/root',
    )).toBeNull();
  }

  @Verifies<TestBindingsScannerFeature>('returnsNullForBarrelTargetWhenSpecHasExtension')
  'resolveBarrelTarget returns null when the spec already names a file (.ts/.js)'() {
    expect(resolveBarrelTarget(
      { localName: 'x', moduleSpec: '../../src/foo.ts', kind: 'named' },
      '/root/test/unit/a.test.ts',
      '/root',
    )).toBeNull();
    expect(resolveBarrelTarget(
      { localName: 'x', moduleSpec: '../../src/foo.js', kind: 'named' },
      '/root/test/unit/a.test.ts',
      '/root',
    )).toBeNull();
  }

  @Verifies<TestBindingsScannerFeature>('fallsBackToBarrelWhenPrimaryOutOfScope')
  'parseTestFile falls back to barrel resolution when primary lands outside scope'() {
    const src = `
import { foo } from '../../src';
@FeatureTest(F)
class T {
  @Verifies<F>('ac1')
  m() { foo(); }
}`;
    const r = parseTestFile(src, '/root/test/unit/a.test.ts', '/root');
    expect(r.classes[0]!.methods[0]!.targets).toEqual([
      { file: 'src/index.ts', symbol: 'foo' },
    ]);
  }

  @Verifies<TestBindingsScannerFeature>('fallsBackToBarrelWhenPrimaryFileDoesNotExist')
  'parseTestFile prefers barrel when <path>.ts does not exist but <path>/index.ts does'() {
    // Repro of the scaffolders bug: import `'../../src/scaffolders'` was being
    // resolved to a phantom `src/scaffolders.ts`. With the fileExists oracle,
    // resolution falls back to the real `src/scaffolders/index.ts` barrel.
    const src = `
import { foo } from '../../src/scaffolders';
@FeatureTest(F)
class T {
  @Verifies<F>('ac1')
  m() { foo(); }
}`;
    const fileExists = (rel: string): boolean => rel === 'src/scaffolders/index.ts';
    const r = parseTestFile(src, '/root/test/unit/a.test.ts', '/root', undefined, fileExists);
    expect(r.classes[0]!.methods[0]!.targets).toEqual([
      { file: 'src/scaffolders/index.ts', symbol: 'foo' },
    ]);
  }

  // ── hasTypeCheckOnlyDecorator ──────────────────────────────────────────

  @Verifies<TestBindingsScannerFeature>('detectsTypeCheckOnlyDecoratorOnMethod')
  'returns true when method carries @TypeCheckOnly()'() {
    const method = firstMethod(parseCls(`
class T {
  @TypeCheckOnly()
  @Verifies<F>('ac1')
  m() {}
}`));
    expect(hasTypeCheckOnlyDecorator(method)).toBe(true);
  }

  @Verifies<TestBindingsScannerFeature>('returnsFalseWhenTypeCheckOnlyAbsent')
  'returns false when @TypeCheckOnly is missing or under a different name'() {
    const noDec = firstMethod(parseCls(`
class T {
  @Verifies<F>('ac1')
  m() {}
}`));
    expect(hasTypeCheckOnlyDecorator(noDec)).toBe(false);
    // identifier other than TypeCheckOnly must not match
    const other = firstMethod(parseCls(`
class T {
  @SomethingElse()
  m() {}
}`));
    expect(hasTypeCheckOnlyDecorator(other)).toBe(false);
  }
}

void ParseTestFileTests;
