/**
 * versioning — pure, deterministic, injectable version-info + pin-resolution.
 *
 * Tier-2 roadmap C7 / REQ-VERSIONED-TRACEABILITY / VERSIONING Feature.
 *
 * Design rules:
 *   - No direct date / random / fs import — Clock + author are injected.
 *   - Pure: same spec → same contentHash (canonical form + sha256 stable).
 *   - Cosmetic-change immune: canonical form strips `$schemaVersion`, `$schema`,
 *     `history`, `tracedTo` (audit-trail / provenance fields, not semantic content)
 *     and sorts object keys recursively before hashing.
 *   - Additive: `VersionInfo` is an optional field on specs, never a breaking change.
 *   - Hash algorithm: sha256 via node:crypto.createHash.
 *   - Prefix: 'sha256:' so future algorithms can be introduced without ambiguity.
 */

import { createHash } from 'node:crypto';
import type {
  ChangeKind,
  FeatureId,
  FeatureSpec,
  HistoryEntry,
  IsoDate,
  RequirementId,
  RequirementSpec,
  Spec,
} from '@frenchexdev2/requirements-core/types';

// ══════════════════════════════════════════════════════════════════════════════
// Public types
// ══════════════════════════════════════════════════════════════════════════════

export interface VersionInfo {
  readonly version: number;
  readonly contentHash: string;
  readonly since: IsoDate;
  readonly supersedes?: string;
}

export interface VersionPin {
  /** Optional owner; an omitted owner applies to all satisfying Features. */
  readonly featureId?: string;
  readonly targetId: string;
  readonly pinnedVersion: number;
  readonly pinnedHash: string;
}

export interface VersionDrift {
  readonly kind: 'req-evolved' | 'pin-stale' | 'unpinned-req';
  readonly featureId: string;
  readonly requirementId: string;
  readonly pinnedVersion?: number;
  readonly currentVersion: number;
  readonly pinnedHash?: string;
  readonly currentHash: string;
}

export interface Clock {
  readonly nowIsoDate: () => IsoDate;
}

export interface HistoryContext {
  readonly author: string;
  readonly reason: string;
  readonly change?: ChangeKind;
}

/** A Spec extended with an optional `version` block. Additive; pre-existing specs parse unchanged. */
export type VersionedSpec<S extends Spec = Spec> = S & { readonly version?: VersionInfo };

// ══════════════════════════════════════════════════════════════════════════════
// Canonical form — the frozen input to the hash function
// ══════════════════════════════════════════════════════════════════════════════

/** Non-structural fields stripped before hashing. */
export const NON_STRUCTURAL_FIELDS: readonly string[] = Object.freeze([
  '$schemaVersion',
  '$schema',
  'history',
  'tracedTo',
  'version',
]);

/**
 * Deep-clone `v` with:
 *   - top-level & nested object keys sorted lexicographically
 *   - every key in NON_STRUCTURAL_FIELDS dropped (at every depth, defensively)
 *   - arrays preserved in order (semantic position matters for ACs, fitCriteria, …)
 */
export function canonicalize(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => canonicalize(x));
  const object = v as Record<string, unknown>;
  const keys = Object.keys(object)
    .filter(k => !NON_STRUCTURAL_FIELDS.includes(k))
    .sort();
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = canonicalize(object[key]);
  return out;
}

/** Deterministic canonical JSON string (input to sha256). */
export function canonicalJson(spec: Spec): string {
  return JSON.stringify(canonicalize(spec));
}

