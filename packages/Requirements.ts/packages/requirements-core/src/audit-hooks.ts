/**
 * Audit-trail hooks (REQ-AUDIT-TRAIL-HOOKS) — Tier-2 hook-only layer.
 *
 * Schema + no-op decorators so Tier-3 (21 CFR Part 11 Part E: cryptographic
 * electronic signatures) can drop in WITHOUT a migration. Zero crypto here:
 * everything is shape-level.
 *
 * Exposes:
 *   - @Reviewed(reviewer, date)   — class decorator, no-op, registers metadata
 *   - @ApprovedBy(approver, date) — class decorator, no-op, registers metadata
 *   - @SignedOff(SignatureInfo)   — class decorator; runtime SHAPE check
 *   - @SignedOffAc(SignatureInfo) — method decorator (AC-level sign-off)
 *   - validateSignatureShape(x)   — discriminating shape validator
 *   - appendHistoryEntry(spec,e)  — immutable append; returns new Spec
 *   - getAuditRegistry()          — read-only registry of decorator events
 */

import type { HistoryEntry, SignatureInfo, Spec, IsoDate } from './types.js';
import { ISO_DATE_PATTERN } from './types.js';

// ──────────────────────────────────────────────────────────────────────────────
// Registry
// ──────────────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  readonly className: string;
  /** present only for method-level sign-off (AC name) */
  readonly acName?: string;
  readonly change: 'Reviewed' | 'ApprovedBy' | 'SignedOff';
  readonly actor: string;
  readonly date: IsoDate;
  readonly signature?: SignatureInfo;
}

const auditRegistry: AuditEntry[] = [];

export function getAuditRegistry(): readonly AuditEntry[] {
  return auditRegistry;
}

// ──────────────────────────────────────────────────────────────────────────────
// Shape validation — NO crypto, Tier-3 adds real verification
// ──────────────────────────────────────────────────────────────────────────────

const ALLOWED_ALGORITHMS: ReadonlySet<SignatureInfo['algorithm']> = new Set(['ed25519', 'rsa-sha256']);

export function validateSignatureShape(
  info: unknown,
): { ok: true } | { ok: false; errors: readonly string[] } {
  const errors: string[] = [];
  if (info === null || typeof info !== 'object') {
    return { ok: false, errors: ['signature: must be an object'] };
  }
  const rec = info as Record<string, unknown>;

  if (typeof rec.signer !== 'string' || rec.signer.length === 0) {
    errors.push('signer: must be a non-empty string');
  }
  if (typeof rec.algorithm !== 'string' || !ALLOWED_ALGORITHMS.has(rec.algorithm as SignatureInfo['algorithm'])) {
    errors.push(`algorithm: must be one of ${[...ALLOWED_ALGORITHMS].join(', ')}`);
  }
  if (typeof rec.signedAt !== 'string' || !ISO_DATE_PATTERN.test(rec.signedAt)) {
    errors.push('signedAt: must be an ISO-8601 date string');
  }
  if (typeof rec.payload !== 'string' || rec.payload.length === 0) {
    errors.push('payload: must be a non-empty string');
  }
  if (rec.publicKeyRef !== undefined && typeof rec.publicKeyRef !== 'string') {
    errors.push('publicKeyRef: must be a string when present');
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function assertValidSignature(info: SignatureInfo): void {
  const res = validateSignatureShape(info);
  if (!res.ok) {
    throw new TypeError(`invalid SignatureInfo shape: ${res.errors.join('; ')}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Decorators — no-ops that register metadata only
// ──────────────────────────────────────────────────────────────────────────────

/** Marks a Requirement/Feature class as reviewed by the named reviewer on the given date. */
export function Reviewed(reviewer: string, date: string): ClassDecorator {
  return function <T extends Function>(target: T): T {
    auditRegistry.push({
      className: target.name,
      change: 'Reviewed',
      actor: reviewer,
      date: date as IsoDate,
    });
    return target;
  };
}

/** Marks as approved by the named approver on the given date. */
export function ApprovedBy(approver: string, date: string): ClassDecorator {
  return function <T extends Function>(target: T): T {
    auditRegistry.push({
      className: target.name,
      change: 'ApprovedBy',
      actor: approver,
      date: date as IsoDate,
    });
    return target;
  };
}

/** Marks a class as signed off; runtime shape check on the signature envelope. */
export function SignedOff(info: SignatureInfo): ClassDecorator {
  assertValidSignature(info);
  return function <T extends Function>(target: T): T {
    auditRegistry.push({
      className: target.name,
      change: 'SignedOff',
      actor: info.signer,
      date: info.signedAt,
      signature: info,
    });
    return target;
  };
}

/** AC-level sign-off (method decorator). */
export function SignedOffAc(info: SignatureInfo): MethodDecorator {
  assertValidSignature(info);
  return function (target: object, propertyKey: string | symbol): void {
    auditRegistry.push({
      className: (target as { constructor: { name: string } }).constructor.name,
      acName: String(propertyKey),
      change: 'SignedOff',
      actor: info.signer,
      date: info.signedAt,
      signature: info,
    });
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Immutable history append
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns a NEW Spec with `entry` appended to `history`. Never mutates input.
 * Preserves the discriminant (`kind`) so the result stays a narrowed Feature
 * or Requirement spec for TypeScript consumers.
 */
export function appendHistoryEntry<S extends Spec>(spec: S, entry: HistoryEntry): S {
  const priorHistory = spec.history ?? [];
  // Spread to produce fresh object + fresh array — input untouched.
  return { ...spec, history: [...priorHistory, entry] } as S;
}
