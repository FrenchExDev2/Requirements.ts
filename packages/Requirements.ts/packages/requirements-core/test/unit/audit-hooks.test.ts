/**
 * Audit-trail hooks — Tier-2 hook-only layer (REQ-AUDIT-TRAIL-HOOKS).
 * 8 ACs → 8 @Verifies methods. No describe/it.
 */

import { expect } from 'vitest';
import { FeatureTest, Verifies, TypeCheckOnly } from '@frenchexdev2/requirements-core';
import { AuditHooksFeature } from '@frenchexdev2/requirements-requirements';
import {
  Reviewed,
  ApprovedBy,
  SignedOff,
  SignedOffAc,
  validateSignatureShape,
  appendHistoryEntry,
  getAuditRegistry,
  type AuditEntry,
} from '@frenchexdev2/requirements-core/audit-hooks';
import type {
  ChangeKind,
  HistoryEntry,
  SignatureInfo,
  FeatureSpec,
  RequirementSpec,
  Spec,
} from '@frenchexdev2/requirements-core/types';
import { SCHEMA_VERSION } from '@frenchexdev2/requirements-core/types';
import { Priority } from '@frenchexdev2/requirements-core';

// ─── Reusable fixtures ──────────────────────────────────────────────────────

const goodSig: SignatureInfo = {
  signer: 'alice@example.com',
  algorithm: 'ed25519',
  signedAt: '2026-04-14T10:00:00Z' as SignatureInfo['signedAt'],
  payload: 'BASE64PAYLOAD==',
  publicKeyRef: 'key-2026-04',
};

const sampleFeatureSpec: FeatureSpec = {
  $schemaVersion: SCHEMA_VERSION,
  kind: 'feature',
  id: 'SAMPLE' as FeatureSpec['id'],
  title: 'Sample',
  priority: Priority.Medium,
  acs: [],
  history: [
    {
      date: '2026-04-10' as HistoryEntry['date'],
      author: 'author',
      change: 'Created',
      reason: 'init',
    },
  ],
};

function findAuditEntry(predicate: (e: AuditEntry) => boolean): AuditEntry | undefined {
  return getAuditRegistry().find(predicate);
}

// ─── Test class — every AC = one @Verifies method ───────────────────────────

@FeatureTest(AuditHooksFeature)
class AuditHooksTests {
  // AC1 — type-level
  @TypeCheckOnly()
  @Verifies<AuditHooksFeature>('changeKindUnionIncludesReviewedAndApprovedBy')
  'ChangeKind union includes Reviewed / ApprovedBy / SignedOff / RejectedBy and preserves legacy members'() {
    // Compile-time proof: the following literals must be assignable to ChangeKind.
    const extended: readonly ChangeKind[] = ['Reviewed', 'ApprovedBy', 'SignedOff', 'RejectedBy'];
    const legacy: readonly ChangeKind[] = ['Created', 'Deprecated', 'StatusChanged'];
    expect(extended).toContain('Reviewed');
    expect(extended).toContain('ApprovedBy');
    expect(extended).toContain('SignedOff');
    expect(extended).toContain('RejectedBy');
    expect(legacy).toContain('Created');
  }

  // AC2 — type-level
  @TypeCheckOnly()
  @Verifies<AuditHooksFeature>('historyEntryCarriesOptionalSignature')
  'HistoryEntry accepts entries with AND without a signature field'() {
    const withoutSig: HistoryEntry = {
      date: '2026-04-14' as HistoryEntry['date'],
      author: 'bob',
      change: 'Created',
      reason: 'legacy-shape',
    };
    const withSig: HistoryEntry = {
      date: '2026-04-14' as HistoryEntry['date'],
      author: 'alice',
      change: 'SignedOff',
      reason: 'sign-off',
      signature: goodSig,
    };
    expect(withoutSig.signature).toBeUndefined();
    expect(withSig.signature).toEqual(goodSig);
    // Optional field: omission must NOT be a type error at read sites.
    const probe: SignatureInfo | undefined = withoutSig.signature;
    expect(probe).toBeUndefined();
  }

