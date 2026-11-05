/**
 * bidi-sync-core — bidirectional sync orchestration for Feature specs.
 *
 * Closes the loop between `.spec.json` and `.ts` class: either side may be
 * edited; the other regenerates idempotently. Detects:
 *   - TS-does-not-parse                  → SyncRefusedCompileError
 *   - both sides changed since last sync → AmbiguousMergeError
 *   - silent drift between them          → SyncDivergenceResult
 *
 * All I/O goes through the injected FileSystem port — pure-core friendly.
 *
 * The tsc-clean guard delegates to `assertFeatureSourceCompiles`, which now
 * uses ts-morph's `getPreEmitDiagnostics()` under the hood and catches
 * syntactic errors. It also catches type-resolution errors when the source
 * references modules that have been injected into the ts-morph project —
 * in this hermetic usage (standalone .ts fragment) only syntactic errors
 * fire, which is the contract the @Verifies test expects.
 *
 * Satisfies FEATURE-BIDIRECTIONAL-SYNC ACs:
 *   bidirectionalSyncTsToJson
 *   bidirectionalSyncJsonToTs
 *   roundTripIsIdempotentAfterThreeCycles
 *   syncPreservesCommentsAndDecoratorOrderInTs
 *   syncRefusesAmbiguousMerge
 *   syncDetectsDivergenceBetweenSources
 *   syncRefusesWhenTsDoesNotCompile
 *   syncWritesViaFileSystemPort
 *   syncEmitsSchemaVersionOnJsonOutput
 *   endToEndTsEditFlowsIntoJsonAndBack
 */

import type { FileSystem } from '@frenchexdev2/requirements-core/ports';
import type { FeatureSpec } from '@frenchexdev2/requirements-core/types';
import { SCHEMA_VERSION } from '@frenchexdev2/requirements-core/types';
import {
  ParseFeatureSourceError,
  assertFeatureSourceCompiles,
  parseFeatureSource,
} from './spec-from-source.js';
import { generateFeatureSource, specToJson } from './spec-to-source.js';

// ── Errors ──────────────────────────────────────────────────────────────────

export class SyncRefusedCompileError extends Error {
  constructor(public readonly path: string, public readonly cause: Error) {
    super(`syncBidirectional: .ts at ${path} failed to parse — ${cause.message}`);
    this.name = 'SyncRefusedCompileError';
  }
}

export class AmbiguousMergeError extends Error {
  constructor(
    public readonly tsPath: string,
    public readonly jsonPath: string,
    public readonly tsSide: string,
    public readonly jsonSide: string,
  ) {
    super(
      `syncBidirectional: both sides diverged from last sync — ambiguous merge.\n` +
        `  ts:   ${tsPath}\n` +
        `  json: ${jsonPath}`,
    );
    this.name = 'AmbiguousMergeError';
  }
}

// ── Sync state (persisted marker for ambiguous-merge detection) ─────────────

/**
 * Snapshot of the last known synced state. Stored as a sibling `.sync.json`
 * alongside the spec; stores content hashes (not mtimes — portable across
 * clones/CI) so divergence is detected regardless of filesystem quirks.
 */
export interface SyncMarker {
  readonly tsHash: string;
  readonly jsonHash: string;
  readonly at: string;
}

/**
 * Fast deterministic FNV-1a 32-bit hash. Good enough for change-detection; we
 * are not guarding against adversarial collisions.
 */
export function contentHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ── Paths ───────────────────────────────────────────────────────────────────

export interface BidiPaths {
  readonly tsPath: string;
  readonly jsonPath: string;
  /** Defaults to `${jsonPath}.sync` — stores the last-known-good marker. */
  readonly markerPath?: string;
}

function markerOf(paths: BidiPaths): string {
  return paths.markerPath ?? `${paths.jsonPath}.sync`;
}

// ── Direction A: TS → JSON ──────────────────────────────────────────────────

/**
 * Parse the .ts source and return the serialized JSON form.
 *
 * Satisfies AC `bidirectionalSyncTsToJson` — same spec content yields the
 * same JSON whether authored in TS or directly in JSON. Combined with
 * `specToJson` which puts `$schema` + `$schemaVersion` first, this also
 * satisfies AC `syncEmitsSchemaVersionOnJsonOutput`.
 */
export function tsToJsonSpec(tsSource: string, filename?: string): { spec: FeatureSpec; json: string } {
  const spec = parseFeatureSource(tsSource, filename);
  const json = specToJson(spec);
  return { spec, json };
}

// ── Direction B: JSON → TS ──────────────────────────────────────────────────

/**
 * Parse the .spec.json and return the generated .ts source.
 *
 * Satisfies AC `bidirectionalSyncJsonToTs`.
 */
export function jsonToTsSpec(jsonSource: string): { spec: FeatureSpec; ts: string } {
  const parsed = JSON.parse(jsonSource) as FeatureSpec;
  // Ensure schema version propagates (AC `syncEmitsSchemaVersionOnJsonOutput`
  // protects the JSON side; here we normalise on parse so round-trips don't
  // drop it if an older JSON omits it).
  const spec: FeatureSpec = parsed.$schemaVersion
    ? parsed
    : { ...parsed, $schemaVersion: SCHEMA_VERSION };
  const ts = generateFeatureSource(spec);
  return { spec, ts };
}

// ── Idempotence / round-trip check ──────────────────────────────────────────

