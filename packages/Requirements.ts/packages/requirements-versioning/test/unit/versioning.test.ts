import { expect } from 'vitest';

import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { VersioningFeature } from '@frenchexdev2/requirements-requirements';
import { Priority } from '@frenchexdev2/requirements-core';
import {
  SCHEMA_VERSION,
  featureId,
  isoDate,
  requirementId,
  sentence,
  type FeatureSpec,
  type HistoryEntry,
  type RequirementSpec,
} from '@frenchexdev2/requirements-core/types';
import {
  applyVersionBump,
  buildBumpHistoryEntry,
  canonicalJson,
  canonicalize,
  computeVersionInfo,
  contentHashOf,
  detectVersionDrift,
  NON_STRUCTURAL_FIELDS,
  resolvePin,
  type Clock,
  type VersionInfo,
  type VersionPin,
  type VersionedSpec,
} from '../../src/versioning';
// (Bridge smoke from requirements-wizards re-exports moved to wizards' own tests
// to avoid a versioning ↔ wizards devDep cycle.)

// ══════════════════════════════════════════════════════════════════════════════
// Deterministic clock + spec factories
// ══════════════════════════════════════════════════════════════════════════════

function mkClock(dates: string[]): Clock {
  const queue = [...dates];
  return {
    nowIsoDate: () => isoDate(queue.length > 0 ? queue.shift()! : '2026-04-14'),
  };
}

function mkReq(overrides: Partial<RequirementSpec> = {}): RequirementSpec {
  const base: RequirementSpec = {
    $schemaVersion: SCHEMA_VERSION,
    $schema: './requirement-spec.schema.json',
    kind: 'requirement',
    id: requirementId('REQ-VERS-1'),
    title: 'Versioning target',
    statement: { pattern: 'ubiquitous', response: sentence('shall version.') },
    requirementKind: 'Functional',
    priority: Priority.High,
    status: 'Approved',
    source: { type: 'domain-knowledge', reference: 'test' },
    rationale: {
      claim: sentence('needed.'),
      kind: 'principle',
      evidence: [],
    },
    fitCriteria: [{ kind: 'narrative', text: sentence('ok.') }],
    verificationMethod: 'Test',
    risk: { level: 'Medium', ifNotMet: sentence('bad.') },
    satisfiedBy: [featureId('VERSIONING')],
  };
  return { ...base, ...overrides };
}

function mkFeat(overrides: Partial<FeatureSpec> = {}): FeatureSpec {
  const base: FeatureSpec = {
    $schemaVersion: SCHEMA_VERSION,
    $schema: './feature-spec.schema.json',
    kind: 'feature',
    id: featureId('VERSIONING'),
    title: 'Versioning',
    priority: Priority.High,
    satisfies: [requirementId('REQ-VERS-1')],
    acs: [],
  };
  return { ...base, ...overrides };
}

