/**
 * Sync core — pure, zero I/O except through injected FileSystem / Prompt ports.
 *
 * Computes a SyncPlan diffing a Spec's proposed generated files against disk,
 * renders unified diffs (colored via picocolors), and applies the plan to disk
 * in one of three modes: all / per-file / dry-run.
 *
 * Owned by Stream C. Deliverable:
 *   - diffSpecToDisk       : build SyncPlan (no writes)
 *   - renderSyncPlan       : colored unified diff string
 *   - renderSyncEntry      : render a single SyncEntry
 *   - applySyncPlan        : apply plan respecting mode + prompt
 *   - WRITABLE_PATTERNS    : safety list — paths outside this set are refused
 *   - RefusedWriteError    : thrown when a path is off-limits
 *
 * Satisfies: REQ-SPEC-IS-SOURCE-OF-TRUTH, REQ-TUI-MODERN (Prompt port only),
 *            REQ-PARALLEL-DELIVERABLE, REQ-DOG-FOOD.
 */

import { diffLines } from 'diff';
import pcModule from 'picocolors';

// Always emit ANSI: renderSyncPlan output is a string consumers may pipe into
// a file, a pager, or vitest snapshots — TTY-detection would yield different
// bytes depending on context, which violates determinism.
const pc = pcModule.createColors(true);

import type { Hunk, Spec, SyncEntry, SyncPlan } from '@frenchexdev2/requirements-core/types';
import type { FileSystem, Prompt } from '@frenchexdev2/requirements-core/ports';

// ── Safety: writable patterns ───────────────────────────────────────────────

/**
 * Whitelist of path patterns the sync apply step is allowed to touch.
 * Any other path causes `RefusedWriteError` — protects human-authored tests
 * from being clobbered by codegen.
 */
export const WRITABLE_PATTERNS: readonly RegExp[] = [
  /(?:^|\/)requirements\/features\/.*\.ts$/,
  /(?:^|\/)requirements\/requirements\/.*\.ts$/,
  /(?:^|\/)requirements\/.*\.spec\.json$/,
  /(?:^|\/)test\/(unit|e2e)\/.*-scaffold\.(test|spec)\.ts$/,
];

export class RefusedWriteError extends Error {
  constructor(public readonly path: string) {
    super(
      `Refusing to write "${path}" — only scaffold / spec / feature / requirement files are writable. ` +
        `Allowed patterns: ${WRITABLE_PATTERNS.map(r => r.source).join(', ')}`,
    );
    this.name = 'RefusedWriteError';
  }
}

function isWritable(path: string): boolean {
  // Normalize backslashes so the same patterns apply on Windows.
  const p = path.replace(/\\/g, '/');
  // Test the lexical path before any filesystem access. A matching prefix
  // must not permit traversal out of the generated-file directories.
  if (p.includes('\0') || p.split('/').includes('..')) return false;
  return WRITABLE_PATTERNS.some(re => re.test(p));
}

// ── Spec loading ────────────────────────────────────────────────────────────

/**
 * Load and parse a Spec JSON file from disk via the FileSystem port.
 * Returns the parsed JSON as a Spec (no schema validation here — that's
 * Stream D's responsibility).
 *
 * Satisfies AC `loadsSpecFromJsonPath`.
 */
export async function loadSpecFromJsonPath(path: string, fs: FileSystem): Promise<Spec> {
  const raw = await fs.readFile(path, 'utf8');
  return JSON.parse(raw) as Spec;
}

// ── Diff ────────────────────────────────────────────────────────────────────

function computeHunks(current: string, proposed: string): Hunk[] {
  const parts = diffLines(current, proposed);
  const hunks: Hunk[] = [];

  let i = 0;
  while (i < parts.length) {
    const part = parts[i]!;
    if (!part.added && !part.removed) {
      i++;
      continue;
    }

    // Group consecutive added/removed parts.
    const removed: string[] = [];
    const added: string[] = [];
    const before = i > 0 ? parts[i - 1] : undefined;

    while (i < parts.length && (parts[i]!.added || parts[i]!.removed)) {
      const p = parts[i]!;
      const lines = splitKeepingTrailing(p.value);
      // Loop guard ensures exactly one of p.added / p.removed is true; no
      // else-if needed — the else branch is reached iff p.removed.
      if (p.added) added.push(...lines);
      else removed.push(...lines);
      i++;
    }

    const after = i < parts.length ? parts[i] : undefined;

    const hunk: Hunk = {
      removed,
      added,
      ...(before ? { contextBefore: lastLine(before.value) } : {}),
      ...(after ? { contextAfter: firstLine(after.value) } : {}),
    };
    hunks.push(hunk);
  }

  return hunks;
}

