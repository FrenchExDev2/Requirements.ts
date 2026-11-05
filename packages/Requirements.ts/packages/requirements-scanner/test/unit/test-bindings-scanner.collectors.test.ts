import { expect } from 'vitest';
import * as ts from 'typescript';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { TestBindingsScannerFeature } from '@frenchexdev2/requirements-requirements';
import {
  collectImports,
  collectCalleeNames,
  collectReferencedNames,
  collectReferencedNamesTransitive,
  collectLocalHelpers,
  collectClassHelpers,
  getRootIdentifier,
} from '../../src/test-bindings-scanner';

function sf(src: string): ts.SourceFile {
  return ts.createSourceFile('x.ts', src, ts.ScriptTarget.ES2022, true);
}

function firstClass(source: ts.SourceFile): ts.ClassDeclaration {
  for (const s of source.statements) if (ts.isClassDeclaration(s)) return s;
  throw new Error('no class');
}

function firstMethod(cls: ts.ClassDeclaration, name?: string): ts.MethodDeclaration {
  for (const m of cls.members) {
    if (!ts.isMethodDeclaration(m)) continue;
    if (!name) return m;
    if (ts.isIdentifier(m.name) && m.name.text === name) return m;
    if (ts.isStringLiteral(m.name) && m.name.text === name) return m;
  }
  throw new Error('no method');
}

function firstExpression<T extends ts.Expression>(src: string, pred: (n: ts.Node) => n is T): T {
  const s = sf(src);
  let found: T | undefined;
  const visit = (n: ts.Node): void => {
    if (!found && pred(n)) { found = n; return; }
    ts.forEachChild(n, visit);
  };
  visit(s);
  if (!found) throw new Error('not found');
  return found;
}

@FeatureTest(TestBindingsScannerFeature)
class CollectImportsTests {
  @Verifies<TestBindingsScannerFeature>('collectsNamedImports')
  'collects named imports with localName == name'() {
    const s = sf(`import { a, b } from './m';`);
    const m = collectImports(s);
    expect(m.get('a')).toEqual({ localName: 'a', moduleSpec: './m', kind: 'named' });
    expect(m.get('b')).toEqual({ localName: 'b', moduleSpec: './m', kind: 'named' });
  }

  @Verifies<TestBindingsScannerFeature>('collectsDefaultImport')
  'collects default import'() {
    const s = sf(`import D from './m';`);
    expect(collectImports(s).get('D')).toEqual({ localName: 'D', moduleSpec: './m', kind: 'default' });
  }

  @Verifies<TestBindingsScannerFeature>('collectsNamespaceImport')
  'collects namespace import'() {
    const s = sf(`import * as ns from './m';`);
    expect(collectImports(s).get('ns')).toEqual({ localName: 'ns', moduleSpec: './m', kind: 'namespace' });
  }

  @Verifies<TestBindingsScannerFeature>('skipsTypeOnlyImport')
  'skips `import type { X } from "..."`'() {
    const s = sf(`import type { T } from './m';`);
    expect(collectImports(s).size).toBe(0);
  }

  @Verifies<TestBindingsScannerFeature>('skipsTypeOnlyNamedSpecifiers')
  'skips `import { type T, x } from "..."` — keeps x, drops T'() {
    const s = sf(`import { type T, x } from './m';`);
    const m = collectImports(s);
    expect(m.has('T')).toBe(false);
    expect(m.has('x')).toBe(true);
  }

  @Verifies<TestBindingsScannerFeature>('skipsImportWithoutClause')
  'skips side-effect imports `import "./m"`'() {
    const s = sf(`import './m';`);
    expect(collectImports(s).size).toBe(0);
  }

  @Verifies<TestBindingsScannerFeature>('skipsNonImportStatements')
  'skips non-import statements'() {
    const s = sf(`export const x = 1; function f() {} class C {}`);
    expect(collectImports(s).size).toBe(0);
  }

  @Verifies<TestBindingsScannerFeature>('collectsDefaultImport')
  'collects default + named together from same statement'() {
    const s = sf(`import D, { x } from './m';`);
    const m = collectImports(s);
    expect(m.get('D')!.kind).toBe('default');
    expect(m.get('x')!.kind).toBe('named');
  }

  @Verifies<TestBindingsScannerFeature>('collectsDefaultImport')
  'collects default + namespace together'() {
    const s = sf(`import D, * as ns from './m';`);
    const m = collectImports(s);
    expect(m.get('D')!.kind).toBe('default');
    expect(m.get('ns')!.kind).toBe('namespace');
  }
}

@FeatureTest(TestBindingsScannerFeature)
class CollectCalleeNamesTests {
  @Verifies<TestBindingsScannerFeature>('collectCalleeNamesFindsCallExpressions')
  'finds identifier-rooted call expressions'() {
    const cls = firstClass(sf(`class C { m() { foo(); bar.baz(); } }`));
    const names = collectCalleeNames(firstMethod(cls));
    expect(names.sort()).toEqual(['bar', 'foo']);
  }

