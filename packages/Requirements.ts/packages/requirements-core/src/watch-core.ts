/**
 * Watch core — `requirements watch` live revalidation + compliance delta.
 *
 * Port-first: takes a `FileWatcher` port (with an in-memory mock for tests),
 * a `Clock`, a `Scheduler` (for the debounce timer), a `FileSystem` to read
 * saved specs, and a `Logger` to emit the one-line compliance delta.
 *
 * Production adapter: `node:fs/promises.watch(dir, { recursive: true })` is
 * perfectly sufficient here — the watcher only needs file-change events with
 * a relative filename. No need to pull in `chokidar`; zero new runtime deps.
 * The production adapter lives in `src/bin/requirements.ts` where the real
 * `node:fs` import is allowed.
 *
 * Debouncing: N events within a 150 ms window (configurable) coalesce into
 * one revalidation. Editor swap files (*.swp / *.tmp / ~* / .#* / *.bak)
 * are dropped before the debounce queue.
 *
 * Latency budget: wall-clock from first save to one-line output must be
 * under 500 ms (REQ-LIVE-FEEDBACK fit criterion).
 *
 * Satisfies: REQ-LIVE-FEEDBACK, REQ-DOG-FOOD, REQ-PARALLEL-DELIVERABLE.
 */

import type { Cancel, Clock, FileSystem, Logger, Scheduler } from './ports/index.js';
import type { FeatureSpec, RequirementSpec, Spec } from './types.js';

// Inversion of dependency on upper tiers (spec-io for validateSpec, wizards for
// orphanFeatureSpecs / uncoveredApprovedRequirements). Callers inject these so
// watch-core can live in @frenchexdev2/requirements-core without a cycle.
export interface ValidationError { readonly path: string; readonly message: string; }
export type ValidateResult =
  | { ok: true }
  | { ok: false; errors: readonly ValidationError[] };
export type ValidateSpec = (spec: unknown, schemasDir?: string) => Promise<ValidateResult>;
/** Compliance helpers — caller-injected functions returning anything with a `.length` (specs, IDs, etc.). */
export type ComplianceHelpers = {
  readonly orphanFeatureSpecs: (features: readonly FeatureSpec[]) => { readonly length: number };
  readonly uncoveredApprovedRequirements: (requirements: readonly RequirementSpec[], features: readonly FeatureSpec[]) => { readonly length: number };
};

// ── Ports ───────────────────────────────────────────────────────────────────

/**
 * FileWatcher port — a new narrow port for recursive directory watching.
 * The production adapter wraps `node:fs/promises.watch`; the test mock emits
 * events synchronously for deterministic debounce verification.
 */
export interface FileWatcher {
  /**
   * Watch `paths` recursively. Invokes `onChange(filePath)` for every save.
   * Returns a Cancel that tears down all underlying watchers.
   */
  watch(paths: readonly string[], onChange: (filePath: string) => void): Cancel;
}

// ── Swap-file filter ────────────────────────────────────────────────────────

/**
 * Editor swap/temp patterns that must never trigger revalidation.
 * Matched against the basename of the changed path.
 */
const SWAP_PATTERNS: readonly RegExp[] = [
  /\.swp$/i,     // vim
  /\.swx$/i,     // vim
  /\.tmp$/i,
  /^~/,          // trailing-tilde editors (Gedit, some Windows editors)
  /^\.#/,        // Emacs lock file
  /\.bak$/i,
  /~$/,          // Emacs backup
];

/** Exported for tests — returns true if the path should be ignored. */
export function isEditorSwapFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const basename = normalized.slice(normalized.lastIndexOf('/') + 1);
  return SWAP_PATTERNS.some((re) => re.test(basename));
}

// ── Watchable-file filter ───────────────────────────────────────────────────

/** We only revalidate on spec.json + feature .ts + requirement .ts saves. */
export function isWatchableFile(filePath: string): boolean {
  const p = filePath.replace(/\\/g, '/');
  if (isEditorSwapFile(p)) return false;
  return p.endsWith('.spec.json') || p.endsWith('.ts');
}

// ── Compliance snapshot ─────────────────────────────────────────────────────

export interface ComplianceSnapshot {
  readonly uncoveredCount: number;
  readonly orphanCount: number;
}

export interface ComplianceDelta {
  readonly before: ComplianceSnapshot;
  readonly after: ComplianceSnapshot;
  /** after.uncovered - before.uncovered */
  readonly uncoveredDelta: number;
  /** after.orphan - before.orphan */
  readonly orphanDelta: number;
}

export function snapshotCompliance(
  features: readonly FeatureSpec[],
  requirements: readonly RequirementSpec[],
  helpers: ComplianceHelpers,
): ComplianceSnapshot {
  return {
    uncoveredCount: helpers.uncoveredApprovedRequirements(requirements, features).length,
    orphanCount: helpers.orphanFeatureSpecs(features).length,
  };
}

/**
 * Render a one-line compliance delta. Signed: `+N` / `-N` / `±0`.
 * Example: `[watch] revalidated 1 file in 42ms — +2 uncovered / -1 orphan`.
 */
export function renderDeltaLine(
  filesTouched: number,
  latencyMs: number,
  delta: ComplianceDelta,
): string {
  const sign = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `${n}` : '±0');
  return (
    `[watch] revalidated ${filesTouched} file${filesTouched === 1 ? '' : 's'} in ${latencyMs}ms — ` +
    `${sign(delta.uncoveredDelta)} uncovered / ${sign(delta.orphanDelta)} orphan`
  );
}

// ── Spec loading helper ─────────────────────────────────────────────────────