  // AC3 — validateSignatureShape discriminates ed25519 | rsa-sha256
  @Verifies<AuditHooksFeature>('signatureShapeIsEd25519OrRsaSha256')
  'validateSignatureShape accepts ed25519 and rsa-sha256 and rejects other algorithms / bad shapes'() {
    expect(validateSignatureShape(goodSig)).toEqual({ ok: true });
    expect(validateSignatureShape({ ...goodSig, algorithm: 'rsa-sha256' })).toEqual({ ok: true });

    // Without the optional publicKeyRef — still ok.
    const { publicKeyRef: _unused, ...minimal } = goodSig;
    void _unused;
    expect(validateSignatureShape(minimal)).toEqual({ ok: true });

    // Wrong algorithm.
    const wrongAlgo = validateSignatureShape({ ...goodSig, algorithm: 'md5' });
    expect(wrongAlgo.ok).toBe(false);
    if (!wrongAlgo.ok) expect(wrongAlgo.errors.some(e => e.startsWith('algorithm:'))).toBe(true);

    // Missing fields.
    const missing = validateSignatureShape({ signer: '', algorithm: 'ed25519', signedAt: 'nope', payload: '' });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.errors.some(e => e.startsWith('signer:'))).toBe(true);
      expect(missing.errors.some(e => e.startsWith('signedAt:'))).toBe(true);
      expect(missing.errors.some(e => e.startsWith('payload:'))).toBe(true);
    }

    // Non-object inputs.
    expect(validateSignatureShape(null).ok).toBe(false);
    expect(validateSignatureShape('string').ok).toBe(false);
    expect(validateSignatureShape(42).ok).toBe(false);

    // publicKeyRef wrong type.
    const badKeyRef = validateSignatureShape({ ...goodSig, publicKeyRef: 123 });
    expect(badKeyRef.ok).toBe(false);
    if (!badKeyRef.ok) expect(badKeyRef.errors.some(e => e.startsWith('publicKeyRef:'))).toBe(true);
  }

  // AC4 — @Reviewed + @ApprovedBy register metadata only, return class untouched
  @Verifies<AuditHooksFeature>('reviewedDecoratorExistsAsNoOp')
  '@Reviewed and @ApprovedBy register an AuditEntry without altering the target class'() {
    class ReviewedTarget { readonly m = 'v'; }
    const Returned = Reviewed('carol', '2026-04-12')(ReviewedTarget);
    expect(Returned).toBe(ReviewedTarget);
    expect(new ReviewedTarget().m).toBe('v'); // unchanged instance shape

    const reviewEntry = findAuditEntry(e => e.className === 'ReviewedTarget' && e.change === 'Reviewed');
    expect(reviewEntry).toBeDefined();
    expect(reviewEntry!.actor).toBe('carol');
    expect(reviewEntry!.date).toBe('2026-04-12');
    expect(reviewEntry!.signature).toBeUndefined();

    class ApprovedTarget {}
    ApprovedBy('dave', '2026-04-13')(ApprovedTarget);
    const appEntry = findAuditEntry(e => e.className === 'ApprovedTarget' && e.change === 'ApprovedBy');
    expect(appEntry).toBeDefined();
    expect(appEntry!.actor).toBe('dave');
  }

  // AC5 — @SignedOff (class + method flavour) — runtime shape check + no-op
  @Verifies<AuditHooksFeature>('signedOffDecoratorExistsAsNoOp')
  '@SignedOff registers signed metadata, validates shape, @SignedOffAc works on methods'() {
    class SignedClass {}
    const Returned = SignedOff(goodSig)(SignedClass);
    expect(Returned).toBe(SignedClass);
    const classEntry = findAuditEntry(e => e.className === 'SignedClass' && e.change === 'SignedOff' && !e.acName);
    expect(classEntry).toBeDefined();
    expect(classEntry!.actor).toBe(goodSig.signer);
    expect(classEntry!.signature).toEqual(goodSig);

    // Bad shape rejected at decoration time.
    expect(() => SignedOff({ ...goodSig, algorithm: 'nope' } as unknown as SignatureInfo)).toThrow(/invalid SignatureInfo/);
    expect(() => SignedOffAc({ ...goodSig, signedAt: 'bad-date' } as unknown as SignatureInfo)).toThrow(/invalid SignatureInfo/);

    // AC-level sign-off via @SignedOffAc.
    class AcTarget {
      foo() { /* ac */ }
    }
    SignedOffAc(goodSig)(AcTarget.prototype, 'foo', Object.getOwnPropertyDescriptor(AcTarget.prototype, 'foo')!);
    const acEntry = findAuditEntry(e => e.className === 'AcTarget' && e.acName === 'foo');
    expect(acEntry).toBeDefined();
    expect(acEntry!.change).toBe('SignedOff');
    expect(acEntry!.signature).toEqual(goodSig);
  }

  // AC6 — appendHistoryEntry is immutable
  @Verifies<AuditHooksFeature>('historyAppendIsImmutable')
  'appendHistoryEntry returns a new Spec with the entry appended and leaves input untouched'() {
    const beforeSnapshot = JSON.stringify(sampleFeatureSpec);
    const originalHistoryRef = sampleFeatureSpec.history;
    const newEntry: HistoryEntry = {
      date: '2026-04-14' as HistoryEntry['date'],
      author: 'alice',
      change: 'Reviewed',
      reason: 'peer-review',
    };
    const next = appendHistoryEntry(sampleFeatureSpec, newEntry);

    // Input unchanged.
    expect(JSON.stringify(sampleFeatureSpec)).toBe(beforeSnapshot);
    expect(sampleFeatureSpec.history).toBe(originalHistoryRef);
    expect(sampleFeatureSpec.history!.length).toBe(1);

    // Output has entry appended, different identities.
    expect(next).not.toBe(sampleFeatureSpec);
    expect(next.history).not.toBe(sampleFeatureSpec.history);
    expect(next.history!.length).toBe(2);
    expect(next.history![1]).toEqual(newEntry);

    // Also works when history is undefined on input.
    const minimal: FeatureSpec = {
      $schemaVersion: SCHEMA_VERSION,
      kind: 'feature',
      id: 'NOHIST' as FeatureSpec['id'],
      title: 't',
      priority: Priority.Low,
      acs: [],
    };
    const seeded = appendHistoryEntry(minimal, newEntry);
    expect(minimal.history).toBeUndefined();
    expect(seeded.history).toEqual([newEntry]);
  }

  // AC7 — backward compat: old HistoryEntry shape (no signature field) still parses
  @TypeCheckOnly()
  @Verifies<AuditHooksFeature>('existingHistorySerialisationStaysBackwardCompatible')
  'pre-hook HistoryEntry JSON (no signature field) round-trips unchanged'() {
    const legacyJson = '{"date":"2026-04-01","author":"x","change":"Created","reason":"legacy"}';
    const parsed: HistoryEntry = JSON.parse(legacyJson) as HistoryEntry;
    expect(parsed.signature).toBeUndefined();
    expect(parsed.change).toBe('Created');

    // Round-trip: re-serialising must NOT inject a signature key.
    const reserialised = JSON.stringify(parsed);
    expect(reserialised).toBe(legacyJson);
    expect(reserialised).not.toContain('signature');

    // Legacy ChangeKind values remain valid members of the union.
    const legacyKinds: ChangeKind[] = ['Created', 'StatusChanged', 'Deprecated'];
    for (const k of legacyKinds) {
      expect(typeof k).toBe('string');
    }
  }

  // AC8 — end-to-end: signed HistoryEntry round-trips through JSON inside a Spec
  @Verifies<AuditHooksFeature>('endToEndSignedHistoryEntryRoundTripsThroughSpecJson')
  'a signed HistoryEntry survives JSON.stringify → JSON.parse inside a full Spec'() {
    const reqSpec: RequirementSpec = {
      $schemaVersion: SCHEMA_VERSION,
      kind: 'requirement',
      id: 'REQ-SAMPLE' as RequirementSpec['id'],
      title: 'sample',
      statement: { pattern: 'ubiquitous', response: 'always works.' as Extract<RequirementSpec['statement'], { pattern: 'ubiquitous' }>['response'] },
      requirementKind: 'Constraint',
      priority: Priority.Medium,
      status: 'Draft',
      source: { type: 'standard', org: 'US FDA', id: '21-CFR-11' },
      rationale: {
        claim: 'immutable sign-off trail.' as RequirementSpec['rationale']['claim'],
        kind: 'regulatory-compliance',
        evidence: [],
      },
      fitCriteria: [],
      verificationMethod: 'Inspection',
      risk: { level: 'Medium', ifNotMet: 'audit fails.' as RequirementSpec['risk']['ifNotMet'] },
      satisfiedBy: [],
    };

    const signedEntry: HistoryEntry = {
      date: '2026-04-14' as HistoryEntry['date'],
      author: goodSig.signer,
      change: 'SignedOff',
      reason: 'tier-2 sign-off hook',
      signature: goodSig,
    };
    const signed: Spec = appendHistoryEntry(reqSpec, signedEntry);

    const wire = JSON.stringify(signed);
    expect(wire).toContain('"signature"');
    expect(wire).toContain('"ed25519"');

    const restored = JSON.parse(wire) as Spec;
    expect(restored.history).toBeDefined();
    expect(restored.history!.length).toBe(1);
    const restoredEntry = restored.history![0]!;
    expect(restoredEntry.signature).toEqual(goodSig);
    expect(restoredEntry.change).toBe('SignedOff');

    // And the restored signature still passes shape validation.
    expect(validateSignatureShape(restoredEntry.signature)).toEqual({ ok: true });
  }
}

void AuditHooksTests;
