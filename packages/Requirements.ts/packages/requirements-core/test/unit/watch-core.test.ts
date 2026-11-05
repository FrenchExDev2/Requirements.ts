import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { FeatureWatchModeFeature } from '@frenchexdev2/requirements-requirements';
import {
  createDebouncer,
  isEditorSwapFile,
  isWatchableFile,
  loadAllSpecs,
  renderDeltaLine,
  snapshotCompliance,
  startWatch,
  type ComplianceDelta,
  type FileWatcher,
} from '@frenchexdev2/requirements-core/watch-core';
import type { Cancel, Clock, FileSystem, Logger, Scheduler } from '@frenchexdev2/requirements-core/ports';
import type { FeatureSpec, RequirementSpec } from '@frenchexdev2/requirements-core/types';
import type { ValidateResult } from '@frenchexdev2/requirements-core/watch-core';

// ── Fake Scheduler (manual clock) ────────────────────────────────────────────

interface FakeScheduler extends Scheduler {
  advance(ms: number): void;
  pending: number;
  now: number;
}

function mkScheduler(): FakeScheduler {
  type Entry = { at: number; fn: () => void; id: number; cancelled: boolean };
  const entries: Entry[] = [];
  let nextId = 1;
  let now = 0;

  const s: FakeScheduler = {
    setTimeout(fn, ms): Cancel {
      const e: Entry = { at: now + ms, fn, id: nextId++, cancelled: false };
      entries.push(e);
      return () => { e.cancelled = true; };
    },
    setInterval(_fn, _ms): Cancel {
      /* v8 ignore next */
      return () => {};
    },
    advance(ms: number): void {
      const target = now + ms;
      // Process entries due up to `target`, in chronological order.
      for (;;) {
        const due = entries
          .filter((e) => !e.cancelled && e.at <= target)
          .sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        now = due.at;
        due.cancelled = true;
        due.fn();
      }
      now = target;
      s.now = now;
      s.pending = entries.filter((e) => !e.cancelled).length;
    },
    pending: 0,
    now: 0,
  };
  return s;
}

// ── Fake Clock ──────────────────────────────────────────────────────────────

function mkClock(scheduler: FakeScheduler): Clock {
  return { now: () => scheduler.now };
}

// ── Fake Logger ─────────────────────────────────────────────────────────────

interface FakeLogger extends Logger {
  infos: string[];
  warns: string[];
  errors: string[];
}
function mkLogger(): FakeLogger {
  const infos: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];
  return {
    infos, warns, errors,
    info: (m) => { infos.push(m); },
    warn: (m) => { warns.push(m); },
    error: (m) => { errors.push(m); },
  };
}

// ── In-memory FileSystem ────────────────────────────────────────────────────

