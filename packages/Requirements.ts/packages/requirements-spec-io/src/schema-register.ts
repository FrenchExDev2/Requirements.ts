/**
 * `requirements schema register` — writes / merges `.vscode/settings.json`
 * so VS Code's JSON language service binds the committed JSON Schemas to
 * spec files under `requirements/features/*.spec.json` and
 * `requirements/requirements/*.spec.json`.
 *
 * Pure core: takes a FileSystem port, never touches `fs` directly. The
 * thin adapter in `bin/requirements.ts` (Stream F) wires this into the
 * CLI; tests inject an in-memory FileSystem.
 */

import type { FileSystem } from '@frenchexdev2/requirements-core/ports';

export type RegisterMode = 'created' | 'merged' | 'conflict' | 'printed';

export interface RegisterResult {
  readonly mode: RegisterMode;
  readonly settingsPath: string;
  /** Populated for every mode — for `--print` and for conflict messages. */
  readonly snippet: string;
  readonly conflictingEntry?: unknown;
}

export interface RegisterOptions {
  readonly projectRoot: string;
  readonly fs: FileSystem;
  /** `--print` — dump snippet to caller, do NOT touch the filesystem. */
  readonly print?: boolean;
  /** `--force` — overwrite conflicting entries (different url for same fileMatch). */
  readonly force?: boolean;
}

interface SchemaEntry {
  readonly fileMatch: readonly string[];
  readonly url: string;
}

const FEATURE_ENTRY: SchemaEntry = {
  fileMatch: ['**/requirements/features/*.spec.json'],
  url: './node_modules/@frenchexdev2/requirements-lib/schemas/feature-spec.schema.json',
};

const REQUIREMENT_ENTRY: SchemaEntry = {
  fileMatch: ['**/requirements/requirements/*.spec.json'],
  url: './node_modules/@frenchexdev2/requirements-lib/schemas/requirement-spec.schema.json',
};

/** The snippet emitted for `--print` and for fresh creation. */
export function buildSnippet(): string {
  const snippet = {
    'json.schemas': [FEATURE_ENTRY, REQUIREMENT_ENTRY],
  };
  return JSON.stringify(snippet, null, 2);
}

/** Join `projectRoot` + `.vscode/settings.json` using forward-slash separators. */
export function settingsPathFor(projectRoot: string): string {
  const root = projectRoot.replace(/[/\\]+$/, '');
  return `${root}/.vscode/settings.json`;
}

/**
 * Compare two `fileMatch` arrays structurally (dedup signature).
 * We treat two arrays as the same pattern iff their first entries match.
 */
function sameFileMatch(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (!a || !b || a.length === 0 || b.length === 0) return false;
  return a[0] === b[0];
}

function entriesEqual(a: SchemaEntry, b: { readonly fileMatch?: readonly string[]; readonly url?: string }): boolean {
  return sameFileMatch(a.fileMatch, b.fileMatch) && a.url === b.url;
}

function findConflict(
  existing: readonly { readonly fileMatch?: readonly string[]; readonly url?: string }[],
  ours: SchemaEntry,
): { readonly fileMatch?: readonly string[]; readonly url?: string } | undefined {
  return existing.find((e) => sameFileMatch(e.fileMatch, ours.fileMatch) && e.url !== ours.url);
}

export async function registerSchema(opts: RegisterOptions): Promise<RegisterResult> {
  const settingsPath = settingsPathFor(opts.projectRoot);
  const snippet = buildSnippet();

  if (opts.print) {
    return { mode: 'printed', settingsPath, snippet };
  }

  const exists = await opts.fs.exists(settingsPath);
  if (!exists) {
    // Ensure .vscode/ dir exists
    const vscodeDir = settingsPath.slice(0, settingsPath.lastIndexOf('/'));
    await opts.fs.mkdir(vscodeDir, { recursive: true });
    await opts.fs.writeFile(settingsPath, snippet + '\n');
    return { mode: 'created', settingsPath, snippet };
  }

  // Merge path
  const raw = await opts.fs.readFile(settingsPath, 'utf8');
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Malformed JSON: treat as conflict — refuse without force.
    if (!opts.force) {
      return {
        mode: 'conflict',
        settingsPath,
        snippet,
        conflictingEntry: { reason: 'existing settings.json is not valid JSON', raw },
      };
    }
    parsed = {};
  }

  const existing = Array.isArray(parsed['json.schemas'])
    ? (parsed['json.schemas'] as { readonly fileMatch?: readonly string[]; readonly url?: string }[])
    : [];

  // Conflict detection (skip if force)
  if (!opts.force) {
    const conflict =
      findConflict(existing, FEATURE_ENTRY) ?? findConflict(existing, REQUIREMENT_ENTRY);
    if (conflict) {
      return { mode: 'conflict', settingsPath, snippet, conflictingEntry: conflict };
    }
  }

  // Remove any same-fileMatch entries (force overwrite or plain dedup) and append ours
  const filtered = existing.filter(
    (e) =>
      !sameFileMatch(e.fileMatch, FEATURE_ENTRY.fileMatch) &&
      !sameFileMatch(e.fileMatch, REQUIREMENT_ENTRY.fileMatch),
  );
  // If the existing entry is *exactly* equal, we would have stripped it above.
  // Re-append the canonical pair so output is stable.
  const merged = [...filtered, FEATURE_ENTRY, REQUIREMENT_ENTRY];

  // Preserve whether existing had the identical pair already (no-op merge still returns 'merged').
  const next: Record<string, unknown> = { ...parsed, 'json.schemas': merged };
  // If every one of our entries is already present verbatim, the file is untouched in content —
  // but we still rewrite with stable ordering and still report 'merged'.
  const allPresent =
    existing.some((e) => entriesEqual(FEATURE_ENTRY, e)) &&
    existing.some((e) => entriesEqual(REQUIREMENT_ENTRY, e));

  const serialized = JSON.stringify(next, null, 2) + '\n';
  if (!allPresent || raw !== serialized) {
    await opts.fs.writeFile(settingsPath, serialized);
  }
  return { mode: 'merged', settingsPath, snippet };
}
