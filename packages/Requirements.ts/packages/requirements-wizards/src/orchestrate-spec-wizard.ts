/**
 * Port-based orchestrator for `feature new` / `feature sync` /
 * `requirement new` / `requirement sync` wizards.
 *
 * Extracted from `packages/requirements/src/bin/requirements.ts` so the
 * CLI-shell flow (preview → prompt mode → apply → open-editor) is
 * testable at the lib level without Commander or @clack/prompts.
 *
 * Satisfies the CLI-flow ACs of `FeatureNewCommandFeature` that belong
 * to orchestration (preview / dry-run / apply-review-cancel / no-test /
 * open-in-editor / full wizard walk).
 */

import * as path from 'node:path';
import type { FileSystem, Logger, Prompt, Vcs } from '@frenchexdev2/requirements-core/ports';
import type { Spec, SyncPlan } from '@frenchexdev2/requirements-core/types';
import {
  generateFeatureSource,
  generateRequirementSource,
  specToJson,
} from '@frenchexdev2/requirements-spec-io/spec-to-source';
import {
  generateScaffoldForSpec,
  planWrites,
  type WritePlanConfig,
} from '@frenchexdev2/requirements-scaffolders';
import { diffSpecToDisk, renderSyncPlan, applySyncPlan } from '@frenchexdev2/requirements-sync';

/**
 * Shape of the coverage-delta emitted above the preview. `before`/`after` are
 * AC counts; `added`/`removed` are set-differences keyed by AC name. For a new
 * feature (no existing source on disk), `before` is 0 and `isNew` is true.
 */
export interface SpecCoverageDelta {
  readonly featureId: string;
  readonly before: number;
  readonly after: number;
  readonly added: number;
  readonly removed: number;
  readonly isNew: boolean;
}

/** Closure that opens one or more files in the user's editor (e.g. `code <paths>`). */
export type OpenInEditor = (paths: readonly string[]) => Promise<void>;

export interface OrchestrateSpecWizardPorts {
  readonly prompt: Prompt;
  readonly fs: FileSystem;
  readonly logger: Logger;
  /** Optional — when omitted, the "open in editor" prompt is skipped. */
  readonly openInEditor?: OpenInEditor;
  /**
   * Optional VCS port. When supplied, the orchestrator refuses to overwrite any
   * target path that exists on disk but is NOT tracked by VCS (likely WIP the
   * user hasn't committed). Omit to disable the check.
   */
  readonly vcs?: Vcs;
}

export interface OrchestrateSpecWizardOptions {
  readonly yes?: boolean;
  readonly noTest?: boolean;
  readonly dryRun?: boolean;
}

export interface OrchestrateSpecWizardResult {
  readonly plan: SyncPlan;
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
  readonly cancelled: boolean;
  readonly editorOpened: boolean;
  /** Null for requirement specs (AC-coverage is a feature-only concept). */
  readonly delta: SpecCoverageDelta | null;
}

/**
 * Thrown when the orchestrator refuses to overwrite a file because it exists
 * on disk but is not tracked by VCS (likely uncommitted human work).
 */
export class UntrackedOverwriteError extends Error {
  constructor(public readonly path: string) {
    super(
      `Refusing to overwrite "${path}" — file exists on disk but is not tracked by VCS. ` +
        `Commit it, delete it, or pass a spec that doesn't target this path.`,
    );
    this.name = 'UntrackedOverwriteError';
  }
}

function resolveJoin(root: string, rel: string): string {
  return path.resolve(root, rel);
}

function relativize(root: string, abs: string): string {
  return path.relative(root, abs);
}

/**
 * Extract the set of AC names from a Feature source file by matching
 * `abstract <name>(): ACResult;` declarations. Regex-based on purpose — avoids
 * pulling ts-morph's compliance-core parser for a one-off shallow count.
 */
function extractAcNames(src: string): Set<string> {
  const re = /\babstract\s+([a-zA-Z_$][\w$]*)\s*\(\s*\)\s*:\s*ACResult\b/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.add(m[1]!);
  return out;
}

/**
 * Compute the AC-coverage delta for a feature spec against its current
 * on-disk source (if any). Returns null for requirement specs — coverage
 * delta is a feature-only concept.
 */
export async function computeSpecCoverageDelta(
  spec: Spec,
  root: string,
  config: WritePlanConfig,
  fs: FileSystem,
): Promise<SpecCoverageDelta | null> {
  if (spec.kind !== 'feature') return null;

  const wp = planWrites(spec, config);
  const absSource = resolveJoin(root, wp.sourcePath);
  const existed = await fs.exists(absSource);

  const after = new Set<string>(spec.acs.map(a => String(a.name)));
  const before = existed
    ? extractAcNames(await fs.readFile(absSource, 'utf8'))
    : new Set<string>();

  let added = 0;
  let removed = 0;
  for (const a of after) if (!before.has(a)) added++;
  for (const b of before) if (!after.has(b)) removed++;

  return {
    featureId: String(spec.id),
    before: before.size,
    after: after.size,
    added,
    removed,
    isNew: !existed,
  };
}

/**
 * Render the coverage delta as a one-line preview annotation.
 * Stable format — tests assert on the substring `Δ <featureId>`.
 */