export interface RoundTripResult {
  readonly converged: boolean;
  readonly cycles: readonly { ts: string; json: string }[];
}

/**
 * Run three full round-trip cycles starting from a .ts source and assert the
 * output converges to a byte-identical fixed point after cycle 2.
 *
 * Satisfies AC `roundTripIsIdempotentAfterThreeCycles`.
 */
export function threeCycleRoundTrip(initialTs: string): RoundTripResult {
  const cycles: { ts: string; json: string }[] = [];
  let ts = initialTs;
  for (let i = 0; i < 3; i++) {
    const { json } = tsToJsonSpec(ts);
    const { ts: nextTs } = jsonToTsSpec(json);
    cycles.push({ ts: nextTs, json });
    ts = nextTs;
  }
  const c1 = cycles[1]!;
  const c2 = cycles[2]!;
  const converged = c1.ts === c2.ts && c1.json === c2.json;
  return { converged, cycles };
}

// ── Divergence detection ────────────────────────────────────────────────────

export interface DivergenceReport {
  readonly diverged: boolean;
  readonly tsDerivedJson: string;
  readonly onDiskJson: string;
}

/**
 * Compute whether the .ts side and the .spec.json on disk represent the same
 * spec. Divergence ≠ ambiguous merge — divergence means the two files on disk
 * are inconsistent; ambiguous merge is the higher-level case where we can't
 * decide which side to trust.
 *
 * Satisfies AC `syncDetectsDivergenceBetweenSources`.
 */
export function detectDivergence(tsSource: string, jsonSource: string): DivergenceReport {
  const { json: tsDerivedJson } = tsToJsonSpec(tsSource);
  // Normalise trailing whitespace for a resilient compare.
  const left = tsDerivedJson.replace(/\s+$/, '');
  const right = jsonSource.replace(/\s+$/, '');
  return { diverged: left !== right, tsDerivedJson, onDiskJson: jsonSource };
}

// ── Orchestration ───────────────────────────────────────────────────────────

export type BidiDirection = 'ts-to-json' | 'json-to-ts';

export interface BidiSyncOptions {
  readonly direction: BidiDirection;
  /** When true, bypass ambiguous-merge detection and force the chosen direction. */
  readonly force?: boolean;
}

export interface BidiSyncResult {
  readonly direction: BidiDirection;
  readonly wrote: readonly string[];
  readonly spec: FeatureSpec;
}

/**
 * Execute a bidirectional sync. All I/O goes through the FileSystem port.
 *
 * Satisfies ACs:
 *   - `syncWritesViaFileSystemPort` (no direct fs calls)
 *   - `syncRefusesWhenTsDoesNotCompile`
 *   - `syncRefusesAmbiguousMerge`
 *   - `endToEndTsEditFlowsIntoJsonAndBack`
 */
export async function syncBidirectional(
  paths: BidiPaths,
  fs: FileSystem,
  opts: BidiSyncOptions,
  now: () => string = () => new Date().toISOString(),
): Promise<BidiSyncResult> {
  const hasTs = await fs.exists(paths.tsPath);
  const hasJson = await fs.exists(paths.jsonPath);

  const tsSource = hasTs ? await fs.readFile(paths.tsPath, 'utf8') : '';
  const jsonSource = hasJson ? await fs.readFile(paths.jsonPath, 'utf8') : '';

  // Ambiguous-merge gate: if BOTH sides exist AND BOTH changed since last
  // sync marker, refuse.
  if (!opts.force && hasTs && hasJson) {
    const mPath = markerOf(paths);
    const mExists = await fs.exists(mPath);
    if (mExists) {
      const marker = JSON.parse(await fs.readFile(mPath, 'utf8')) as SyncMarker;
      const tsChanged = marker.tsHash !== contentHash(tsSource);
      const jsonChanged = marker.jsonHash !== contentHash(jsonSource);
      if (tsChanged && jsonChanged) {
        throw new AmbiguousMergeError(paths.tsPath, paths.jsonPath, tsSource, jsonSource);
      }
    }
  }

  // TS-compile gate (only when the TS side is the input).
  if (opts.direction === 'ts-to-json') {
    try {
      assertFeatureSourceCompiles(tsSource, paths.tsPath);
    } catch (cause) {
      throw new SyncRefusedCompileError(paths.tsPath, cause as ParseFeatureSourceError);
    }
  }

  const wrote: string[] = [];
  let spec: FeatureSpec;

  if (opts.direction === 'ts-to-json') {
    const { spec: parsed, json } = tsToJsonSpec(tsSource, paths.tsPath);
    await fs.writeFile(paths.jsonPath, json);
    wrote.push(paths.jsonPath);
    spec = parsed;
    await writeMarker(fs, markerOf(paths), tsSource, json, now);
  } else {
    const { spec: parsed, ts } = jsonToTsSpec(jsonSource);
    await fs.writeFile(paths.tsPath, ts);
    wrote.push(paths.tsPath);
    spec = parsed;
    await writeMarker(fs, markerOf(paths), ts, jsonSource, now);
  }

  return { direction: opts.direction, wrote, spec };
}

async function writeMarker(
  fs: FileSystem,
  path: string,
  tsSource: string,
  jsonSource: string,
  now: () => string,
): Promise<void> {
  const marker: SyncMarker = {
    tsHash: contentHash(tsSource),
    jsonHash: contentHash(jsonSource),
    at: now(),
  };
  await fs.writeFile(path, JSON.stringify(marker, null, 2) + '\n');
}
