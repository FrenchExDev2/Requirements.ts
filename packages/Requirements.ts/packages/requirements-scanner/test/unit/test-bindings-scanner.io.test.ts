import { expect } from 'vitest';
import * as path from 'path';
import * as fsp from 'fs/promises';
import * as os from 'os';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { TestBindingsScannerFeature } from '@frenchexdev2/requirements-requirements';
import { collectTestFiles, scanTestBindings, buildFileExistsPredicate } from '../../src/test-bindings-scanner';
import type { FileSystem } from '@frenchexdev2/requirements-core/ports';

type Entry = { kind: 'dir'; children: Record<string, Entry> } | { kind: 'file'; content: string };

/**
 * In-memory FileSystem keyed by native (possibly-Windows) absolute paths.
 * Normalization: every key is run through `path.normalize` before lookup, so
 * callers can pass either native or posix-flavoured forms.
 */
function buildFs(tree: Map<string, Entry>, opts: {
  unreadableDirs?: ReadonlySet<string>;
  unstatableEntries?: ReadonlySet<string>;
  unreadableFiles?: ReadonlySet<string>;
} = {}): FileSystem {
  const norm = (p: string): string => path.normalize(p);
  const look = (p: string): Entry | undefined => tree.get(norm(p));
  const hit = (set: ReadonlySet<string> | undefined, p: string): boolean =>
    !!set && [...set].some(s => norm(s) === norm(p));
  return {
    async readFile(p: string): Promise<string> {
      if (hit(opts.unreadableFiles, p)) throw new Error('EACCES');
      const e = look(p);
      if (!e || e.kind !== 'file') throw new Error('ENOENT ' + p);
      return e.content;
    },
    async writeFile(): Promise<void> { throw new Error('not impl'); },
    async exists(): Promise<boolean> { return false; },
    async mkdir(): Promise<void> {},
    async readdir(p: string): Promise<string[]> {
      if (hit(opts.unreadableDirs, p)) throw new Error('EACCES');
      const e = look(p);
      if (!e || e.kind !== 'dir') throw new Error('ENOENT ' + p);
      return Object.keys(e.children);
    },
    async stat(p: string): Promise<{ mtimeMs: number; isDirectory(): boolean; size: number }> {
      if (hit(opts.unstatableEntries, p)) throw new Error('ENOENT');
      const e = look(p);
      if (!e) throw new Error('ENOENT ' + p);
      return { mtimeMs: 0, size: 0, isDirectory: () => e.kind === 'dir' };
    },
  };
}

/** Build an in-memory tree from a flat list using native `path.join`. */
function makeTree(root: string, entries: ReadonlyArray<[string, string | 'dir']>): Map<string, Entry> {
  const tree = new Map<string, Entry>();
  tree.set(path.normalize(root), { kind: 'dir', children: {} });
  for (const [rel, content] of entries) {
    const abs = path.normalize(path.join(root, rel));
    if (content === 'dir') {
      tree.set(abs, { kind: 'dir', children: {} });
    } else {
      tree.set(abs, { kind: 'file', content });
    }
  }
  // wire up child maps for each directory
  for (const [full, entry] of tree) {
    const parent = path.dirname(full);
    const existing = tree.get(parent);
    if (existing && existing.kind === 'dir' && parent !== full) {
      existing.children[path.basename(full)] = entry;
    }
  }
  return tree;
}

/** Pick an absolute root that `path.isAbsolute` accepts on the current platform. */
const ABS_ROOT = path.resolve(os.tmpdir(), 'tbs-fake-root');
const ABS_ALT = path.resolve(os.tmpdir(), 'tbs-fake-alt');

// silence unused import warning under strict tsconfig
void fsp;

function normList(files: string[]): string[] {
  return files.map(f => path.normalize(f));
}

@FeatureTest(TestBindingsScannerFeature)
class CollectTestFilesTests {
  @Verifies<TestBindingsScannerFeature>('collectsTestFilesByExtension')
  async 'keeps only .test.ts and .spec.ts'() {
    const tree = makeTree(ABS_ROOT, [
      ['a.test.ts', 'x'],
      ['b.spec.ts', 'x'],
      ['c.ts', 'x'],
      ['d.md', 'x'],
    ]);
    const fs = buildFs(tree);
    const files = normList(await collectTestFiles(fs, ABS_ROOT)).sort();
    expect(files).toEqual([
      path.normalize(path.join(ABS_ROOT, 'a.test.ts')),
      path.normalize(path.join(ABS_ROOT, 'b.spec.ts')),
    ]);
  }