export function renderCoverageDelta(delta: SpecCoverageDelta): string {
  if (delta.isNew) {
    return `  Δ ${delta.featureId}: +${delta.after} ACs (new feature)`;
  }
  const parts: string[] = [];
  if (delta.added > 0) parts.push(`+${delta.added} added`);
  if (delta.removed > 0) parts.push(`-${delta.removed} removed`);
  const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : ' (no change)';
  return `  Δ ${delta.featureId}: ${delta.before} → ${delta.after} ACs${suffix}`;
}

/**
 * Build the SyncPlan for a spec: generate target sources, collect proposed
 * contents, diff against disk via the FileSystem port.
 */
export async function buildSpecSyncPlan(
  spec: Spec,
  root: string,
  config: WritePlanConfig,
  fs: FileSystem,
  opts: { noTest?: boolean } = {},
): Promise<SyncPlan> {
  const wp = planWrites(spec, config);
  const proposed = new Map<string, string>();

  if (spec.kind === 'feature') {
    proposed.set(wp.sourcePath, generateFeatureSource(spec));
  } else {
    proposed.set(wp.sourcePath, generateRequirementSource(spec));
  }
  proposed.set(wp.specPath, specToJson(spec));

  if (!opts.noTest && spec.kind === 'feature') {
    for (const scaffold of wp.scaffoldPaths) {
      // Both operations use the same built-in registry and declared AC levels.
      proposed.set(scaffold.path, generateScaffoldForSpec(spec, scaffold.level));
    }
  }

  const absProposed = new Map<string, string>();
  for (const [rel, content] of proposed) absProposed.set(resolveJoin(root, rel), content);

  return diffSpecToDisk(spec, absProposed, fs);
}

/**
 * Run the full CLI flow for a spec wizard: build plan → render → prompt for
 * apply mode (all / per-file / cancel) → apply → optional open-in-editor.
 *
 * Pure port-based: emits via `logger.info`, prompts via `prompt.*`, reads/writes
 * disk via `fs.*`, opens the editor via the injected `openInEditor` closure.
 */
export async function orchestrateSpecWizard(
  spec: Spec,
  root: string,
  config: WritePlanConfig,
  ports: OrchestrateSpecWizardPorts,
  opts: OrchestrateSpecWizardOptions = {},
): Promise<OrchestrateSpecWizardResult> {
  const { prompt, fs, logger, openInEditor, vcs } = ports;

  const plan = await buildSpecSyncPlan(spec, root, config, fs, { noTest: opts.noTest });

  // Safety: refuse to overwrite a file that exists on disk but is not tracked
  // by VCS. `create` entries have no disk file (safe). `unchanged` entries
  // write nothing. Only `modified` entries risk clobbering WIP.
  if (vcs) {
    for (const entry of plan.entries) {
      if (entry.status !== 'modified') continue;
      const tracked = await vcs.isTracked(entry.path);
      if (!tracked) throw new UntrackedOverwriteError(entry.path);
    }
  }

  const delta = await computeSpecCoverageDelta(spec, root, config, fs);

  // renderSyncPlan always returns a non-empty string (`(empty plan)` at worst),
  // so no guard needed — always emit to the logger. Prepend the coverage-delta
  // line for feature specs so the user sees AC-count impact at the top.
  const previewBody = renderSyncPlan(plan);
  const preview = delta ? renderCoverageDelta(delta) + '\n' + previewBody : previewBody;
  logger.info('\n' + preview);

  const modifiedCount = plan.entries.filter(e => e.status === 'modified').length;
  const createCount = plan.entries.filter(e => e.status === 'create').length;

  if (opts.dryRun) {
    logger.info(`\n  (dry-run) ${createCount} create, ${modifiedCount} modified — no writes.`);
    return { plan, applied: [], skipped: [], cancelled: false, editorOpened: false, delta };
  }

  let mode: 'all' | 'per-file' | 'dry-run' = 'all';
  if (!opts.yes && modifiedCount + createCount > 0) {
    mode = await prompt.select<'all' | 'per-file' | 'dry-run'>(
      `${createCount} create, ${modifiedCount} modified. Apply how?`,
      [
        { value: 'all', label: 'Apply all' },
        { value: 'per-file', label: 'Review per file' },
        { value: 'dry-run', label: 'Cancel (dry run)' },
      ],
      'all',
    );
  }

  if (mode === 'dry-run') {
    logger.info('  No changes applied.');
    return { plan, applied: [], skipped: [], cancelled: true, editorOpened: false, delta };
  }

  const result = await applySyncPlan(plan, fs, { mode, prompt });
  for (const p of result.applied) logger.info(`  \x1b[32m✓\x1b[0m ${relativize(root, p)}`);
  for (const p of result.skipped) logger.info(`  \x1b[33m-\x1b[0m ${relativize(root, p)} (skipped)`);

  let editorOpened = false;
  if (!opts.yes && result.applied.length > 0 && openInEditor) {
    const go = await prompt.confirm('Open generated/changed files in VS Code?', false);
    if (go) {
      await openInEditor(result.applied);
      editorOpened = true;
    }
  }

  return {
    plan,
    applied: result.applied,
    skipped: result.skipped,
    cancelled: false,
    editorOpened,
    delta,
  };
}