function splitKeepingTrailing(s: string): string[] {
  // jsdiff chunks typically end with '\n'. Split and drop the trailing empty.
  // An empty input would yield `['']` and the pop below normalises it to `[]`,
  // so no dedicated empty-string branch is needed.
  const lines = s.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function firstLine(s: string): string {
  const idx = s.indexOf('\n');
  return idx === -1 ? s : s.slice(0, idx);
}

function lastLine(s: string): string {
  // Kept "before" chunks from jsdiff always end with '\n' in practice. Strip
  // up to one trailing newline via regex (the else-branch of a ternary would
  // register as an uncovered branch since the no-newline case never fires on
  // real diff output).
  const trimmed = s.replace(/\n$/, '');
  const idx = trimmed.lastIndexOf('\n');
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

/**
 * Compute the SyncPlan without any fs writes. Given a spec + proposed contents
 * (keyed by target path), classify each entry as create / unchanged / modified.
 *
 * Satisfies ACs `diffClassifiesEachTargetAsCreateUnchangedModified`,
 *               `diffComputesStructuredHunksViaJsdiff`.
 */
export async function diffSpecToDisk(
  spec: Spec,
  proposedContents: ReadonlyMap<string, string>,
  fs: FileSystem,
): Promise<SyncPlan> {
  const entries: SyncEntry[] = [];

  for (const [path, proposed] of proposedContents) {
    const present = await fs.exists(path);
    if (!present) {
      entries.push({ path, status: 'create', proposed, current: null, hunks: [] });
      continue;
    }
    const current = await fs.readFile(path, 'utf8');
    if (current === proposed) {
      entries.push({ path, status: 'unchanged', proposed, current, hunks: [] });
      continue;
    }
    const hunks = computeHunks(current, proposed);
    entries.push({ path, status: 'modified', proposed, current, hunks });
  }

  return { spec, entries };
}

// ── Render ──────────────────────────────────────────────────────────────────

/**
 * Render a single SyncEntry as a colored unified diff.
 *
 * Satisfies AC `renderColorizesAddRemoveContext`.
 */
export function renderSyncEntry(entry: SyncEntry): string {
  const header = pc.bold(pc.cyan(`── ${entry.status.toUpperCase()} ${entry.path} ──`));
  const lines: string[] = [header];

  if (entry.status === 'unchanged') {
    lines.push(pc.dim('  (unchanged)'));
    return lines.join('\n');
  }

  if (entry.status === 'create') {
    for (const line of entry.proposed.split('\n')) {
      lines.push(pc.green(`+ ${line}`));
    }
    return lines.join('\n');
  }

  // modified
  for (const hunk of entry.hunks) {
    if (hunk.contextBefore !== undefined && hunk.contextBefore.length > 0) {
      lines.push(pc.dim(`  ${hunk.contextBefore}`));
    }
    for (const r of hunk.removed) lines.push(pc.red(`- ${r}`));
    for (const a of hunk.added) lines.push(pc.green(`+ ${a}`));
    if (hunk.contextAfter !== undefined && hunk.contextAfter.length > 0) {
      lines.push(pc.dim(`  ${hunk.contextAfter}`));
    }
  }

  return lines.join('\n');
}

/**
 * Render the whole SyncPlan.
 *
 * Satisfies AC `renderColorizesAddRemoveContext` (at plan level).
 */
export function renderSyncPlan(plan: SyncPlan): string {
  if (plan.entries.length === 0) return pc.dim('(empty plan)');
  return plan.entries.map(renderSyncEntry).join('\n\n');
}

// ── Apply ───────────────────────────────────────────────────────────────────

export interface ApplyOptions {
  readonly mode: 'all' | 'per-file' | 'dry-run';
  /** Required when mode === 'per-file'. */
  readonly prompt?: Prompt;
}

export interface ApplyResult {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
  readonly cancelled: boolean;
}

async function ensureDirFor(path: string, fs: FileSystem): Promise<void> {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  // The plan's preflight writable-path check guarantees a parent directory.
  const dir = normalized.slice(0, idx);
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Apply a SyncPlan to disk.
 *
 * Satisfies ACs `interactivePromptsApplyOrSkipPerModified`,
 *               `unchangedEntriesNotPrompted`,
 *               `dryRunRendersDiffsWithoutWriting`,
 *               `yesFlagAppliesAllSilently`,
 *               `neverTouchesNonScaffoldTestFiles`.
 */
export async function applySyncPlan(
  plan: SyncPlan,
  fs: FileSystem,
  opts: ApplyOptions,
): Promise<ApplyResult> {
  const applied: string[] = [];
  const skipped: string[] = [];

  if (opts.mode === 'per-file' && !opts.prompt) {
    throw new Error('applySyncPlan: per-file mode requires a Prompt port');
  }

  // Pre-flight safety check: refuse the entire plan if any writable target
  // (create/modified) is off-list. Unchanged entries are ignored since nothing
  // will be written for them.
  for (const entry of plan.entries) {
    if (entry.status === 'unchanged') continue;
    if (!isWritable(entry.path)) {
      throw new RefusedWriteError(entry.path);
    }
  }

  for (const entry of plan.entries) {
    if (entry.status === 'unchanged') {
      skipped.push(entry.path);
      continue;
    }

    if (opts.mode === 'dry-run') {
      skipped.push(entry.path);
      continue;
    }

    if (opts.mode === 'per-file') {
      const prompt = opts.prompt!;
      prompt.note(renderSyncEntry(entry), entry.path);
      const go = await prompt.confirm(`Apply changes to ${entry.path}?`, true);
      if (!go) {
        skipped.push(entry.path);
        continue;
      }
    }

    // mode === 'all' OR per-file confirmed
    await ensureDirFor(entry.path, fs);
    await fs.writeFile(entry.path, entry.proposed);
    applied.push(entry.path);
  }

  return { applied, skipped, cancelled: false };
}