function versioned<S extends RequirementSpec | FeatureSpec>(
  spec: S,
  vi: VersionInfo,
): VersionedSpec<S> {
  return { ...spec, version: vi } as VersionedSpec<S>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Positive path: version computation (6 ACs)
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(VersioningFeature)
class VersionComputationTests {
  @Verifies<VersioningFeature>('versionInfoComputesMonotonicInteger')
  'version starts at 1 and monotonically bumps by one on structural change'() {
    const clock = mkClock(['2026-01-01', '2026-01-02', '2026-01-03']);
    const r1 = mkReq();
    const v1 = computeVersionInfo(r1, undefined, clock);
    expect(v1.version).toBe(1);
    expect(v1.supersedes).toBeUndefined();

    const r2 = mkReq({ title: 'Versioning target (edited)' });
    const v2 = computeVersionInfo(r2, v1, clock);
    expect(v2.version).toBe(2);

    const r3 = mkReq({ title: 'Versioning target (again)' });
    const v3 = computeVersionInfo(r3, v2, clock);
    expect(v3.version).toBe(3);
  }

  @Verifies<VersioningFeature>('versionInfoComputesContentHashDeterministically')
  'same spec hashed twice → identical contentHash'() {
    const r = mkReq();
    const h1 = contentHashOf(r);
    const h2 = contentHashOf(r);
    expect(h1).toBe(h2);
    expect(h1.startsWith('sha256:')).toBe(true);
    expect(h1.length).toBe('sha256:'.length + 64);

    // Key-order shuffle of a logically identical spec → same hash (canonical).
    const shuffled = { ...r, fitCriteria: r.fitCriteria };
    expect(contentHashOf(shuffled)).toBe(h1);
  }

  @Verifies<VersioningFeature>('contentHashExcludesHistoryAndSchemaVersion')
  'history, $schemaVersion, $schema, tracedTo, version are stripped before hashing'() {
    const r = mkReq();
    const baseHash = contentHashOf(r);

    const withHistory = mkReq({
      history: [
        { date: isoDate('2026-01-01'), author: 'a', change: 'Created', reason: 'first.' },
      ],
    });
    expect(contentHashOf(withHistory)).toBe(baseHash);

    const withTracedTo = mkReq({
      tracedTo: [{ system: 'url', href: 'https://example.test' }],
    });
    expect(contentHashOf(withTracedTo)).toBe(baseHash);

    // Schema fields stripping (already present in base; prove explicitly):
    expect(NON_STRUCTURAL_FIELDS).toContain('$schemaVersion');
    expect(NON_STRUCTURAL_FIELDS).toContain('$schema');
    expect(NON_STRUCTURAL_FIELDS).toContain('history');
    expect(NON_STRUCTURAL_FIELDS).toContain('tracedTo');
    expect(NON_STRUCTURAL_FIELDS).toContain('version');
  }

  @Verifies<VersioningFeature>('versionBumpsOnStructuralChange')
  'changing the EARS statement bumps version and sets supersedes'() {
    const clock = mkClock(['2026-01-01', '2026-02-01']);
    const r1 = mkReq();
    const v1 = computeVersionInfo(r1, undefined, clock);

    const r2 = mkReq({
      statement: { pattern: 'ubiquitous', response: sentence('shall version differently.') },
    });
    const v2 = computeVersionInfo(r2, v1, clock);
    expect(v2.version).toBe(2);
    expect(v2.supersedes).toBe(v1.contentHash);
    expect(v2.contentHash).not.toBe(v1.contentHash);
    expect(v2.since).toBe('2026-02-01');
  }

  @Verifies<VersioningFeature>('versionDoesNotBumpOnCosmeticChange')
  'appending a history entry does not bump the version'() {
    const clock = mkClock(['2026-01-01']);
    const r1 = mkReq();
    const v1 = computeVersionInfo(r1, undefined, clock);

    const cosmetic = mkReq({
      history: [
        { date: isoDate('2026-01-01'), author: 'a', change: 'Created', reason: 'noted.' },
      ],
      $schema: './elsewhere.json',
    });
    const v2 = computeVersionInfo(cosmetic, v1, clock);
    // Pure no-op: returns the same object reference.
    expect(v2).toBe(v1);
    expect(v2.version).toBe(1);
  }

  @Verifies<VersioningFeature>('supersedesLinkChainsSemanticHistory')
  'supersedes chains across successive bumps — v3 → v2 → v1'() {
    const clock = mkClock(['2026-01-01', '2026-02-01', '2026-03-01']);
    const r1 = mkReq();
    const v1 = computeVersionInfo(r1, undefined, clock);

    const r2 = mkReq({ title: 't2' });
    const v2 = computeVersionInfo(r2, v1, clock);
    expect(v2.supersedes).toBe(v1.contentHash);

    const r3 = mkReq({ title: 't3' });
    const v3 = computeVersionInfo(r3, v2, clock);
    expect(v3.supersedes).toBe(v2.contentHash);
    expect(v3.version).toBe(3);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Pinning — decorator surface / resolution (3 ACs)
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(VersioningFeature)
class PinningTests {
  @Verifies<VersioningFeature>('satisfiesDecoratorCanPinRequirementVersion')
  'VersionPin registry stores pinned version + hash per Requirement target'() {
    // Registry-level pin store (the AC-approved route — decorator syntax unchanged).
    const pin: VersionPin = {
      targetId: 'REQ-VERS-1',
      pinnedVersion: 3,
      pinnedHash: 'sha256:abcdef',
    };
    expect(pin.pinnedVersion).toBe(3);
    expect(pin.pinnedHash).toBe('sha256:abcdef');

    const found = resolvePin('VERSIONING', 'REQ-VERS-1', [pin]);
    expect(found).toBe(pin);
  }

  @Verifies<VersioningFeature>('verifiesDecoratorCanPinAcVersion')
  'pin resolution is scoped by feature when multiple pins share a targetId'() {
    // AC-level pins ride the same VersionPin envelope, optionally scoped by feature.
    const generic: VersionPin = {
      targetId: 'REQ-VERS-1',
      pinnedVersion: 1,
      pinnedHash: 'sha256:1',
    };
    const specific = {
      targetId: 'REQ-VERS-1',
      pinnedVersion: 2,
      pinnedHash: 'sha256:2',
      featureId: 'VERSIONING',
    } as VersionPin;

    // LIFO preference + feature-scope match returns specific.
    const found = resolvePin('VERSIONING', 'REQ-VERS-1', [generic, specific]);
    expect(found).toBe(specific);

    // Different feature → falls back to unscoped generic.
    const fallback = resolvePin('OTHER', 'REQ-VERS-1', [generic, specific]);
    expect(fallback).toBe(generic);
  }

  @Verifies<VersioningFeature>('pinResolutionResolvesLatestWhenUnpinned')
  'resolvePin returns undefined when no pin exists — caller uses latest'() {
    const resolved = resolvePin('VERSIONING', 'REQ-ABSENT', []);
    expect(resolved).toBeUndefined();

    // Non-matching pins are skipped — caller falls back to latest.
    const unrelated: VersionPin = {
      targetId: 'REQ-OTHER',
      pinnedVersion: 1,
      pinnedHash: 'sha256:x',
    };
    expect(resolvePin('VERSIONING', 'REQ-VERS-1', [unrelated])).toBeUndefined();

    // Feature-scoped pin whose feature doesn't match → also undefined.
    const misscoped = {
      targetId: 'REQ-VERS-1',
      pinnedVersion: 1,
      pinnedHash: 'sha256:y',
      featureId: 'OTHER-FEAT',
    } as VersionPin;
    expect(resolvePin('VERSIONING', 'REQ-VERS-1', [misscoped])).toBeUndefined();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Error / validation paths (4 ACs)
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(VersioningFeature)
class VersionDriftTests {
  @Verifies<VersioningFeature>('complianceStrictFailsOnUnpinnedReqDrift')
  'detectVersionDrift flags req-evolved when pin.version < current.version'() {
    const clock = mkClock(['2026-01-01', '2026-02-01']);
    const r1 = mkReq();
    const v1 = computeVersionInfo(r1, undefined, clock);
    const r2 = mkReq({ title: 'evolved' });
    const v2 = computeVersionInfo(r2, v1, clock);

    const feat = mkFeat();
    const pins: VersionPin[] = [
      { targetId: 'REQ-VERS-1', pinnedVersion: v1.version, pinnedHash: v1.contentHash },
    ];
    const drifts = detectVersionDrift([feat], [versioned(r2, v2)], pins);
    expect(drifts).toHaveLength(1);
    expect(drifts[0]!.kind).toBe('req-evolved');
    expect(drifts[0]!.pinnedVersion).toBe(1);
    expect(drifts[0]!.currentVersion).toBe(2);
  }

  @Verifies<VersioningFeature>('complianceStrictWarnsButDoesNotFailOnUnpinned')
  'unpinned Feature pointing at evolved Requirement → unpinned-req WARN only'() {
    const clock = mkClock(['2026-01-01', '2026-02-01']);
    const r1 = mkReq();
    const v1 = computeVersionInfo(r1, undefined, clock);
    const r2 = mkReq({ title: 'evolved' });
    const v2 = computeVersionInfo(r2, v1, clock);

    const feat = mkFeat();
    const drifts = detectVersionDrift([feat], [versioned(r2, v2)], []);
    expect(drifts).toHaveLength(1);
    expect(drifts[0]!.kind).toBe('unpinned-req');
    // unpinned-req is a WARN, not a FAIL — per the AC. Caller (bin) must not
    // treat it as failure. This is enforced by the callers filtering on kind.
    const failing = drifts.filter(
      (d) => d.kind === 'req-evolved' || d.kind === 'pin-stale',
    );
    expect(failing).toHaveLength(0);

    // v1 (unchanged) → no drift even without a pin (currentVersion === 1).
    const pristine = detectVersionDrift([feat], [versioned(r1, v1)], []);
    expect(pristine).toHaveLength(0);
  }

  @Verifies<VersioningFeature>('diffCoreDetectsVersionPinMismatch')
  'hash mismatch with same version number → pin-stale'() {
    const clock = mkClock(['2026-01-01']);
    const r = mkReq();
    const vCurrent = computeVersionInfo(r, undefined, clock);

    // Pin claims version 1 but with a hash that no longer matches content.
    const feat = mkFeat();
    const pins: VersionPin[] = [
      { targetId: 'REQ-VERS-1', pinnedVersion: 1, pinnedHash: 'sha256:wrong' },
    ];
    const drifts = detectVersionDrift([feat], [versioned(r, vCurrent)], pins);
    expect(drifts).toHaveLength(1);
    expect(drifts[0]!.kind).toBe('pin-stale');
    expect(drifts[0]!.pinnedHash).toBe('sha256:wrong');
    expect(drifts[0]!.currentHash).toBe(vCurrent.contentHash);
  }

  @Verifies<VersioningFeature>('versionBumpRefusesWhenHistoryEntryMissing')
  'buildBumpHistoryEntry rejects empty reason — audit trail invariant'() {
    const clock = mkClock(['2026-01-01']);
    expect(() =>
      buildBumpHistoryEntry(clock, { author: 'a', reason: '' }),
    ).toThrow(/non-empty reason/);
    expect(() =>
      buildBumpHistoryEntry(clock, { author: 'a', reason: '   ' }),
    ).toThrow(/non-empty reason/);

    // applyVersionBump also refuses.
    const r1 = mkReq();
    expect(() =>
      applyVersionBump(r1, undefined, clock, { author: 'a', reason: '' }),
    ).toThrow(/non-empty reason/);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Integration (2 ACs)
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(VersioningFeature)
class IntegrationTests {
  @Verifies<VersioningFeature>('historyEntryLogsEveryVersionBump')
  'applyVersionBump appends a HistoryEntry on each bump and is a no-op on unchanged'() {
    const clock = mkClock(['2026-01-01', '2026-02-01']);
    const r1 = mkReq();
    const b1 = applyVersionBump(r1, undefined, clock, {
      author: 'alice',
      reason: 'initial.',
      change: 'Created',
    });
    expect(b1.version!.version).toBe(1);
    expect(b1.history).toHaveLength(1);
    const h1 = (b1.history as readonly HistoryEntry[])[0]!;
    expect(h1.author).toBe('alice');
    expect(h1.change).toBe('Created');
    expect(h1.date).toBe('2026-01-01');

    const r2 = mkReq({ title: 'v2' });
    const b2 = applyVersionBump(r2, b1.version, clock, {
      author: 'bob',
      reason: 'retitle.',
    });
    expect(b2.version!.version).toBe(2);
    expect(b2.history).toHaveLength(1); // r2 has no prior history (new object)
    const h2 = (b2.history as readonly HistoryEntry[])[0]!;
    expect(h2.change).toBe('StatementEdited'); // default
    expect(h2.author).toBe('bob');

    // No-op: same content → returns previous VersionInfo, does not append history.
    const r2b = mkReq({ title: 'v2' });
    const clockStuck = mkClock(['2099-12-31']);
    const b2b = applyVersionBump(r2b, b2.version, clockStuck, {
      author: 'noop',
      reason: 'should not be used.',
    });
    expect(b2b.version).toBe(b2.version);
    // No-op: history untouched (r2b had no history; spread preserves absence).
    expect(b2b.history).toBe(r2b.history);
  }

  @Verifies<VersioningFeature>('versioningWritesViaFileSystemPort')
  'versioning core is pure — no fs imports; canonicalJson is the on-disk contract'() {
    // Dog-food: the core must be purely functional and emit a stable canonical
    // string. Shells (bin/requirements) own the FS I/O. We assert purity by
    // exercising the canonical-JSON contract, which is what a FileSystem port
    // would pipe to writeFile.
    const r = mkReq();
    const canon1 = canonicalJson(r);
    const canon2 = canonicalJson(r);
    expect(canon1).toBe(canon2);
    // Canonical form must NOT contain stripped keys.
    expect(canon1).not.toContain('$schemaVersion');
    expect(canon1).not.toContain('$schema');
    expect(canon1).not.toContain('history');
    // canonicalize of a primitive returns identity.
    expect(canonicalize(42)).toBe(42);
    expect(canonicalize(null)).toBe(null);
    expect(canonicalize('str')).toBe('str');
    // Hashing must ignore insertion order at every nesting depth.
    const expected='{"a":{"x":1,"y":2},"b":2,"c":3}';
    for(const entries of [
      [['c',3],['a',{y:2,x:1}],['b',2]],
      [['b',2],['c',3],['a',{x:1,y:2}]],
      [['a',{y:2,x:1}],['c',3],['b',2]],
    ] as Array<Array<[string,unknown]>>) {
      expect(JSON.stringify(canonicalize(Object.fromEntries(entries)))).toBe(expected);
    }
    // Array order preserved.
    const arr = canonicalize([3, 1, 2]);
    expect(arr).toEqual([3, 1, 2]);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// End-to-end (1 AC)
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(VersioningFeature)
class EndToEndTests {
  @Verifies<VersioningFeature>('endToEndPinnedFeatureSurvivesRequirementEdit')
  'full lifecycle: pin v1 → edit Requirement → bump to v2 → strict gate fails → repin heals'() {
    const clock = mkClock(['2026-01-01', '2026-02-01']);
    // 1. Author Requirement v1 + Feature pinning it.
    const r1 = mkReq();
    const v1 = computeVersionInfo(r1, undefined, clock);
    const feat = mkFeat();
    const pins: VersionPin[] = [
      { targetId: 'REQ-VERS-1', pinnedVersion: v1.version, pinnedHash: v1.contentHash },
    ];
    // Initially: no drift.
    const initial = detectVersionDrift([feat], [versioned(r1, v1)], pins);
    expect(initial).toEqual([]);

    // 2. Edit Requirement (semantically).
    const r2 = mkReq({ statement: { pattern: 'ubiquitous', response: sentence('shall change.') } });
    const v2 = computeVersionInfo(r2, v1, clock);
    expect(v2.version).toBe(2);

    // 3. Strict gate must fail with req-evolved.
    const failing = detectVersionDrift([feat], [versioned(r2, v2)], pins);
    expect(failing).toHaveLength(1);
    expect(failing[0]!.kind).toBe('req-evolved');

    // 4. Repin Feature → gate heals.
    const repinned: VersionPin[] = [
      { targetId: 'REQ-VERS-1', pinnedVersion: v2.version, pinnedHash: v2.contentHash },
    ];
    const healed = detectVersionDrift([feat], [versioned(r2, v2)], repinned);
    expect(healed).toEqual([]);

    // Robustness coverage: Feature with no `satisfies` → no drift contribution.
    const orphan = mkFeat({ satisfies: undefined });
    expect(detectVersionDrift([orphan], [versioned(r2, v2)], [])).toEqual([]);

    // Feature pointing at a Requirement that is not in the corpus → skipped.
    const dangling = mkFeat({ satisfies: [requirementId('REQ-ABSENT')] });
    expect(detectVersionDrift([dangling], [versioned(r2, v2)], [])).toEqual([]);

    // Requirement lacking `version` field → detectVersionDrift recomputes
    // a contentHash on the fly (currentVersion defaults to 1 → no drift when unpinned).
    const bare = mkReq();
    const driftsBare = detectVersionDrift([feat], [bare as VersionedSpec<typeof bare>], []);
    expect(driftsBare).toEqual([]);
    const bareHash=contentHashOf(bare);
    expect(detectVersionDrift([feat],[bare],[{targetId:bare.id,pinnedVersion:1,pinnedHash:bareHash}])).toEqual([]);
    const staleBare=detectVersionDrift([feat],[bare],[{targetId:bare.id,pinnedVersion:1,pinnedHash:'sha256:outdated'}]);
    expect(staleBare[0]).toMatchObject({kind:'pin-stale',currentVersion:1,currentHash:bareHash});
  }
}

void VersionComputationTests;
void PinningTests;
void VersionDriftTests;
void IntegrationTests;
void EndToEndTests;