/**
 * Load every spec.json under the given watch paths. Invalid/unparseable files
 * are surfaced through `onSchemaError` and skipped — the watcher never crashes.
 */
export async function loadAllSpecs(
  paths: readonly string[],
  fs: FileSystem,
  onSchemaError: (filePath: string, errors: readonly ValidationError[]) => void,
  validator: ValidateSpec,
  schemasDir?: string,
): Promise<{ features: FeatureSpec[]; requirements: RequirementSpec[] }> {
  const features: FeatureSpec[] = [];
  const requirements: RequirementSpec[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = `${dir}/${name}`;
      let isDir = false;
      try {
        const s = await fs.stat(full);
        isDir = s.isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        await walk(full);
        continue;
      }
      if (!name.endsWith('.spec.json')) continue;
      let raw: string;
      try {
        raw = await fs.readFile(full, 'utf8');
      } catch {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        onSchemaError(full, [{ path: '/', message: (e as Error).message }]);
        continue;
      }
      const valid = await validator(parsed, schemasDir);
      if (!valid.ok) {
        onSchemaError(full, valid.errors);
        continue;
      }
      const spec = parsed as Spec;
      if (spec.kind === 'feature') features.push(spec);
      else if (spec.kind === 'requirement') requirements.push(spec);
    }
  }

  for (const p of paths) await walk(p);
  return { features, requirements };
}

// ── Debouncer (pure, Scheduler-injected) ────────────────────────────────────

/**
 * Build a debounced trigger: every call to `push(ev)` resets a timer; when
 * the timer fires, `flush(events)` runs with every accumulated event.
 * Cancellation via `cancel()` drops any pending flush.
 */
export function createDebouncer<T>(
  scheduler: Scheduler,
  windowMs: number,
  flush: (events: readonly T[]) => void | Promise<void>,
): { push: (ev: T) => void; cancel: Cancel; pending: () => number } {
  let buffer: T[] = [];
  let cancelTimer: Cancel | null = null;

  function schedule(): void {
    if (cancelTimer) cancelTimer();
    cancelTimer = scheduler.setTimeout(() => {
      const events = buffer;
      buffer = [];
      cancelTimer = null;
      // Fire-and-forget: the run wrapper itself wraps errors so we don't crash
      // the watcher loop if the flush throws.
      void Promise.resolve(flush(events));
    }, windowMs);
  }

  return {
    push(ev: T): void {
      buffer.push(ev);
      schedule();
    },
    cancel(): void {
      if (cancelTimer) {
        cancelTimer();
        cancelTimer = null;
      }
      buffer = [];
    },
    pending(): number {
      return buffer.length;
    },
  };
}

// ── Main entry: startWatch ──────────────────────────────────────────────────

export interface WatchOptions {
  readonly paths: readonly string[];
  readonly fs: FileSystem;
  readonly watcher: FileWatcher;
  readonly scheduler: Scheduler;
  readonly clock: Clock;
  readonly logger: Logger;
  /** Debounce window in ms. Default 150. */
  readonly debounceMs?: number;
  /** Schemas dir override — passed through to validateSpec. */
  readonly schemasDir?: string;
  /** Schema validator — injected by caller (e.g. validateSpec from spec-io). */
  readonly validator: ValidateSpec;
  /** Compliance helpers — injected by caller (e.g. wizards' orphanFeatureSpecs + uncoveredApprovedRequirements). */
  readonly compliance: ComplianceHelpers;
}

export interface WatchHandle {
  /** Tear down all watchers and the pending debounce timer. */
  readonly cancel: Cancel;
  /** Revalidation count — useful for E2E burst tests. */
  readonly stats: { revalidations: number; droppedSwapFiles: number };
}

/**
 * Start live watch mode. Returns a handle whose `cancel()` tears down every
 * watcher and the debounce timer — bin wires this into `process.on('SIGINT')`.
 */
export function startWatch(opts: WatchOptions): WatchHandle {
  const windowMs = opts.debounceMs ?? 150;
  const stats = { revalidations: 0, droppedSwapFiles: 0 };

  // Seed prior snapshot so the first revalidation can print a real delta.
  let prior: ComplianceSnapshot = { uncoveredCount: 0, orphanCount: 0 };
  let seeded = false;

  const debouncer = createDebouncer<string>(opts.scheduler, windowMs, async (events) => {
    const startedAt = opts.clock.now();

    const { features, requirements } = await loadAllSpecs(
      opts.paths,
      opts.fs,
      (filePath, errors) => {
        const msg = errors.map((e) => `${e.path} ${e.message}`).join('; ');
        opts.logger.error(`\x1b[31m[watch] schema error\x1b[0m ${filePath}: ${msg}`);
      },
      opts.validator,
      opts.schemasDir,
    );

    const after = snapshotCompliance(features, requirements, opts.compliance);
    const before = seeded ? prior : after;
    seeded = true;
    prior = after;

    const delta: ComplianceDelta = {
      before,
      after,
      uncoveredDelta: after.uncoveredCount - before.uncoveredCount,
      orphanDelta: after.orphanCount - before.orphanCount,
    };

    const latencyMs = opts.clock.now() - startedAt;
    const touched = new Set(events).size;
    stats.revalidations++;
    opts.logger.info(renderDeltaLine(touched, latencyMs, delta));
  });

  const watcherCancel = opts.watcher.watch(opts.paths, (filePath) => {
    if (isEditorSwapFile(filePath)) {
      stats.droppedSwapFiles++;
      return;
    }
    if (!isWatchableFile(filePath)) return;
    debouncer.push(filePath);
  });

  return {
    cancel: () => {
      debouncer.cancel();
      watcherCancel();
    },
    stats,
  };
}
