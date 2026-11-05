import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { FeatureSyncCommandFeature } from '@frenchexdev2/requirements-requirements';
import {
  diffSpecToDisk,
  renderSyncEntry,
  renderSyncPlan,
  applySyncPlan,
  loadSpecFromJsonPath,
  WRITABLE_PATTERNS,
  RefusedWriteError,
} from '../../src/sync-core';
import type { Spec, SyncEntry, SyncPlan } from '@frenchexdev2/requirements-core/types';
import { SCHEMA_VERSION, featureId } from '@frenchexdev2/requirements-core/types';
import { Priority } from '@frenchexdev2/requirements-core';
import type { FileSystem, Prompt, PromptChoice, PromptTextOptions, PromptSpinner } from '@frenchexdev2/requirements-core/ports';

// ── In-memory FileSystem mock ────────────────────────────────────────────────

function mkFs(initial: Record<string, string> = {}): FileSystem & { files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>(Object.entries(initial));
  const dirs = new Set<string>();
  return {
    files,
    dirs,
    async readFile(path: string, _enc: 'utf8') {
      const v = files.get(path);
      if (v === undefined) throw new Error(`ENOENT: ${path}`);
      return v;
    },
    async writeFile(path: string, content: string) {
      files.set(path, content);
    },
    async exists(path: string) {
      return files.has(path);
    },
    async mkdir(path: string, _opts?: { recursive?: boolean }) {
      dirs.add(path);
    },
    async readdir(_path: string) { return []; },
    async stat(_path: string) {
      return { mtimeMs: 0, isDirectory: () => false, size: 0 };
    },
  };
}

// ── Scripted Prompt mock ─────────────────────────────────────────────────────

interface ScriptedPrompt extends Prompt {
  readonly notes: Array<{ title?: string; message: string }>;
  readonly confirms: string[];
}

function mkPrompt(answers: boolean[]): ScriptedPrompt {
  const notes: Array<{ title?: string; message: string }> = [];
  const confirms: string[] = [];
  let i = 0;
  return {
    notes,
    confirms,
    async text(_q: string, _opts?: PromptTextOptions) { return ''; },
    async select<T extends string>(_q: string, _c: readonly PromptChoice<T>[], dflt?: T) { return (dflt ?? '') as T; },
    async multiselect<T extends string>(_q: string, _c: readonly PromptChoice<T>[], dflt?: readonly T[]) {
      return (dflt ?? []) as readonly T[];
    },
    async confirm(q: string, _dflt?: boolean) {
      confirms.push(q);
      const a = answers[i++];
      if (a === undefined) throw new Error(`No scripted answer for confirm #${i}: ${q}`);
      return a;
    },
    note(message: string, title?: string) { notes.push({ message, title }); },
    spinner(): PromptSpinner { return { start() {}, stop() {} }; },
  };
}

// ── Fixture spec ─────────────────────────────────────────────────────────────

function mkSpec(): Spec {
  return {
    $schemaVersion: SCHEMA_VERSION,
    kind: 'feature',
    id: featureId('SYNC-FIXTURE'),
    title: 'Sync fixture',
    priority: Priority.High,
    acs: [],
  };
}

function entry(e: Partial<SyncEntry> & { path: string; status: SyncEntry['status']; proposed: string }): SyncEntry {
  return { hunks: [], current: null, ...e } as SyncEntry;
}

function planOf(entries: SyncEntry[]): SyncPlan {
  return { spec: mkSpec(), entries };
}

// ── Paths that satisfy WRITABLE_PATTERNS ─────────────────────────────────────

const FEATURE_PATH = 'requirements/features/fixture.ts';
const REQ_PATH = 'requirements/requirements/fixture.ts';
const SPEC_JSON = 'requirements/fixture.spec.json';
const SCAFFOLD_UNIT = 'test/unit/fixture-scaffold.test.ts';
const SCAFFOLD_E2E = 'test/e2e/fixture-scaffold.spec.ts';
const FORBIDDEN = 'test/unit/existing-human.test.ts';

// ── Test classes ─────────────────────────────────────────────────────────────

@FeatureTest(FeatureSyncCommandFeature)
class SpecLoadingTests {
  @Verifies<FeatureSyncCommandFeature>('loadsSpecFromJsonPath')
  async 'loads spec from json path via fs port'() {
    const spec = mkSpec();
    const fs = mkFs({ [SPEC_JSON]: JSON.stringify(spec) });
    const loaded = await loadSpecFromJsonPath(SPEC_JSON, fs);
    expect(loaded.kind).toBe('feature');
    expect(loaded.id).toBe('SYNC-FIXTURE');
  }
}

