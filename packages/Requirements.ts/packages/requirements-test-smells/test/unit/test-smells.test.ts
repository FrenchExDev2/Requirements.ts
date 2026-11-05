import { expect } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import { FeatureTest, Verifies, TypeCheckOnly } from '@frenchexdev2/requirements-core';
import { TestSmellsFeature } from '@frenchexdev2/requirements-requirements';
import {
  detectTestSmells,
  scanTestSmells,
  type TestSmell,
  type TestSmellKind,
} from '../../src/test-smells';
import type { FileSystem } from '@frenchexdev2/requirements-core/ports';

const ROOT = '/root';
const FILE = '/root/test/unit/fake.test.ts';

function kindsOf(smells: readonly TestSmell[]): TestSmellKind[] {
  return smells.map(s => s.kind);
}

function findOf(
  smells: readonly TestSmell[],
  kind: TestSmellKind,
  methodName: string,
): TestSmell | undefined {
  return smells.find(s => s.kind === kind && s.methodName === methodName);
}

@FeatureTest(TestSmellsFeature)
class TestSmellsTests {
  @Verifies<TestSmellsFeature>('detectsVerifiesMethodWithEmptyTargets')
  ignoresUnstableMethodNamesWithoutHidingOrdinaryMethods() {
    const source = `@FeatureTest(F) class T {
      @Verifies<F>('ac') [Symbol.iterator]() {}
      @Verifies<F>('ac') 42() {}
      @Verifies<F>('ac') ''() {}
      @Verifies<F>('ac') ordinary() {}
    }`;
    const smells = detectTestSmells(source, FILE, ROOT);
    expect(smells.length).toBeGreaterThan(0);
    expect(new Set(smells.map(smell => smell.methodName))).toEqual(new Set(['ordinary']));
    expect(kindsOf(smells)).toContain('empty-body');
  }
  // ── empty-targets ────────────────────────────────────────────────────────