/** Compute the sha256 content hash of a spec, prefixed 'sha256:'. */
export function contentHashOf(spec: Spec): string {
  const h = createHash('sha256').update(canonicalJson(spec)).digest('hex');
  return `sha256:${h}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// computeVersionInfo — monotonic bump + deterministic hash
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Compute a `VersionInfo` for `spec`.
 *
 *   - No previous → v1, supersedes=undefined, since=clock.now.
 *   - Previous with different hash → v = previous.version + 1, supersedes=prev.contentHash.
 *   - Previous with SAME hash → return previous unchanged (structural no-op).
 */
export function computeVersionInfo(
  spec: Spec,
  previous: VersionInfo | undefined,
  clock: Clock,
): VersionInfo {
  const contentHash = contentHashOf(spec);
  if (previous && previous.contentHash === contentHash) return previous;
  if (previous) {
    return {
      version: previous.version + 1,
      contentHash,
      since: clock.nowIsoDate(),
      supersedes: previous.contentHash,
    };
  }
  return {
    version: 1,
    contentHash,
    since: clock.nowIsoDate(),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Pin resolution
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve a pin for (feature, requirement). Returns undefined when no pin is
 * registered (caller decides whether this is an error or a latest-auto policy).
 */
export function resolvePin(
  featureId: string,
  requirementId: string,
  pins: readonly VersionPin[],
): VersionPin | undefined {
  // Composite key: `${featureId}::${requirementId}` — but VersionPin carries only
  // targetId (the requirementId). The feature side is the owner of the pin,
  // scoped by position in the pins array. We match on targetId alone and,
  // when multiple exist, prefer the last one declared (stable LIFO = "most specific").
  for (let i = pins.length - 1; i >= 0; i--) {
    const p = pins[i]!;
    if (p.targetId !== requirementId) continue;
    const scoped = p.featureId;
    if (scoped === undefined || scoped === featureId) return p;
  }
  return undefined;
}

// ══════════════════════════════════════════════════════════════════════════════
// detectVersionDrift — the compliance --strict gate check
// ══════════════════════════════════════════════════════════════════════════════

/**
 * For every (feature → requirement) link, compare pin (if any) to the current
 * version/hash of the requirement.
 *
 *   - `req-evolved`    : pin.version < current.version                    → FAIL
 *   - `pin-stale`      : pin.hash    ≠ current.hash (regardless of ver)    → FAIL
 *   - `unpinned-req`   : no pin AND current.version > 1 (req has evolved)  → WARN
 */
export function detectVersionDrift(
  features: readonly VersionedSpec<FeatureSpec>[],
  requirements: readonly VersionedSpec<RequirementSpec>[],
  pins: readonly VersionPin[],
): readonly VersionDrift[] {
  const reqById = new Map<RequirementId, VersionedSpec<RequirementSpec>>();
  for (const r of requirements) reqById.set(r.id, r);

  const drifts: VersionDrift[] = [];
  for (const feat of features) {
    if (!feat.satisfies) continue;
    for (const reqId of feat.satisfies) {
      const req = reqById.get(reqId);
      if (!req) continue; // missing-requirement handled by other gates
      const currentHash = req.version?.contentHash ?? contentHashOf(req);
      const currentVersion = req.version?.version ?? 1;
      const pin = resolvePin(feat.id, reqId, pins);

      if (pin === undefined) {
        if (currentVersion > 1) {
          drifts.push({
            kind: 'unpinned-req',
            featureId: feat.id,
            requirementId: reqId,
            currentVersion,
            currentHash,
          });
        }
        continue;
      }

      if (pin.pinnedHash !== currentHash) {
        const kind: VersionDrift['kind'] =
          pin.pinnedVersion < currentVersion ? 'req-evolved' : 'pin-stale';
        drifts.push({
          kind,
          featureId: feat.id,
          requirementId: reqId,
          pinnedVersion: pin.pinnedVersion,
          currentVersion,
          pinnedHash: pin.pinnedHash,
          currentHash,
        });
      }
    }
  }
  return drifts;
}

// ══════════════════════════════════════════════════════════════════════════════
// History — append an entry on every version bump
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build a HistoryEntry describing a version bump. Caller appends the returned
 * entry to `spec.history`. Throws when `ctx.reason` is empty (invariant: every
 * bump must be justified in the audit trail).
 */
export function buildBumpHistoryEntry(
  clock: Clock,
  ctx: HistoryContext,
): HistoryEntry {
  if (ctx.reason.trim().length === 0) {
    throw new Error('versioning: history entry requires a non-empty reason');
  }
  return {
    date: clock.nowIsoDate(),
    author: ctx.author,
    change: ctx.change ?? 'StatementEdited',
    reason: ctx.reason,
  };
}

/**
 * Apply the next VersionInfo + append a history entry, returning a new spec.
 * Pure: does not mutate the input. Refuses to bump when `ctx.reason` is empty.
 */
export function applyVersionBump<S extends Spec>(
  spec: S,
  previous: VersionInfo | undefined,
  clock: Clock,
  ctx: HistoryContext,
): VersionedSpec<S> {
  const next = computeVersionInfo(spec, previous, clock);
  // Structural no-op → do not touch history.
  if (previous && next === previous) {
    return { ...spec, version: next } as VersionedSpec<S>;
  }
  // Reuse `next.since` so history.date === version.since for every bump.
  const frozenClock: Clock = { nowIsoDate: () => next.since };
  const entry = buildBumpHistoryEntry(frozenClock, ctx);
  const nextHistory: readonly HistoryEntry[] = [...(spec.history ?? []), entry];
  return { ...spec, history: nextHistory, version: next } as VersionedSpec<S>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Id helpers (re-exported for callers building pin tables)
// ══════════════════════════════════════════════════════════════════════════════

export type { FeatureId, RequirementId };