  @Verifies<TestBindingsScannerFeature>('collectsTestFilesRecursively')
  async 'recurses into nested directories'() {
    const tree = makeTree(ABS_ROOT, [
      ['unit', 'dir'],
      ['unit/inner.test.ts', 'x'],
      ['e2e', 'dir'],
      ['e2e/nested', 'dir'],
      ['e2e/nested/deep.spec.ts', 'x'],
    ]);
    const fs = buildFs(tree);
    const files = normList(await collectTestFiles(fs, ABS_ROOT)).sort();
    expect(files).toEqual([
      path.normalize(path.join(ABS_ROOT, 'e2e/nested/deep.spec.ts')),
      path.normalize(path.join(ABS_ROOT, 'unit/inner.test.ts')),
    ]);
  }

  @Verifies<TestBindingsScannerFeature>('collectTestFilesReturnsSorted')
  async 'returns the file list sorted'() {
    const tree = makeTree(ABS_ROOT, [
      ['z.test.ts', 'x'], ['a.test.ts', 'x'], ['m.test.ts', 'x'],
    ]);
    const fs = buildFs(tree);
    const files = normList(await collectTestFiles(fs, ABS_ROOT));
    expect(files).toEqual([
      path.normalize(path.join(ABS_ROOT, 'a.test.ts')),
      path.normalize(path.join(ABS_ROOT, 'm.test.ts')),
      path.normalize(path.join(ABS_ROOT, 'z.test.ts')),
    ]);
  }

  @Verifies<TestBindingsScannerFeature>('collectTestFilesHandlesUnreadableDir')
  async 'returns [] when top-level dir is not readable'() {
    const missing = path.join(ABS_ROOT, 'missing');
    const fs = buildFs(new Map(), { unreadableDirs: new Set([missing]) });
    const files = await collectTestFiles(fs, missing);
    expect(files).toEqual([]);
  }

  @Verifies<TestBindingsScannerFeature>('collectTestFilesSkipsUnstatableEntries')
  async 'skips entries whose stat() throws'() {
    const tree = makeTree(ABS_ROOT, [
      ['good.test.ts', 'x'],
      ['broken.test.ts', 'x'],
    ]);
    const broken = path.join(ABS_ROOT, 'broken.test.ts');
    const fs = buildFs(tree, { unstatableEntries: new Set([broken]) });
    const files = normList(await collectTestFiles(fs, ABS_ROOT));
    expect(files).toEqual([path.normalize(path.join(ABS_ROOT, 'good.test.ts'))]);
  }
}

/** Test file under <root>/test/a.test.ts importing ../src/lib/foo → <root>/src/lib/foo. */
const TEST_SRC = `
import { foo } from '../src/lib/foo';
@FeatureTest(F)
class T {
  @Verifies<F>('ac')
  m() { foo(); }
}
`;

@FeatureTest(TestBindingsScannerFeature)
class ScanTestBindingsTests {
  @Verifies<TestBindingsScannerFeature>('scanResolvesAbsoluteAndRelativeTestDirs')
  async 'resolves relative testDirs against the root'() {
    const tree = makeTree(ABS_ROOT, [
      ['test', 'dir'],
      ['test/a.test.ts', TEST_SRC],
    ]);
    const fs = buildFs(tree);
    const r = await scanTestBindings({
      testDirs: ['test'], // relative
      root: ABS_ROOT,
      classToId: new Map([['F', 'F-ID']]),
      fs,
    });
    expect(r.fileCount).toBe(1);
    expect(r.manifest['F-ID']!['ac']).toEqual([{ file: 'src/lib/foo.ts', symbol: 'foo' }]);
    expect(r.methodCount).toBe(1);
  }

  @Verifies<TestBindingsScannerFeature>('scanResolvesAbsoluteAndRelativeTestDirs')
  async 'resolves absolute testDirs as-is'() {
    const tree = makeTree(ABS_ALT, [
      ['a.test.ts', TEST_SRC],
    ]);
    // Need ABS_ROOT as a registered dir too (for relative-to-root math on imports)
    const rootTree = makeTree(ABS_ROOT, []);
    // merge both
    for (const [k, v] of rootTree) tree.set(k, v);
    const fs = buildFs(tree);
    const r = await scanTestBindings({
      testDirs: [ABS_ALT], // absolute
      root: ABS_ROOT,
      classToId: new Map(),
      fs,
    });
    expect(r.fileCount).toBe(1);
  }

  @Verifies<TestBindingsScannerFeature>('scanSkipsUnreadableFiles')
  async 'skips files whose readFile throws'() {
    const tree = makeTree(ABS_ROOT, [
      ['test', 'dir'],
      ['test/good.test.ts', TEST_SRC],
      ['test/bad.test.ts', TEST_SRC],
    ]);
    const bad = path.join(ABS_ROOT, 'test', 'bad.test.ts');
    const fs = buildFs(tree, { unreadableFiles: new Set([bad]) });
    const r = await scanTestBindings({
      testDirs: ['test'],
      root: ABS_ROOT,
      classToId: new Map(),
      fs,
    });
    expect(r.fileCount).toBe(2);    // files discovered = 2
    expect(r.methodCount).toBe(1);  // only good parsed
  }