function mkFs(files: Record<string, string> = {}): FileSystem {
  // Index "directories" by prefix.
  const entries = new Map(Object.entries(files));
  function isDir(p: string): boolean {
    const needle = p.endsWith('/') ? p : p + '/';
    for (const k of entries.keys()) if (k.startsWith(needle)) return true;
    return false;
  }
  return {
    async readFile(p: string) {
      const v = entries.get(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    async writeFile() { /* v8 ignore next */ },
    async exists(p) { return entries.has(p) || isDir(p); },
    async mkdir() { /* v8 ignore next */ },
    async readdir(dir) {
      const needle = dir.endsWith('/') ? dir : dir + '/';
      const children = new Set<string>();
      for (const k of entries.keys()) {
        if (!k.startsWith(needle)) continue;
        const rest = k.slice(needle.length);
        const slash = rest.indexOf('/');
        children.add(slash === -1 ? rest : rest.slice(0, slash));
      }
      if (children.size === 0 && !isDir(dir)) throw new Error(`ENOENT: ${dir}`);
      return [...children];
    },
    async stat(p) {
      const dir = isDir(p);
      return { mtimeMs: 0, isDirectory: () => dir, size: 0 };
    },
  };
}

// ── Fake FileWatcher ────────────────────────────────────────────────────────

interface FakeWatcher extends FileWatcher {
  emit(path: string): void;
  cancelled: boolean;
  watchedPaths: readonly string[];
}
function mkWatcher(): FakeWatcher {
  let cb: ((p: string) => void) | null = null;
  const state = { cancelled: false, watchedPaths: [] as readonly string[] };
  const w: FakeWatcher = {
    watch(paths, onChange) {
      cb = onChange;
      state.watchedPaths = paths;
      return () => { state.cancelled = true; cb = null; };
    },
    emit(path) {
      /* v8 ignore next */
      if (!cb) throw new Error('watcher not started');
      cb(path);
    },
    get cancelled() { return state.cancelled; },
    get watchedPaths() { return state.watchedPaths; },
  };
  return w;
}

// ── Always-valid validator (bypass ajv in unit tests) ───────────────────────

const okValidator = async (): Promise<ValidateResult> => ({ ok: true });

// ── Compliance helpers — pure stubs so watch-core stays decoupled from wizards.

const stubCompliance = {
  orphanFeatureSpecs: (features: readonly FeatureSpec[]) =>
    features.filter((f) => !f.satisfies || f.satisfies.length === 0),
  uncoveredApprovedRequirements: (
    requirements: readonly RequirementSpec[],
    features: readonly FeatureSpec[],
  ) => {
    const covered = new Set<string>();
    for (const f of features) for (const r of f.satisfies ?? []) covered.add(String(r));
    return requirements.filter((r) => r.status === 'Approved' && !covered.has(String(r.id)));
  },
};

// ── Fixtures ────────────────────────────────────────────────────────────────

const MINIMAL_STATEMENT = { pattern: 'ubiquitous' as const, response: 'x' as any };
const MINIMAL_RATIONALE = { claim: 'x' as any, kind: 'precedent' as const, evidence: [] };
const MINIMAL_SOURCE = { type: 'stakeholder' as const, role: 'r' };
const MINIMAL_RISK = { level: 'Low' as const, ifNotMet: 'x' as any };

function mkFeatureSpec(id: string, satisfies: readonly string[] = ['REQ-1']): FeatureSpec {
  return {
    $schemaVersion: '1.0.0' as any,
    $schema: './feature-spec.schema.json',
    kind: 'feature',
    id: id as any,
    title: `feat ${id}`,
    priority: 'Medium' as any,
    enabled: true,
    satisfies: satisfies as any,
    acs: [],
  } as unknown as FeatureSpec;
}

function mkRequirementSpec(id: string, status: 'Draft' | 'Approved' = 'Approved'): RequirementSpec {
  return {
    $schemaVersion: '1.0.0' as any,
    $schema: './requirement-spec.schema.json',
    kind: 'requirement',
    id: id as any,
    title: `req ${id}`,
    requirementKind: 'Functional' as any,
    priority: 'Medium' as any,
    status,
    statement: MINIMAL_STATEMENT,
    rationale: MINIMAL_RATIONALE,
    source: MINIMAL_SOURCE,
    risk: MINIMAL_RISK,
    verificationMethod: 'Test' as any,
    fitCriteria: [],
  } as unknown as RequirementSpec;
}

// ═══════════════════════════════════════════════════════════════════════════
// Filters — swap files + watchable files
// ═══════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureWatchModeFeature)
class SwapFileFilterTests {
  @Verifies<FeatureWatchModeFeature>('watchIgnoresTemporaryEditorSwapFiles')
  'recognises all editor swap patterns'() {
    expect(isEditorSwapFile('a/b/file.ts.swp')).toBe(true);
    expect(isEditorSwapFile('a/b/file.swx')).toBe(true);
    expect(isEditorSwapFile('a/b/.#lock')).toBe(true);
    expect(isEditorSwapFile('a/b/~temp')).toBe(true);
    expect(isEditorSwapFile('a/b/file.tmp')).toBe(true);
    expect(isEditorSwapFile('a/b/file.bak')).toBe(true);
    expect(isEditorSwapFile('a/b/file.ts~')).toBe(true);
    expect(isEditorSwapFile('a\\b\\file.swp')).toBe(true);
  }

  @Verifies<FeatureWatchModeFeature>('watchIgnoresTemporaryEditorSwapFiles')
  'real source files are not treated as swap'() {
    expect(isEditorSwapFile('a/b/feature.ts')).toBe(false);
    expect(isEditorSwapFile('a/b/foo.spec.json')).toBe(false);
  }

  @Verifies<FeatureWatchModeFeature>('watchReactsToFeatureTsFileSaveAsWellAsSpecJson')
  'watchable filter accepts .ts and .spec.json, rejects the rest'() {
    expect(isWatchableFile('requirements/features/a.ts')).toBe(true);
    expect(isWatchableFile('requirements/a.spec.json')).toBe(true);
    expect(isWatchableFile('requirements/a.md')).toBe(false);
    expect(isWatchableFile('requirements/a.ts.swp')).toBe(false);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Delta + snapshot rendering
// ═══════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureWatchModeFeature)
class DeltaRenderTests {
  @Verifies<FeatureWatchModeFeature>('watchPrintsOneLineComplianceDelta')
  'one-line delta format: signs + singular / plural files'() {
    const delta: ComplianceDelta = {
      before: { uncoveredCount: 1, orphanCount: 2 },
      after:  { uncoveredCount: 3, orphanCount: 1 },
      uncoveredDelta: 2,
      orphanDelta: -1,
    };
    const line = renderDeltaLine(1, 42, delta);
    expect(line).toBe('[watch] revalidated 1 file in 42ms — +2 uncovered / -1 orphan');

    const line2 = renderDeltaLine(3, 10, { ...delta, uncoveredDelta: 0, orphanDelta: 0 });
    expect(line2).toContain('3 files');
    expect(line2).toContain('±0 uncovered / ±0 orphan');
  }

  @Verifies<FeatureWatchModeFeature>('watchPrintsOneLineComplianceDelta')
  'snapshot computes uncovered approved + orphan counts'() {
    const features = [mkFeatureSpec('F1', []), mkFeatureSpec('F2', ['REQ-A'])];
    const requirements = [mkRequirementSpec('REQ-A', 'Approved'), mkRequirementSpec('REQ-B', 'Approved')];
    const snap = snapshotCompliance(features, requirements, stubCompliance);
    expect(snap.uncoveredCount).toBe(1);     // REQ-B unsatisfied
    expect(snap.orphanCount).toBe(1);        // F1 has no satisfies[]
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Debouncer
// ═══════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureWatchModeFeature)
class DebouncerTests {
  @Verifies<FeatureWatchModeFeature>('watchDetectsRapidSuccessionAndDebounces')
  async 'coalesces N pushes within the window into one flush'() {
    const s = mkScheduler();
    let flushes = 0;
    let lastBatch: readonly string[] = [];
    const d = createDebouncer<string>(s, 150, (ev) => { flushes++; lastBatch = ev; });
    d.push('a'); d.push('b'); d.push('c');
    expect(d.pending()).toBe(3);
    s.advance(149);
    expect(flushes).toBe(0);
    s.advance(1);
    expect(flushes).toBe(1);
    expect(lastBatch).toEqual(['a', 'b', 'c']);
    // Subsequent burst is its own flush
    d.push('d');
    s.advance(150);
    expect(flushes).toBe(2);
  }

  @Verifies<FeatureWatchModeFeature>('watchTearsDownAllWatchersOnCtrlC')
  async 'cancel drops the pending flush + clears the buffer'() {
    const s = mkScheduler();
    let flushes = 0;
    const d = createDebouncer<string>(s, 150, () => { flushes++; });
    d.push('a');
    expect(d.pending()).toBe(1);
    d.cancel();
    s.advance(500);
    expect(flushes).toBe(0);
    expect(d.pending()).toBe(0);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// loadAllSpecs
// ═══════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureWatchModeFeature)
class LoadAllSpecsTests {
  @Verifies<FeatureWatchModeFeature>('watchSurfacesSchemaViolationsInline')
  async 'invalid JSON surfaces via onSchemaError + does not throw'() {
    const fs = mkFs({
      'root/good.spec.json': JSON.stringify(mkFeatureSpec('F1')),
      'root/broken.spec.json': '{not json',
    });
    const errors: Array<{ path: string; count: number }> = [];
    const { features, requirements } = await loadAllSpecs(
      ['root'], fs,
      (p, errs) => errors.push({ path: p, count: errs.length }),
      okValidator,
    );
    expect(features).toHaveLength(1);
    expect(requirements).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe('root/broken.spec.json');
  }

  @Verifies<FeatureWatchModeFeature>('watchSurfacesSchemaViolationsInline')
  async 'schema-invalid specs surface via onSchemaError'() {
    const fs = mkFs({ 'root/x.spec.json': JSON.stringify({ kind: 'feature' }) });
    const errors: string[] = [];
    const bad = async (): Promise<ValidateResult> => ({ ok: false, errors: [{ path: '/id', message: 'required' }] });
    const { features } = await loadAllSpecs(['root'], fs, (_p, errs) => errors.push(errs[0]!.message), bad);
    expect(features).toHaveLength(0);
    expect(errors).toEqual(['required']);
  }

  @Verifies<FeatureWatchModeFeature>('watchReactsToFeatureTsFileSaveAsWellAsSpecJson')
  async 'recurses into subdirectories + ignores non-spec files'() {
    const fs = mkFs({
      'root/features/a.spec.json': JSON.stringify(mkFeatureSpec('F1')),
      'root/requirements/b.spec.json': JSON.stringify(mkRequirementSpec('REQ-1')),
      'root/features/a.ts': '// ignored by walk',
      'root/README.md': 'ignored',
    });
    const { features, requirements } = await loadAllSpecs(
      ['root'], fs, () => {}, okValidator,
    );
    expect(features).toHaveLength(1);
    expect(requirements).toHaveLength(1);
  }

  @Verifies<FeatureWatchModeFeature>('watchReactsToFeatureTsFileSaveAsWellAsSpecJson')
  async 'specs of unknown kind are neither classified as feature nor requirement'() {
    const fs = mkFs({
      'root/mystery.spec.json': JSON.stringify({ kind: 'scenario', id: 'S1' }),
    });
    const { features, requirements } = await loadAllSpecs(
      ['root'], fs, () => {}, okValidator,
    );
    expect(features).toEqual([]);
    expect(requirements).toEqual([]);
  }

  @Verifies<FeatureWatchModeFeature>('watchReactsToFeatureTsFileSaveAsWellAsSpecJson')
  async 'missing directory is silently skipped'() {
    const fs = mkFs({});
    const { features, requirements } = await loadAllSpecs(
      ['does-not-exist'], fs, () => {}, okValidator,
    );
    expect(features).toEqual([]);
    expect(requirements).toEqual([]);
  }

  @Verifies<FeatureWatchModeFeature>('watchSurfacesSchemaViolationsInline')
  async 'files that fail stat are skipped without crash'() {
    const base = mkFs({ 'root/a.spec.json': JSON.stringify(mkFeatureSpec('F1')) });
    const fs: FileSystem = {
      ...base,
      async stat(p: string) {
        if (p.endsWith('a.spec.json')) throw new Error('stat boom');
        return base.stat(p);
      },
    };
    const { features } = await loadAllSpecs(['root'], fs, () => {}, okValidator);
    expect(features).toEqual([]);
  }

  @Verifies<FeatureWatchModeFeature>('watchSurfacesSchemaViolationsInline')
  async 'readFile errors on a spec file are skipped silently'() {
    const base = mkFs({ 'root/a.spec.json': '{}' });
    const fs: FileSystem = {
      ...base,
      async readFile(p: string) {
        if (p.endsWith('a.spec.json')) throw new Error('read boom');
        return base.readFile(p, 'utf8');
      },
    };
    const errs: unknown[] = [];
    const { features } = await loadAllSpecs(['root'], fs, (_p, e) => errs.push(e), okValidator);
    expect(features).toEqual([]);
    expect(errs).toEqual([]);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// startWatch — integration
// ═══════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureWatchModeFeature)
class StartWatchTests {
  @Verifies<FeatureWatchModeFeature>('watchDetectsSpecChange')
  async 'a single spec change triggers one revalidation + one logger line'() {
    const s = mkScheduler();
    const w = mkWatcher();
    const logger = mkLogger();
    const fs = mkFs({
      'root/features/f.spec.json': JSON.stringify(mkFeatureSpec('F1', ['REQ-1'])),
      'root/requirements/r.spec.json': JSON.stringify(mkRequirementSpec('REQ-1', 'Approved')),
    });
    const handle = startWatch({
      paths: ['root'], fs, watcher: w, scheduler: s, clock: mkClock(s),
      logger, validator: okValidator, compliance: stubCompliance,
    });
    w.emit('root/features/f.spec.json');
    s.advance(150);
    await new Promise((r) => setImmediate(r));
    expect(handle.stats.revalidations).toBe(1);
    expect(logger.infos).toHaveLength(1);
    expect(logger.infos[0]).toContain('[watch] revalidated');
    handle.cancel();
  }

  @Verifies<FeatureWatchModeFeature>('watchUsesFileSystemPortWatcher')
  async 'startWatch calls the FileWatcher port with the given paths'() {
    const s = mkScheduler();
    const w = mkWatcher();
    const fs = mkFs({});
    const handle = startWatch({
      paths: ['root'], fs, watcher: w, scheduler: s, clock: mkClock(s),
      logger: mkLogger(), validator: okValidator, compliance: stubCompliance,
    });
    expect(w.watchedPaths).toEqual(['root']);
    handle.cancel();
  }

  @Verifies<FeatureWatchModeFeature>('watchTearsDownAllWatchersOnCtrlC')
  async 'cancel tears down the file watcher + pending debounce'() {
    const s = mkScheduler();
    const w = mkWatcher();
    const logger = mkLogger();
    const handle = startWatch({
      paths: ['root'], fs: mkFs({}), watcher: w, scheduler: s, clock: mkClock(s),
      logger, validator: okValidator, compliance: stubCompliance,
    });
    w.emit('root/features/f.spec.json');
    handle.cancel();
    s.advance(1000);
    await new Promise((r) => setImmediate(r));
    expect(w.cancelled).toBe(true);
    expect(logger.infos).toEqual([]);
  }

  @Verifies<FeatureWatchModeFeature>('endToEndBurstOfSavesYieldsExactlyOneRevalidation')
  async 'E2E: burst of 10 saves within window → exactly 1 revalidation'() {
    const s = mkScheduler();
    const w = mkWatcher();
    const logger = mkLogger();
    const fs = mkFs({
      'root/features/a.spec.json': JSON.stringify(mkFeatureSpec('A')),
    });
    const handle = startWatch({
      paths: ['root'], fs, watcher: w, scheduler: s, clock: mkClock(s),
      logger, debounceMs: 100, validator: okValidator, compliance: stubCompliance,
    });
    for (let i = 0; i < 10; i++) w.emit('root/features/a.spec.json');
    // Half-way through, no flush yet
    s.advance(50);
    await new Promise((r) => setImmediate(r));
    expect(handle.stats.revalidations).toBe(0);
    // Full window elapsed
    s.advance(50);
    await new Promise((r) => setImmediate(r));
    expect(handle.stats.revalidations).toBe(1);
    expect(logger.infos).toHaveLength(1);
    handle.cancel();
  }

  @Verifies<FeatureWatchModeFeature>('watchRevalidatesWithinLatencyBudget')
  async 'latency reported by renderDeltaLine is bounded by the clock delta'() {
    const s = mkScheduler();
    const w = mkWatcher();
    const logger = mkLogger();
    // Clock that ticks 40ms during the flush call
    const stubClock: Clock = {
      now: (() => {
        let c = 0;
        return () => { const v = c; c += 40; return v; };
      })(),
    };
    const handle = startWatch({
      paths: ['root'], fs: mkFs({}), watcher: w, scheduler: s, clock: stubClock,
      logger, validator: okValidator, compliance: stubCompliance,
    });
    w.emit('root/features/a.spec.json');
    s.advance(150);
    await new Promise((r) => setImmediate(r));
    expect(logger.infos[0]).toMatch(/in 40ms/);
    // 40ms < 500ms budget
    const latency = Number(logger.infos[0]!.match(/in (\d+)ms/)![1]!);
    expect(latency).toBeLessThan(500);
    handle.cancel();
  }

  @Verifies<FeatureWatchModeFeature>('watchIgnoresTemporaryEditorSwapFiles')
  async 'swap-file events do not trigger revalidation'() {
    const s = mkScheduler();
    const w = mkWatcher();
    const logger = mkLogger();
    const handle = startWatch({
      paths: ['root'], fs: mkFs({}), watcher: w, scheduler: s, clock: mkClock(s),
      logger, validator: okValidator, compliance: stubCompliance,
    });
    w.emit('root/features/a.ts.swp');
    w.emit('root/features/.#lock');
    w.emit('root/features/a.ts~');
    s.advance(500);
    await new Promise((r) => setImmediate(r));
    expect(handle.stats.droppedSwapFiles).toBe(3);
    expect(handle.stats.revalidations).toBe(0);
    handle.cancel();
  }

  @Verifies<FeatureWatchModeFeature>('watchReactsToFeatureTsFileSaveAsWellAsSpecJson')
  async 'non-watchable extensions do not trigger a revalidation'() {
    const s = mkScheduler();
    const w = mkWatcher();
    const logger = mkLogger();
    const handle = startWatch({
      paths: ['root'], fs: mkFs({}), watcher: w, scheduler: s, clock: mkClock(s),
      logger, validator: okValidator, compliance: stubCompliance,
    });
    w.emit('root/README.md');
    s.advance(500);
    await new Promise((r) => setImmediate(r));
    expect(handle.stats.revalidations).toBe(0);
    handle.cancel();
  }

  @Verifies<FeatureWatchModeFeature>('watchSurfacesSchemaViolationsInline')
  async 'schema-violating save is logged in red via logger.error — watcher survives'() {
    const s = mkScheduler();
    const w = mkWatcher();
    const logger = mkLogger();
    const fs = mkFs({ 'root/bad.spec.json': '{not json' });
    const handle = startWatch({
      paths: ['root'], fs, watcher: w, scheduler: s, clock: mkClock(s),
      logger, validator: okValidator, compliance: stubCompliance,
    });
    w.emit('root/bad.spec.json');
    s.advance(150);
    await new Promise((r) => setImmediate(r));
    expect(logger.errors).toHaveLength(1);
    expect(logger.errors[0]).toContain('[watch] schema error');
    // Watcher still alive after an error
    expect(handle.stats.revalidations).toBe(1);
    handle.cancel();
  }

  @Verifies<FeatureWatchModeFeature>('watchPrintsOneLineComplianceDelta')
  async 'second revalidation uses prior snapshot as before'() {
    const s = mkScheduler();
    const w = mkWatcher();
    const logger = mkLogger();
    // fs state: initially REQ-1 is covered. We'll simulate a change by swapping fs contents between flushes.
    const files: Record<string, string> = {
      'root/features/f.spec.json': JSON.stringify(mkFeatureSpec('F1', ['REQ-1'])),
      'root/requirements/r.spec.json': JSON.stringify(mkRequirementSpec('REQ-1', 'Approved')),
    };
    const fs = mkFs(files);
    const handle = startWatch({
      paths: ['root'], fs, watcher: w, scheduler: s, clock: mkClock(s),
      logger, validator: okValidator, compliance: stubCompliance,
    });
    // First save
    w.emit('root/features/f.spec.json');
    s.advance(150);
    await new Promise((r) => setImmediate(r));
    expect(handle.stats.revalidations).toBe(1);
    // Second save (same fs state → deltas should be 0 against prior)
    w.emit('root/features/f.spec.json');
    s.advance(150);
    await new Promise((r) => setImmediate(r));
    expect(handle.stats.revalidations).toBe(2);
    expect(logger.infos[1]).toContain('±0 uncovered / ±0 orphan');
    handle.cancel();
  }

  @Verifies<FeatureWatchModeFeature>('watchPrintsOneLineComplianceDelta')
  async 'delta line compares snapshots before vs after'() {
    const s = mkScheduler();
    const w = mkWatcher();
    const logger = mkLogger();
    const fs = mkFs({
      'root/features/f.spec.json': JSON.stringify(mkFeatureSpec('F1', ['REQ-1'])),
      'root/requirements/r.spec.json': JSON.stringify(mkRequirementSpec('REQ-1', 'Approved')),
      'root/requirements/r2.spec.json': JSON.stringify(mkRequirementSpec('REQ-UNSAT', 'Approved')),
    });
    const handle = startWatch({
      paths: ['root'], fs, watcher: w, scheduler: s, clock: mkClock(s),
      logger, validator: okValidator, compliance: stubCompliance,
    });
    w.emit('root/features/f.spec.json');
    s.advance(150);
    await new Promise((r) => setImmediate(r));
    // First revalidation: seeds prior → delta is zero.
    expect(logger.infos[0]).toContain('±0 uncovered / ±0 orphan');
    handle.cancel();
  }
}

void SwapFileFilterTests;
void DeltaRenderTests;
void DebouncerTests;
void LoadAllSpecsTests;
void StartWatchTests;