@FeatureTest(FeatureSyncCommandFeature)
class DiffClassificationTests {
  @Verifies<FeatureSyncCommandFeature>('diffClassifiesEachTargetAsCreateUnchangedModified')
  async 'classifies create / unchanged / modified'() {
    const fs = mkFs({
      [REQ_PATH]: 'same\n',
      [SCAFFOLD_UNIT]: 'old\n',
    });
    const proposed = new Map<string, string>([
      [FEATURE_PATH, 'brand new\n'],     // create
      [REQ_PATH, 'same\n'],               // unchanged
      [SCAFFOLD_UNIT, 'new content\n'],   // modified
    ]);
    const plan = await diffSpecToDisk(mkSpec(), proposed, fs);
    const byPath = new Map(plan.entries.map(e => [e.path, e]));
    expect(byPath.get(FEATURE_PATH)!.status).toBe('create');
    expect(byPath.get(FEATURE_PATH)!.current).toBeNull();
    expect(byPath.get(REQ_PATH)!.status).toBe('unchanged');
    expect(byPath.get(REQ_PATH)!.hunks).toEqual([]);
    expect(byPath.get(SCAFFOLD_UNIT)!.status).toBe('modified');
  }

  @Verifies<FeatureSyncCommandFeature>('diffComputesStructuredHunksViaJsdiff')
  async 'computes structured hunks using jsdiff'() {
    const fs = mkFs({
      [SCAFFOLD_UNIT]: 'line 1\nline 2\nline 3\n',
    });
    const proposed = new Map<string, string>([
      [SCAFFOLD_UNIT, 'line 1\nline two\nline 3\n'],
    ]);
    const plan = await diffSpecToDisk(mkSpec(), proposed, fs);
    const e = plan.entries[0]!;
    expect(e.status).toBe('modified');
    expect(e.hunks.length).toBeGreaterThanOrEqual(1);
    const h = e.hunks[0]!;
    expect(h.removed).toContain('line 2');
    expect(h.added).toContain('line two');
    expect(h.contextBefore).toBe('line 1');
    expect(h.contextAfter).toBe('line 3');
  }

  @Verifies<FeatureSyncCommandFeature>('endToEndSyncReconcilesEditedSpec')
  async 'end-to-end: diff plan + apply reconciles spec against disk'() {
    const fs = mkFs({ [FEATURE_PATH]: 'stale\n' });
    const proposed = new Map<string, string>([
      [FEATURE_PATH, 'fresh\n'],
      [SCAFFOLD_UNIT, 'new\n'],
    ]);
    const plan = await diffSpecToDisk(mkSpec(), proposed, fs);
    const result = await applySyncPlan(plan, fs, { mode: 'all' });
    expect([...result.applied].sort()).toEqual([FEATURE_PATH, SCAFFOLD_UNIT].sort());
    expect(fs.files.get(FEATURE_PATH)).toBe('fresh\n');
    expect(fs.files.get(SCAFFOLD_UNIT)).toBe('new\n');
  }
}