  @Verifies<TestBindingsScannerFeature>('scanReturnsAggregatedManifestStats')
  async 'returns manifest + warnings + fileCount + methodCount + emptyMethods'() {
    const EMPTY_SRC = `
@FeatureTest(F)
class T {
  @Verifies<F>('ac')
  m() { /* no imported callee */ }
}`;
    const tree = makeTree(ABS_ROOT, [
      ['test', 'dir'],
      ['test/empty.test.ts', EMPTY_SRC],
    ]);
    const fs = buildFs(tree);
    const r = await scanTestBindings({
      testDirs: ['test'],
      root: ABS_ROOT,
      classToId: new Map(),
      fs,
    });
    expect(r.manifest).toEqual({ F: {} });
    expect(r.emptyMethods).toHaveLength(1);
    expect(r.warnings).toEqual([]);
    expect(r.fileCount).toBe(1);
    expect(r.methodCount).toBe(1);
  }

  @Verifies<TestBindingsScannerFeature>('scanRespectsCustomIncludeScopes')
  async 'honors custom includeScopes'() {
    const CUSTOM = `
import { foo } from '../lib/foo';
@FeatureTest(F)
class T {
  @Verifies<F>('ac')
  m() { foo(); }
}
`;
    const tree = makeTree(ABS_ROOT, [
      ['test', 'dir'],
      ['test/a.test.ts', CUSTOM],
    ]);
    const fs = buildFs(tree);
    // Without custom scope: src/ ≠ lib/ so target is dropped
    const r1 = await scanTestBindings({
      testDirs: ['test'], root: ABS_ROOT, classToId: new Map(), fs,
    });
    expect(r1.emptyMethods).toHaveLength(1);
    // With custom scope including lib/: target is kept
    const r2 = await scanTestBindings({
      testDirs: ['test'], root: ABS_ROOT, classToId: new Map(), fs,
      includeScopes: ['lib/'],
    });
    expect(r2.emptyMethods).toHaveLength(0);
    expect(r2.manifest['F']!['ac']).toEqual([{ file: 'lib/foo.ts', symbol: 'foo' }]);
  }
}

@FeatureTest(TestBindingsScannerFeature)
class BuildFileExistsPredicateTests {
  @Verifies<TestBindingsScannerFeature>('buildsFileExistsPredicateOverConfiguredScopes')
  async 'returns true for files discovered under every configured scope'() {
    const tree = makeTree(ABS_ROOT, [
      ['src', 'dir'],
      ['src/foo.ts', 'x'],
      ['src/scaffolders', 'dir'],
      ['src/scaffolders/index.ts', 'x'],
      ['src/scaffolders/unit.ts', 'x'],
      ['scripts', 'dir'],
      ['scripts/build.ts', 'x'],
      // out of any scope — must NOT be in the set
      ['test', 'dir'],
      ['test/a.test.ts', 'x'],
    ]);
    const fs = buildFs(tree);
    const fileExists = await buildFileExistsPredicate(fs, ABS_ROOT, ['src/', 'scripts/']);
    expect(fileExists('src/foo.ts')).toBe(true);
    expect(fileExists('src/scaffolders/index.ts')).toBe(true);
    expect(fileExists('src/scaffolders/unit.ts')).toBe(true);
    expect(fileExists('scripts/build.ts')).toBe(true);
    expect(fileExists('test/a.test.ts')).toBe(false); // out of scope
  }

  @Verifies<TestBindingsScannerFeature>('fileExistsPredicateReturnsFalseForUnknownPath')
  async 'returns false for paths that do not exist (the phantom-barrel case)'() {
    // Mirror of the real scaffolders bug: import path `'../../src/scaffolders'`
    // would resolveTarget to `src/scaffolders.ts`, which does NOT exist on disk;
    // only `src/scaffolders/index.ts` does. The predicate must report the
    // phantom as missing so parseTestFile can fall back to the barrel.
    const tree = makeTree(ABS_ROOT, [
      ['src', 'dir'],
      ['src/scaffolders', 'dir'],
      ['src/scaffolders/index.ts', 'x'],
    ]);
    const fs = buildFs(tree);
    const fileExists = await buildFileExistsPredicate(fs, ABS_ROOT, ['src/']);
    expect(fileExists('src/scaffolders.ts')).toBe(false); // phantom
    expect(fileExists('src/scaffolders/index.ts')).toBe(true);
    expect(fileExists('src/never-existed.ts')).toBe(false);
  }
}

void CollectTestFilesTests;
void ScanTestBindingsTests;
void BuildFileExistsPredicateTests;