  @Verifies<TestSmellsFeature>('detectsVerifiesMethodWithEmptyTargets')
  'flags @Verifies method whose body touches no src/ symbol'() {
    const src = `
@FeatureTest(F)
class T {
  @Verifies<F>('ac1')
  m() { expect(1).toBe(1); }
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    const s = findOf(smells, 'empty-targets', 'm');
    expect(s).toBeDefined();
    expect(s!.featureClass).toBe('F');
    expect(s!.ac).toBe('ac1');
  }

  @Verifies<TestSmellsFeature>('ignoresMethodWithAtLeastOneTarget')
  'does not flag empty-targets when body touches a src/ import'() {
    const src = `
import { foo } from '../../src/lib/foo';
@FeatureTest(F)
class T {
  @Verifies<F>('ac1')
  m() { foo(); expect(1).toBe(1); }
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(kindsOf(smells)).not.toContain('empty-targets');
  }

  // ── empty-body ───────────────────────────────────────────────────────────

  @Verifies<TestSmellsFeature>('detectsMethodWithoutBody')
  'flags abstract-like @Verifies method with no body'() {
    // Abstract methods have no body — synthetic class without keyword
    const src = `
@FeatureTest(F)
class T {
  @Verifies<F>('ac1')
  m();
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(findOf(smells, 'empty-body', 'm')).toBeDefined();
  }

  @Verifies<TestSmellsFeature>('detectsMethodWithEmptyBlockBody')
  'flags @Verifies method with empty {} body'() {
    const src = `
@FeatureTest(F)
class T {
  @Verifies<F>('ac1')
  m() {}
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(findOf(smells, 'empty-body', 'm')).toBeDefined();
  }

  @Verifies<TestSmellsFeature>('detectsMethodWithOnlyReturnStatement')
  'flags @Verifies method whose only statement is a bare return'() {
    const src = `
@FeatureTest(F)
class T {
  @Verifies<F>('ac1')
  m() { return; }
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(findOf(smells, 'empty-body', 'm')).toBeDefined();
  }

  @Verifies<TestSmellsFeature>('ignoresMethodWithMeaningfulBody')
  'does not flag empty-body when body has at least one non-trivial statement'() {
    const src = `
@FeatureTest(F)
class T {
  @Verifies<F>('ac1')
  m() { expect(1).toBe(1); }
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(kindsOf(smells)).not.toContain('empty-body');
  }

  @Verifies<TestSmellsFeature>('ignoresMethodWithSingleNonBareReturnStatement')
  'does not flag empty-body when the single statement is a return WITH expression'() {
    // Distinguishes `return;` (bare → empty) from `return 42;` (has expression → not empty).
    // Mutates that turn `isReturnStatement && !s.expression` into `||` would mis-flag this.
    const src = `
@FeatureTest(F)
class T {
  @Verifies<F>('ac1')
  m() { return 42; }
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(kindsOf(smells)).not.toContain('empty-body');
  }

  // ── no-assertion ────────────────────────────────────────────────────────

  @Verifies<TestSmellsFeature>('detectsBodyWithoutAnyAssertion')
  'flags method whose body has statements but no expect/assert call'() {
    const src = `
@FeatureTest(F)
class T {
  @Verifies<F>('ac1')
  m() { const x = 1 + 2; console.log(x); }
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(findOf(smells, 'no-assertion', 'm')).toBeDefined();
  }

  @Verifies<TestSmellsFeature>('acceptsExpectCallAsAssertion')
  'accepts a direct expect() call as an assertion'() {
    const src = `
@FeatureTest(F)
class T {
  @Verifies<F>('ac1')
  m() { expect(1).toBe(1); }
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(kindsOf(smells)).not.toContain('no-assertion');
  }

  @Verifies<TestSmellsFeature>('acceptsAssertCallAsAssertion')
  'accepts a direct assert() call as an assertion'() {
    const src = `
@FeatureTest(F)
class T {
  @Verifies<F>('ac1')
  m() { assert(true); }
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(kindsOf(smells)).not.toContain('no-assertion');
  }

  @Verifies<TestSmellsFeature>('acceptsAssertDotMethodCallAsAssertion')
  'accepts assert.equal() and similar member-style calls'() {
    const src = `
@FeatureTest(F)
class T {
  @Verifies<F>('ac1')
  m() { assert.equal(1, 1); }
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(kindsOf(smells)).not.toContain('no-assertion');
  }

  @Verifies<TestSmellsFeature>('acceptsExpectChainedAssertion')
  'accepts expect(x).toBe(y).toEqual(z) deep chains'() {
    const src = `
@FeatureTest(F)
class T {
  @Verifies<F>('ac1')
  m() { expect(1).toBe(1).toEqual(1); }
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(kindsOf(smells)).not.toContain('no-assertion');
  }

  @Verifies<TestSmellsFeature>('acceptsFastCheckAssertAsAssertion')
  'accepts fast-check fc.assert / fc.check as assertions'() {
    const src = `
@FeatureTest(F)
class T {
  @Verifies<F>('ac1')
  m() { fc.assert(fc.property(fc.integer(), n => n + 0 === n)); }
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(kindsOf(smells)).not.toContain('no-assertion');
  }

  @Verifies<TestSmellsFeature>('followsLocalHelperToFindAssertion')
  'follows a local helper function declaration to find an assertion'() {
    const src = `
function verifyLevel(dir, level) { expect(dir).toBe(level); }
@FeatureTest(F)
class T {
  @Verifies<F>('ac1')
  m() { verifyLevel('a', 'a'); }
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(kindsOf(smells)).not.toContain('no-assertion');
  }

  @Verifies<TestSmellsFeature>('followsClassHelperToFindAssertion')
  'follows a sibling method on the test class to find an assertion'() {
    const src = `
@FeatureTest(F)
class T {
  helper() { expect(1).toBe(1); }
  @Verifies<F>('ac1')
  m() { this.helper(); }
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(kindsOf(smells)).not.toContain('no-assertion');
  }

  @Verifies<TestSmellsFeature>('breaksHelperCyclesViaVisitedSet')
  'does not loop forever when helpers form a cycle'() {
    const src = `
function helperA() { helperB(); }
function helperB() { helperA(); }
@FeatureTest(F)
class T {
  @Verifies<F>('ac1')
  m() { helperA(); }
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    // No assertion anywhere — should still complete and flag no-assertion
    expect(findOf(smells, 'no-assertion', 'm')).toBeDefined();
  }

  // ── scoping ──────────────────────────────────────────────────────────────

  @Verifies<TestSmellsFeature>('skipsClassWithoutFeatureTest')
  'ignores classes not decorated with @FeatureTest'() {
    const src = `
class NotATestClass {
  @Verifies<F>('ac1')
  m() {}
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(smells).toEqual([]);
  }

  @Verifies<TestSmellsFeature>('skipsMethodWithoutVerifies')
  'ignores methods not decorated with @Verifies inside a @FeatureTest class'() {
    const src = `
@FeatureTest(F)
class T {
  helper() {}
  another() { return 1; }
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(smells).toEqual([]);
  }

  @Verifies<TestSmellsFeature>('skipsNonMethodMembersInsideFeatureTestClass')
  'walks past property declarations / constructors inside a @FeatureTest class and short-circuits after assertion found'() {
    // Two purposes:
    //   - property + constructor exercise the "non-method member" continue branch
    //   - body has an assertion FIRST then another call → exercises the early-return inside visit()
    const src = `
@FeatureTest(F)
class T {
  someProperty = 42;
  constructor() {}
  @Verifies<F>('ac1')
  m() { expect(1).toBe(1); helperFn(); }
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(kindsOf(smells)).not.toContain('no-assertion');
    expect(kindsOf(smells)).not.toContain('empty-body');
  }

  @Verifies<TestSmellsFeature>('emitsOneSmellPerVerifiesDecoratorWhenStacked')
  'emits one smell entry per @Verifies decorator when stacked on the same method'() {
    const src = `
@FeatureTest(F)
class T {
  @Verifies<F>('ac1')
  @Verifies<F>('ac2')
  m() {}
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    const emptyBodySmells = smells.filter(s => s.kind === 'empty-body' && s.methodName === 'm');
    const acs = emptyBodySmells.map(s => s.ac).sort();
    expect(acs).toEqual(['ac1', 'ac2']);
  }

  // ── output shape ─────────────────────────────────────────────────────────

  @Verifies<TestSmellsFeature>('emitsSmellWithFileClassMethodFeatureAc')
  'each smell carries file / className / methodName / featureClass / ac (string-literal method name)'() {
    // Stéphane's convention is string-literal method names like 'verifies X works'() — exercise that path
    const src = `
@FeatureTest(MyFeat)
class MyTests {
  @Verifies<MyFeat>('ac1')
  'human-readable name'() {}
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    const s = smells[0]!;
    expect(s.file).toBe(FILE);
    expect(s.className).toBe('MyTests');
    expect(s.methodName).toBe('human-readable name');
    expect(s.featureClass).toBe('MyFeat');
    expect(s.ac).toBe('ac1');
  }

  @Verifies<TestSmellsFeature>('aggregatesSmellsAcrossMultipleFeatureTestClassesInSameFile')
  'aggregates smells from every @FeatureTest class in the same source file'() {
    // Exercises the multi-class loop + `parsed.classes.find` lookup, killing
    // mutants that hold only because fixtures usually carry a single class.
    const src = `
@FeatureTest(F1)
class T1 {
  @Verifies<F1>('ac1')
  m() {}
}
@FeatureTest(F2)
class T2 {
  @Verifies<F2>('ac2')
  n() { expect(1).toBe(1); }
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    const emptyBody = smells.filter(s => s.kind === 'empty-body');
    expect(emptyBody.map(s => s.className).sort()).toEqual(['T1']);
    // T2 has an assertion → no empty-body smell
    expect(emptyBody.find(s => s.className === 'T2')).toBeUndefined();
  }

  @Verifies<TestSmellsFeature>('returnsEmptyArrayForCleanFile')
  'returns [] when no @FeatureTest classes are present'() {
    const src = `
export const x = 1;
function helper() { return 2; }
class Plain { m() {} }`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(smells).toEqual([]);
  }

  // ── @TypeCheckOnly() suppression ─────────────────────────────────────────

  @Verifies<TestSmellsFeature>('suppressesEmptyTargetsWhenMethodCarriesTypeCheckOnly')
  'does not flag empty-targets when method is decorated with @TypeCheckOnly()'() {
    // No src/ import — would normally trigger empty-targets,
    // but @TypeCheckOnly() declares this is intentional.
    const src = `
@FeatureTest(F)
class T {
  @TypeCheckOnly()
  @Verifies<F>('ac1')
  m() { const u: 'a' | 'b' = 'a'; expect(u).toBe('a'); }
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(kindsOf(smells)).not.toContain('empty-targets');
    // And the other smells should stay quiet too on this well-formed test:
    expect(kindsOf(smells)).not.toContain('empty-body');
    expect(kindsOf(smells)).not.toContain('no-assertion');
  }

  @Verifies<TestSmellsFeature>('stillFlagsEmptyBodyOnTypeCheckOnlyMethod')
  '@TypeCheckOnly() does not exempt a method from the empty-body check'() {
    const src = `
@FeatureTest(F)
class T {
  @TypeCheckOnly()
  @Verifies<F>('ac1')
  m() {}
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(findOf(smells, 'empty-body', 'm')).toBeDefined();
    // empty-targets is suppressed
    expect(kindsOf(smells)).not.toContain('empty-targets');
  }

  @Verifies<TestSmellsFeature>('stillFlagsNoAssertionOnTypeCheckOnlyMethod')
  '@TypeCheckOnly() does not exempt a method from the no-assertion check'() {
    const src = `
@FeatureTest(F)
class T {
  @TypeCheckOnly()
  @Verifies<F>('ac1')
  m() { const u: 'a' | 'b' = 'a'; return u; }
}`;
    const smells = detectTestSmells(src, FILE, ROOT);
    expect(findOf(smells, 'no-assertion', 'm')).toBeDefined();
    // empty-targets is suppressed
    expect(kindsOf(smells)).not.toContain('empty-targets');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// scanTestSmells orchestrator (FileSystem port)
// ────────────────────────────────────────────────────────────────────────────

type Entry = { kind: 'dir'; children: Record<string, Entry> } | { kind: 'file'; content: string };

function buildFs(tree: Map<string, Entry>, opts: { unreadableFiles?: ReadonlySet<string> } = {}): FileSystem {
  const norm = (p: string): string => path.normalize(p);
  const look = (p: string): Entry | undefined => tree.get(norm(p));
  const hit = (set: ReadonlySet<string> | undefined, p: string): boolean =>
    !!set && [...set].some(s => norm(s) === norm(p));
  return {
    async readFile(p: string): Promise<string> {
      if (hit(opts.unreadableFiles, p)) throw new Error('EACCES');
      const e = look(p);
      /* v8 ignore next -- defensive: scan only requests files yielded by collectTestFiles */
      if (!e || e.kind !== 'file') throw new Error('ENOENT ' + p);
      return e.content;
    },
    /* v8 ignore start -- unused by scanTestSmells */
    async writeFile(): Promise<void> { throw new Error('not impl'); },
    async exists(): Promise<boolean> { return false; },
    async mkdir(): Promise<void> {},
    /* v8 ignore stop */
    async readdir(p: string): Promise<string[]> {
      const e = look(p);
      /* v8 ignore next -- defensive: scan only walks dirs reported as directories */
      if (!e || e.kind !== 'dir') throw new Error('ENOENT ' + p);
      return Object.keys(e.children);
    },
    async stat(p: string): Promise<{ mtimeMs: number; isDirectory(): boolean; size: number }> {
      const e = look(p);
      /* v8 ignore next -- defensive: scan only stats entries returned by readdir */
      if (!e) throw new Error('ENOENT ' + p);
      return { mtimeMs: 0, size: 0, isDirectory: () => e.kind === 'dir' };
    },
  };
}

function makeTree(root: string, entries: ReadonlyArray<[string, string | 'dir']>): Map<string, Entry> {
  const tree = new Map<string, Entry>();
  tree.set(path.normalize(root), { kind: 'dir', children: {} });
  for (const [rel, content] of entries) {
    const abs = path.normalize(path.join(root, rel));
    tree.set(abs, content === 'dir' ? { kind: 'dir', children: {} } : { kind: 'file', content });
  }
  for (const [full, entry] of tree) {
    const parent = path.dirname(full);
    const existing = tree.get(parent);
    if (existing && existing.kind === 'dir' && parent !== full) {
      existing.children[path.basename(full)] = entry;
    }
  }
  return tree;
}

const ABS_ROOT = path.resolve(os.tmpdir(), 'ts-smells-fake-root');
const TEST_FILE_WITH_SMELL = `
@FeatureTest(F)
class T {
  @Verifies<F>('ac1')
  m() {}
}`;

@FeatureTest(TestSmellsFeature)
class ScanTestSmellsTests {
  @Verifies<TestSmellsFeature>('walksConfiguredTestDirsViaFileSystemPort')
  async 'reads .test.ts files under configured dirs using the FileSystem port'() {
    const tree = makeTree(ABS_ROOT, [
      ['test', 'dir'],
      ['test/a.test.ts', TEST_FILE_WITH_SMELL],
    ]);
    const fs = buildFs(tree);
    const r = await scanTestSmells({ testDirs: ['test'], root: ABS_ROOT, fs });
    expect(r.fileCount).toBe(1);
    expect(r.smells.length).toBeGreaterThan(0);
  }

  @Verifies<TestSmellsFeature>('aggregatesSmellsAcrossMultipleFiles')
  async 'aggregates smells from every test file found'() {
    const tree = makeTree(ABS_ROOT, [
      ['test', 'dir'],
      ['test/a.test.ts', TEST_FILE_WITH_SMELL],
      ['test/b.test.ts', TEST_FILE_WITH_SMELL],
    ]);
    const fs = buildFs(tree);
    const r = await scanTestSmells({ testDirs: ['test'], root: ABS_ROOT, fs });
    expect(r.fileCount).toBe(2);
    const files = new Set(r.smells.map(s => s.file));
    expect(files.size).toBe(2);
  }

  @Verifies<TestSmellsFeature>('resolvesRelativeTestDirsAgainstRoot')
  async 'resolves a relative testDir against the configured root'() {
    const tree = makeTree(ABS_ROOT, [
      ['nested/spec', 'dir'],
      ['nested/spec/x.test.ts', TEST_FILE_WITH_SMELL],
    ]);
    const fs = buildFs(tree);
    const r = await scanTestSmells({ testDirs: ['nested/spec'], root: ABS_ROOT, fs });
    expect(r.fileCount).toBe(1);
  }

  @Verifies<TestSmellsFeature>('acceptsAbsoluteTestDirsAsIs')
  async 'leaves an absolute testDir untouched'() {
    const tree = makeTree(ABS_ROOT, [
      ['test', 'dir'],
      ['test/a.test.ts', TEST_FILE_WITH_SMELL],
    ]);
    const fs = buildFs(tree);
    const r = await scanTestSmells({ testDirs: [path.join(ABS_ROOT, 'test')], root: ABS_ROOT, fs });
    expect(r.fileCount).toBe(1);
  }

  @Verifies<TestSmellsFeature>('propagatesReadFileFailuresAsWarnings')
  async 'records a warning when a test file cannot be read and continues'() {
    const tree = makeTree(ABS_ROOT, [
      ['test', 'dir'],
      ['test/bad.test.ts', TEST_FILE_WITH_SMELL],
      ['test/good.test.ts', TEST_FILE_WITH_SMELL],
    ]);
    const unreadable = new Set([path.join(ABS_ROOT, 'test/bad.test.ts')]);
    const fs = buildFs(tree, { unreadableFiles: unreadable });
    const r = await scanTestSmells({ testDirs: ['test'], root: ABS_ROOT, fs });
    expect(r.fileCount).toBe(2);
    expect(r.warnings.length).toBe(1);
    expect(r.warnings[0]).toContain('bad.test.ts');
    // good.test.ts was still processed despite bad.test.ts being unreadable
    const goodFile = path.normalize(path.join(ABS_ROOT, 'test/good.test.ts'));
    expect(r.smells.some(s => path.normalize(s.file) === goodFile)).toBe(true);
  }

  @Verifies<TestSmellsFeature>('returnsZeroFileCountWhenNoTestDirs')
  async 'returns an empty result when no testDirs are configured'() {
    const tree = makeTree(ABS_ROOT, []);
    const fs = buildFs(tree);
    const r = await scanTestSmells({ testDirs: [], root: ABS_ROOT, fs });
    expect(r.fileCount).toBe(0);
    expect(r.smells).toEqual([]);
    expect(r.warnings).toEqual([]);
  }
}