  @Verifies<TestBindingsScannerFeature>('collectCalleeNamesFindsNewExpressions')
  'finds new expressions'() {
    const cls = firstClass(sf(`class C { m() { new Thing(); } }`));
    expect(collectCalleeNames(firstMethod(cls))).toEqual(['Thing']);
  }

  @Verifies<TestBindingsScannerFeature>('collectCalleeNamesEmptyWhenNoBody')
  'returns [] when method has no body (abstract or overload)'() {
    const cls = firstClass(sf(`abstract class C { abstract m(): void; }`));
    const m = firstMethod(cls);
    expect(collectCalleeNames(m)).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('collectCalleeNamesIgnoresNonCallChildren')
  'ignores non-call children like variable refs'() {
    const cls = firstClass(sf(`class C { m() { const x = y + 1; } }`));
    expect(collectCalleeNames(firstMethod(cls))).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('getRootIdentifierReturnsNullForLiteral')
  'skips calls where getRootIdentifier returns null (literal callee)'() {
    const cls = firstClass(sf(`class C { m() { "x"(); (1).toString(); } }`));
    expect(collectCalleeNames(firstMethod(cls))).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('getRootIdentifierThroughPropertyAccess')
  'walks through property access chains'() {
    const call = firstExpression(`a.b.c();`, ts.isCallExpression);
    expect(getRootIdentifier(call.expression)).toBe('a');
  }

  @Verifies<TestBindingsScannerFeature>('getRootIdentifierThroughElementAccess')
  'walks through element access'() {
    const call = firstExpression(`a['b']();`, ts.isCallExpression);
    expect(getRootIdentifier(call.expression)).toBe('a');
  }

  @Verifies<TestBindingsScannerFeature>('getRootIdentifierThroughCallChain')
  'walks through chained calls'() {
    const call = firstExpression(`a()();`, ts.isCallExpression);
    expect(getRootIdentifier(call.expression)).toBe('a');
  }

  @Verifies<TestBindingsScannerFeature>('getRootIdentifierThroughCallChain')
  'walks through new inside expression'() {
    const call = firstExpression(`new A().b();`, ts.isCallExpression);
    expect(getRootIdentifier(call.expression)).toBe('A');
  }

  @Verifies<TestBindingsScannerFeature>('getRootIdentifierThroughParentheses')
  'walks through parenthesized expressions'() {
    const call = firstExpression(`(a).b();`, ts.isCallExpression);
    expect(getRootIdentifier(call.expression)).toBe('a');
  }

  @Verifies<TestBindingsScannerFeature>('getRootIdentifierThroughNonNullAndAs')
  'walks through non-null assertion'() {
    const call = firstExpression(`a!.b();`, ts.isCallExpression);
    expect(getRootIdentifier(call.expression)).toBe('a');
  }

  @Verifies<TestBindingsScannerFeature>('getRootIdentifierThroughNonNullAndAs')
  'walks through `as` expression'() {
    const call = firstExpression(`(a as any).b();`, ts.isCallExpression);
    expect(getRootIdentifier(call.expression)).toBe('a');
  }

  @Verifies<TestBindingsScannerFeature>('getRootIdentifierReturnsNullForLiteral')
  'returns null when root expr is a literal / unsupported kind'() {
    const call = firstExpression(`"x".toUpperCase();`, ts.isCallExpression);
    expect(getRootIdentifier(call.expression)).toBeNull();
  }

  @Verifies<TestBindingsScannerFeature>('getRootIdentifierReturnsNullForLiteral')
  'returns null for number literal root'() {
    const call = firstExpression(`(1).toString();`, ts.isCallExpression);
    expect(getRootIdentifier(call.expression)).toBeNull();
  }
}

@FeatureTest(TestBindingsScannerFeature)
class CollectReferencedNamesTests {
  @Verifies<TestBindingsScannerFeature>('collectReferencedNamesGathersBareIdentifiers')
  'gathers bare identifier references'() {
    const cls = firstClass(sf(`class C { m() { expect(A).toBe(B); arr.map(helper); } }`));
    const names = collectReferencedNames(firstMethod(cls)).sort();
    expect(names).toContain('A');
    expect(names).toContain('B');
    expect(names).toContain('expect');
    expect(names).toContain('arr');
    expect(names).toContain('helper');
  }

  @Verifies<TestBindingsScannerFeature>('collectReferencedNamesSkipsTypeNodes')
  'skips identifiers appearing inside type positions'() {
    const cls = firstClass(sf(`class C { m() { const x: MyType = null as any; } }`));
    const names = collectReferencedNames(firstMethod(cls));
    expect(names).not.toContain('MyType');
  }

  @Verifies<TestBindingsScannerFeature>('collectReferencedNamesSkipsPropertyAccessName')
  'skips .name of property access'() {
    const cls = firstClass(sf(`class C { m() { a.b.c; } }`));
    const names = collectReferencedNames(firstMethod(cls));
    expect(names).toEqual(['a']);
  }

  @Verifies<TestBindingsScannerFeature>('collectReferencedNamesSkipsObjectKey')
  'skips object literal keys (but keeps shorthand values)'() {
    const cls = firstClass(sf(`class C { m() { const o = { foo: bar, qux }; } }`));
    const names = collectReferencedNames(firstMethod(cls)).sort();
    expect(names).toContain('bar');
    expect(names).toContain('qux'); // shorthand: bare identifier
    expect(names).not.toContain('foo');
  }

  @Verifies<TestBindingsScannerFeature>('collectReferencedNamesSkipsDeclarationLhs')
  'skips LHS of declarations (var/param/binding/fn/class)'() {
    const cls = firstClass(sf(`class C { m() {
      const a = 1;
      function inner(param) {}
      const { destructured } = obj;
      const fnExpr = function named() {};
      const cls2 = class Named {};
      class InnerDecl {}
    } }`));
    const names = collectReferencedNames(firstMethod(cls));
    // decl-LHS names don't appear as references
    expect(names).not.toContain('a');
    expect(names).not.toContain('param');
    expect(names).not.toContain('destructured');
    expect(names).not.toContain('fnExpr');
    expect(names).not.toContain('cls2');
    expect(names).not.toContain('InnerDecl');
    expect(names).not.toContain('inner');
    expect(names).not.toContain('named');
    expect(names).not.toContain('Named');
    expect(names).toContain('obj');
  }

  @Verifies<TestBindingsScannerFeature>('collectReferencedNamesSkipsLabels')
  'skips label targets on labeled/break/continue'() {
    const cls = firstClass(sf(`class C { m() {
      outer: for (;;) { break outer; continue outer; }
    } }`));
    const names = collectReferencedNames(firstMethod(cls));
    expect(names).not.toContain('outer');
  }

  @Verifies<TestBindingsScannerFeature>('collectReferencedNamesEmptyWhenNoBody')
  'returns [] when method has no body'() {
    const cls = firstClass(sf(`abstract class C { abstract m(): void; }`));
    expect(collectReferencedNames(firstMethod(cls))).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('collectReferencedNamesSkipsPropertyAccessName')
  'skips accessor / method declaration names in object literals'() {
    const cls = firstClass(sf(`class C { m() {
      const o = { get gName() { return 1; }, set sName(v) {}, mName() {} };
    } }`));
    const names = collectReferencedNames(firstMethod(cls));
    expect(names).not.toContain('gName');
    expect(names).not.toContain('sName');
    expect(names).not.toContain('mName');
  }
}

@FeatureTest(TestBindingsScannerFeature)
class CollectLocalHelpersTests {
  @Verifies<TestBindingsScannerFeature>('collectLocalHelpersTracksFunctionDeclarations')
  'tracks top-level function declarations'() {
    const s = sf(`function foo() { return 1; }`);
    const m = collectLocalHelpers(s);
    expect(m.has('foo')).toBe(true);
  }

  @Verifies<TestBindingsScannerFeature>('collectLocalHelpersTracksArrowFunctionAssignments')
  'tracks const arrow assignments'() {
    const s = sf(`const foo = () => 1;`);
    expect(collectLocalHelpers(s).has('foo')).toBe(true);
  }

  @Verifies<TestBindingsScannerFeature>('collectLocalHelpersTracksFunctionExpressionAssignments')
  'tracks const function-expression assignments'() {
    const s = sf(`const foo = function() { return 1; };`);
    expect(collectLocalHelpers(s).has('foo')).toBe(true);
  }

  @Verifies<TestBindingsScannerFeature>('collectLocalHelpersIgnoresNonFunctionVariables')
  'ignores non-function variable declarations'() {
    const s = sf(`const x = 1; const { a } = obj; const b;`);
    const m = collectLocalHelpers(s);
    expect(m.has('x')).toBe(false);
    expect(m.has('a')).toBe(false);
    expect(m.has('b')).toBe(false);
  }

  @Verifies<TestBindingsScannerFeature>('collectLocalHelpersIgnoresFunctionDeclarationsWithoutBody')
  'ignores function declarations without a body (overload signatures)'() {
    const s = sf(`declare function foo(): void;`);
    expect(collectLocalHelpers(s).has('foo')).toBe(false);
  }
}

@FeatureTest(TestBindingsScannerFeature)
class CollectClassHelpersTests {
  @Verifies<TestBindingsScannerFeature>('collectClassHelpersIncludesNonVerifiesMethods')
  'includes non-@Verifies methods'() {
    const cls = firstClass(sf(`class C { setup() { return 1; } teardown() { return 2; } }`));
    const map = collectClassHelpers(cls);
    expect(map.has('setup')).toBe(true);
    expect(map.has('teardown')).toBe(true);
  }

  @Verifies<TestBindingsScannerFeature>('collectClassHelpersExcludesVerifiesMethods')
  'excludes @Verifies-decorated methods'() {
    const cls = firstClass(sf(`class C {
      @Verifies<F>('ac') m() {}
      helper() {}
    }`));
    const map = collectClassHelpers(cls);
    expect(map.has('m')).toBe(false);
    expect(map.has('helper')).toBe(true);
  }

  @Verifies<TestBindingsScannerFeature>('collectClassHelpersIgnoresAbstractOrComputedNames')
  'ignores abstract methods (no body)'() {
    const cls = firstClass(sf(`abstract class C { abstract foo(): void; helper() {} }`));
    const map = collectClassHelpers(cls);
    expect(map.has('foo')).toBe(false);
    expect(map.has('helper')).toBe(true);
  }

  @Verifies<TestBindingsScannerFeature>('collectClassHelpersIgnoresAbstractOrComputedNames')
  'skips non-method members (props, getters, ctor)'() {
    const cls = firstClass(sf(`class C {
      p = 1;
      constructor() {}
      get g() { return 1; }
      ok() {}
    }`));
    const map = collectClassHelpers(cls);
    expect([...map.keys()]).toEqual(['ok']);
  }
}

@FeatureTest(TestBindingsScannerFeature)
class TransitiveReferencesTests {
  @Verifies<TestBindingsScannerFeature>('transitiveResolvesThroughLocalHelper')
  'follows a local helper fn to pick up its imported symbols'() {
    const s = sf(`
function setup() { createMachine(); }
class C { m() { setup(); } }
`);
    const cls = firstClass(s);
    const helpers = collectLocalHelpers(s);
    const names = collectReferencedNamesTransitive(firstMethod(cls), helpers);
    expect(names).toContain('setup');
    expect(names).toContain('createMachine');
  }

  @Verifies<TestBindingsScannerFeature>('transitiveResolvesThroughThisCallToClassHelper')
  'follows this.helper() into class helpers'() {
    const s = sf(`
class C {
  makeX() { createMachine(); }
  m() { this.makeX(); }
}
`);
    const cls = firstClass(s);
    const classHelpers = collectClassHelpers(cls);
    const method = firstMethod(cls, 'm');
    const names = collectReferencedNamesTransitive(method, new Map(), classHelpers);
    expect(names).toContain('createMachine');
  }

  @Verifies<TestBindingsScannerFeature>('transitiveBreaksCyclesViaVisitedSet')
  'breaks cycles through the visited set (local helpers)'() {
    const s = sf(`
function a() { b(); }
function b() { a(); imported(); }
class C { m() { a(); } }
`);
    const cls = firstClass(s);
    const helpers = collectLocalHelpers(s);
    const names = collectReferencedNamesTransitive(firstMethod(cls), helpers);
    expect(names).toContain('imported');
    expect(names).toContain('a');
    expect(names).toContain('b');
  }

  @Verifies<TestBindingsScannerFeature>('transitiveBreaksCyclesViaVisitedSet')
  'breaks cycles through the visited set (class helpers via this)'() {
    const s = sf(`
class C {
  a() { this.b(); }
  b() { this.a(); imported(); }
  m() { this.a(); }
}`);
    const cls = firstClass(s);
    const classHelpers = collectClassHelpers(cls);
    const names = collectReferencedNamesTransitive(firstMethod(cls, 'm'), new Map(), classHelpers);
    expect(names).toContain('imported');
  }

  @Verifies<TestBindingsScannerFeature>('transitiveResolvesThroughThisCallToClassHelper')
  'tolerates this.X where X is not a known class helper'() {
    const s = sf(`class C { m() { this.unknown(); } }`);
    const cls = firstClass(s);
    // classHelpers map is empty → no body found → no recursion; shouldn't throw
    const names = collectReferencedNamesTransitive(firstMethod(cls), new Map(), new Map());
    expect(names).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('transitiveResolvesThroughLocalHelper')
  'works with default classHelpers parameter'() {
    const s = sf(`class C { m() { foo(); } }`);
    const cls = firstClass(s);
    // only pass two args — exercise the default new Map()
    const names = collectReferencedNamesTransitive(firstMethod(cls), new Map());
    expect(names).toEqual(['foo']);
  }
}

void CollectImportsTests;
void CollectCalleeNamesTests;
void CollectReferencedNamesTests;
void CollectLocalHelpersTests;
void CollectClassHelpersTests;
void TransitiveReferencesTests;