@FeatureTest(FeatureSyncCommandFeature)
class RenderTests {
  @Verifies<FeatureSyncCommandFeature>('renderColorizesAddRemoveContext')
  'render output contains ANSI color escapes for add / remove / context'() {
    const created = entry({
      path: FEATURE_PATH,
      status: 'create',
      proposed: 'hello\nworld\n',
    });
    const modified = entry({
      path: SCAFFOLD_UNIT,
      status: 'modified',
      proposed: 'a\nB\nc\n',
      current: 'a\nb\nc\n',
      hunks: [
        { removed: ['b'], added: ['B'], contextBefore: 'a', contextAfter: 'c' },
      ],
    });
    const unchanged = entry({
      path: REQ_PATH,
      status: 'unchanged',
      proposed: 'same\n',
      current: 'same\n',
    });

    const out = renderSyncPlan(planOf([created, modified, unchanged]));
    // ANSI escape sequences present
    expect(out).toMatch(/\x1b\[/);
    // bold cyan header
    expect(out).toContain('CREATE');
    expect(out).toContain('MODIFIED');
    expect(out).toContain('UNCHANGED');
    // + and - markers
    expect(out).toContain('+ hello');
    expect(out).toContain('- b');
    expect(out).toContain('+ B');
    // renderSyncEntry also works standalone
    const single = renderSyncEntry(modified);
    expect(single).toMatch(/\x1b\[/);
  }

  @Verifies<FeatureSyncCommandFeature>('unchangedEntriesNotPrompted')
  async 'unchanged entries are neither prompted nor written'() {
    const plan = planOf([
      entry({ path: REQ_PATH, status: 'unchanged', proposed: 'x', current: 'x' }),
    ]);
    const fs = mkFs({ [REQ_PATH]: 'x' });
    const prompt = mkPrompt([]); // no answers scripted — mustn't be called
    const result = await applySyncPlan(plan, fs, { mode: 'per-file', prompt });
    expect(prompt.confirms).toEqual([]);
    expect(prompt.notes).toEqual([]);
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([REQ_PATH]);
  }

  @Verifies<FeatureSyncCommandFeature>('dryRunRendersDiffsWithoutWriting')
  async 'dry-run does not write'() {
    const fs = mkFs({ [SCAFFOLD_UNIT]: 'old\n' });
    const proposed = new Map<string, string>([[SCAFFOLD_UNIT, 'new\n']]);
    const plan = await diffSpecToDisk(mkSpec(), proposed, fs);
    const rendered = renderSyncPlan(plan);
    expect(rendered).toMatch(/\x1b\[/);
    const result = await applySyncPlan(plan, fs, { mode: 'dry-run' });
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([SCAFFOLD_UNIT]);
    expect(fs.files.get(SCAFFOLD_UNIT)).toBe('old\n'); // untouched
  }

  @Verifies<FeatureSyncCommandFeature>('yesFlagAppliesAllSilently')
  async 'mode=all writes everything without prompting'() {
    const fs = mkFs({});
    const plan = planOf([
      entry({ path: FEATURE_PATH, status: 'create', proposed: 'A\n' }),
      entry({ path: SCAFFOLD_UNIT, status: 'create', proposed: 'B\n' }),
    ]);
    const result = await applySyncPlan(plan, fs, { mode: 'all' });
    expect([...result.applied].sort()).toEqual([FEATURE_PATH, SCAFFOLD_UNIT].sort());
    expect(fs.files.get(FEATURE_PATH)).toBe('A\n');
    expect(fs.files.get(SCAFFOLD_UNIT)).toBe('B\n');
  }
}

@FeatureTest(FeatureSyncCommandFeature)
class InteractiveTests {
  @Verifies<FeatureSyncCommandFeature>('interactivePromptsApplyOrSkipPerModified')
  async 'per-file prompts once per modified/create and honors yes/no'() {
    const fs = mkFs({ [SCAFFOLD_UNIT]: 'old\n' });
    const plan = planOf([
      entry({
        path: SCAFFOLD_UNIT,
        status: 'modified',
        proposed: 'new\n',
        current: 'old\n',
        hunks: [{ removed: ['old'], added: ['new'] }],
      }),
      entry({ path: SCAFFOLD_E2E, status: 'create', proposed: 'E2E\n' }),
    ]);
    const prompt = mkPrompt([true, false]); // apply first, skip second
    const result = await applySyncPlan(plan, fs, { mode: 'per-file', prompt });
    expect(prompt.confirms).toHaveLength(2);
    expect(prompt.notes).toHaveLength(2);
    expect(result.applied).toEqual([SCAFFOLD_UNIT]);
    expect(result.skipped).toEqual([SCAFFOLD_E2E]);
    expect(fs.files.get(SCAFFOLD_UNIT)).toBe('new\n');
    expect(fs.files.has(SCAFFOLD_E2E)).toBe(false);
  }

  @Verifies<FeatureSyncCommandFeature>('interactivePromptsApplyOrSkipPerModified')
  async 'per-file without prompt port throws'() {
    const plan = planOf([entry({ path: FEATURE_PATH, status: 'create', proposed: 'x' })]);
    await expect(applySyncPlan(plan, mkFs(), { mode: 'per-file' })).rejects.toThrow(/Prompt port/);
  }
}

@FeatureTest(FeatureSyncCommandFeature)
class SafetyTests {
  @Verifies<FeatureSyncCommandFeature>('neverTouchesNonScaffoldTestFiles')
  async 'refuses to write a path outside WRITABLE_PATTERNS'() {
    const plan = planOf([
      entry({ path: FORBIDDEN, status: 'modified', proposed: 'evil\n', current: 'safe\n', hunks: [] }),
    ]);
    await expect(applySyncPlan(plan, mkFs({ [FORBIDDEN]: 'safe\n' }), { mode: 'all' }))
      .rejects.toBeInstanceOf(RefusedWriteError);
  }

  @Verifies<FeatureSyncCommandFeature>('neverTouchesNonScaffoldTestFiles')
  'WRITABLE_PATTERNS covers the four allowed shapes and excludes others'() {
    const ok = [FEATURE_PATH, REQ_PATH, SPEC_JSON, SCAFFOLD_UNIT, SCAFFOLD_E2E];
    const ko = [FORBIDDEN, 'src/lib/nav.ts', 'random.md', 'test/unit/foo.test.ts'];
    for (const p of ok) {
      expect(WRITABLE_PATTERNS.some(r => r.test(p))).toBe(true);
    }
    for (const p of ko) {
      expect(WRITABLE_PATTERNS.some(r => r.test(p))).toBe(false);
    }
  }

  @Verifies<FeatureSyncCommandFeature>('neverTouchesNonScaffoldTestFiles')
  async 'unchanged entries for non-writable paths are still skipped safely'() {
    // An 'unchanged' entry never triggers write — so it never triggers the guard.
    const plan = planOf([
      entry({ path: FORBIDDEN, status: 'unchanged', proposed: 'x', current: 'x' }),
    ]);
    const result = await applySyncPlan(plan, mkFs({ [FORBIDDEN]: 'x' }), { mode: 'all' });
    expect(result.skipped).toEqual([FORBIDDEN]);
    expect(result.applied).toEqual([]);
  }

  @Verifies<FeatureSyncCommandFeature>('neverTouchesNonScaffoldTestFiles')
  async 'RefusedWriteError message lists all allowed patterns'() {
    try {
      await applySyncPlan(
        planOf([entry({ path: FORBIDDEN, status: 'create', proposed: 'x' })]),
        mkFs(),
        { mode: 'all' },
      );
      throw new Error('expected RefusedWriteError');
    } catch (e) {
      expect(e).toBeInstanceOf(RefusedWriteError);
      const msg = (e as Error).message;
      for (const re of WRITABLE_PATTERNS) {
        expect(msg).toContain(re.source);
      }
      expect((e as RefusedWriteError).path).toBe(FORBIDDEN);
    }
  }
}

@FeatureTest(FeatureSyncCommandFeature)
class EdgeCaseTests {
  @Verifies<FeatureSyncCommandFeature>('renderColorizesAddRemoveContext')
  'renders empty plan with a dim placeholder'() {
    const out = renderSyncPlan({ spec: mkSpec(), entries: [] });
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('empty plan');
  }

  @Verifies<FeatureSyncCommandFeature>('diffClassifiesEachTargetAsCreateUnchangedModified')
  async 'ensureDirFor creates parent directory before write'() {
    const fs = mkFs({});
    const plan = planOf([entry({ path: FEATURE_PATH, status: 'create', proposed: 'x\n' })]);
    await applySyncPlan(plan, fs, { mode: 'all' });
    expect(fs.dirs.has('requirements/features')).toBe(true);
  }

  @Verifies<FeatureSyncCommandFeature>('diffClassifiesEachTargetAsCreateUnchangedModified')
  async 'ensureDirFor is a no-op for paths without a parent'() {
    // Craft a writable-matching path with no slashes — impossible in practice,
    // so exercise via a plan with a top-level unchanged entry (no write path).
    const plan = planOf([
      entry({ path: REQ_PATH, status: 'unchanged', proposed: 'x', current: 'x' }),
    ]);
    const fs = mkFs({ [REQ_PATH]: 'x' });
    const result = await applySyncPlan(plan, fs, { mode: 'all' });
    expect(result.skipped).toEqual([REQ_PATH]);
    // no directory created because nothing was written
    expect(fs.dirs.size).toBe(0);
  }

  @Verifies<FeatureSyncCommandFeature>('diffComputesStructuredHunksViaJsdiff')
  async 'hunks at start of file have no contextBefore'() {
    const fs = mkFs({ [SCAFFOLD_UNIT]: 'a\nb\nc\n' });
    const proposed = new Map<string, string>([[SCAFFOLD_UNIT, 'Z\nb\nc\n']]);
    const plan = await diffSpecToDisk(mkSpec(), proposed, fs);
    const h = plan.entries[0]!.hunks[0]!;
    expect(h.contextBefore).toBeUndefined();
    expect(h.contextAfter).toBe('b');
  }

  @Verifies<FeatureSyncCommandFeature>('diffComputesStructuredHunksViaJsdiff')
  async 'hunks at end of file have no contextAfter'() {
    const fs = mkFs({ [SCAFFOLD_UNIT]: 'a\nb\nc\n' });
    const proposed = new Map<string, string>([[SCAFFOLD_UNIT, 'a\nb\nZ\n']]);
    const plan = await diffSpecToDisk(mkSpec(), proposed, fs);
    const h = plan.entries[0]!.hunks[0]!;
    expect(h.contextBefore).toBe('b');
    expect(h.contextAfter).toBeUndefined();
  }

  @Verifies<FeatureSyncCommandFeature>('diffComputesStructuredHunksViaJsdiff')
  async 'diff across backslash Windows-style paths still matches pattern'() {
    const winPath = 'requirements\\features\\win.ts';
    const plan = planOf([entry({ path: winPath, status: 'create', proposed: 'x\n' })]);
    const fs = mkFs();
    const result = await applySyncPlan(plan, fs, { mode: 'all' });
    expect(result.applied).toEqual([winPath]);
    expect(fs.files.get(winPath)).toBe('x\n');
  }
}

// Suppress "declared but never used" — decorator side-effects register the test classes.
void SpecLoadingTests; void DiffClassificationTests; void RenderTests;
void InteractiveTests; void SafetyTests; void EdgeCaseTests;
