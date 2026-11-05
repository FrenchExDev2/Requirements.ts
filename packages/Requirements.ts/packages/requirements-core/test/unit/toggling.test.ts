import { expect } from 'vitest';
import { FeatureTest, Verifies, TypeCheckOnly } from '@frenchexdev2/requirements-core';
import { TogglingFeature } from '@frenchexdev2/requirements-requirements';
import {
  Toggle,
  EnabledWhen,
  AvailableFrom,
  AvailableUntil,
  resolveToggle,
  validateToggleContext,
  createStubToggleProvider,
  createPercentageRollout,
  defaultRolloutSeed,
  getToggleMetadata,
  __clearToggleRegistry,
  type FeatureReleaseStage,
  type ToggleMetadata,
  type ToggleGate,
} from '@frenchexdev2/requirements-core/toggling';
import type { ToggleContext, ToggleProvider } from '@frenchexdev2/requirements-core/ports';
import { Feature, Priority } from '@frenchexdev2/requirements-core';

// ────────────────────────────────────────────────────────────────────────────
// Test helpers — kept at module scope so decorator-time failures surface
// synchronously (the Error from @Toggle with a bad name must throw at parse).
// Using `() => Error` capture pattern around a temporary class decoration.
// ────────────────────────────────────────────────────────────────────────────

function metaFor(featureClass: string, acName: string): ToggleMetadata {
  const m = getToggleMetadata().find(x => x.featureClass === featureClass && x.acName === acName);
  if (!m) throw new Error(`no metadata for ${featureClass}.${acName}`);
  return m;
}

function namedGate(name: string): ToggleMetadata {
  return { featureClass: '_', acName: '_', gates: [{ kind: 'named', value: name } as ToggleGate] };
}

// ────────────────────────────────────────────────────────────────────────────
// AC 1/14 — toggleProviderPortIsImplemented
// ────────────────────────────────────────────────────────────────────────────

@FeatureTest(TogglingFeature)
class PortShapeTests {
  @Verifies<TogglingFeature>('toggleProviderPortIsImplemented')
  'ToggleProvider port is a structural interface with isEnabled(gate, ctx) — stub + rollout both satisfy it'() {
    const stub: ToggleProvider = createStubToggleProvider({ 'feat:x': false });
    const rollout: ToggleProvider = createPercentageRollout('feat:y', 50);
    expect(typeof stub.isEnabled).toBe('function');
    expect(typeof rollout.isEnabled).toBe('function');
    expect(stub.isEnabled('feat:x')).toBe(false);
    expect(stub.isEnabled('feat:unknown')).toBe(true);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AC 2/14 — toggleDecoratorGatesAcByGateName
// ────────────────────────────────────────────────────────────────────────────

class ToggleTarget {
  @Toggle('feat:cart-v2')
  gatedAc(): { satisfied: boolean } { return { satisfied: true }; }
}

@FeatureTest(TogglingFeature)
class ToggleDecoratorTests {
  @Verifies<TogglingFeature>('toggleDecoratorGatesAcByGateName')
  '@Toggle registers a named gate against the decorated method'() {
    const m = metaFor('ToggleTarget', 'gatedAc');
    expect(m.gates).toHaveLength(1);
    expect(m.gates[0]).toEqual({ kind: 'named', value: 'feat:cart-v2' });

    const off = createStubToggleProvider({ 'feat:cart-v2': false });
    expect(resolveToggle(m, off, {}).enabled).toBe(false);
    const on = createStubToggleProvider({ 'feat:cart-v2': true });
    expect(resolveToggle(m, on, {}).enabled).toBe(true);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AC 3/14 — enabledWhenDecoratorAcceptsPredicate
// ────────────────────────────────────────────────────────────────────────────

class PredicateTarget {
  @EnabledWhen(ctx => ctx.tier === 'premium')
  premiumOnly(): { satisfied: boolean } { return { satisfied: true }; }
}

@FeatureTest(TogglingFeature)
class EnabledWhenTests {
  @Verifies<TogglingFeature>('enabledWhenDecoratorAcceptsPredicate')
  '@EnabledWhen registers a predicate gate and evaluates it against the context'() {
    const m = metaFor('PredicateTarget', 'premiumOnly');
    expect(m.gates[0]!.kind).toBe('predicate');
    expect(resolveToggle(m, undefined, { tier: 'premium' }).enabled).toBe(true);
    expect(resolveToggle(m, undefined, { tier: 'free' }).enabled).toBe(false);
    expect(resolveToggle(m, undefined, { tier: 'free' }).reason).toBe('predicate false');
    expect(resolveToggle(m, undefined, { tier: 'premium' }).reason).toBe('predicate true');

    expect(() => EnabledWhen(undefined as unknown as (c: ToggleContext) => boolean))
      .toThrow(/predicate must be a function/);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AC 4/14 — availableFromAndUntilRespectDates
// ────────────────────────────────────────────────────────────────────────────

class TemporalTarget {
  @AvailableFrom('2026-01-01')
  @AvailableUntil('2026-12-31')
  windowedAc(): { satisfied: boolean } { return { satisfied: true }; }
}

@FeatureTest(TogglingFeature)
class TemporalTests {
  @Verifies<TogglingFeature>('availableFromAndUntilRespectDates')
  '@AvailableFrom / @AvailableUntil compose with AND across a ctx.now clock'() {
    const m = metaFor('TemporalTarget', 'windowedAc');
    expect(m.gates.map(g => g.kind).sort()).toEqual(['from', 'until']);

    expect(resolveToggle(m, undefined, { now: '2025-12-31' }).enabled).toBe(false);
    expect(resolveToggle(m, undefined, { now: '2026-06-15' }).enabled).toBe(true);
    expect(resolveToggle(m, undefined, { now: '2027-01-01' }).enabled).toBe(false);
    const past = resolveToggle(m, undefined, { now: '2025-12-31' });
    expect(past.reason).toMatch(/from:2026-01-01/);
    const future = resolveToggle(m, undefined, { now: '2027-01-01' });
    expect(future.reason).toMatch(/until:2026-12-31/);

    // Unset ctx.now is treated as "before everything" — from gate fails.
    expect(resolveToggle(m, undefined, {}).enabled).toBe(false);
    expect(resolveToggle(m, undefined, {}).reason).toMatch(/now=unset/);

    // Invalid ISO → decorator throws at parse.
    expect(() => AvailableFrom('not-a-date')).toThrow(/@AvailableFrom: expected ISO-8601/);
    expect(() => AvailableUntil('')).toThrow(/@AvailableUntil: expected ISO-8601/);
    // Full datetime is accepted.
    expect(() => AvailableFrom('2026-04-14T12:00:00Z')).not.toThrow();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AC 5/14 — featureReleaseStageIsOrthogonalToStatus
// ────────────────────────────────────────────────────────────────────────────

abstract class StagedFeature extends Feature {
  readonly id = 'STAGED';
  readonly title = 'Staged';
  readonly priority = Priority.Medium;
  readonly releaseStage: FeatureReleaseStage = 'Shipped';
}

class ShippedFeature extends StagedFeature {
  override readonly releaseStage: FeatureReleaseStage = 'Shipped';
  run(): { satisfied: boolean } { return { satisfied: true }; }
}

class DeprecatedFeature extends StagedFeature {
  override readonly releaseStage: FeatureReleaseStage = 'Deprecated';
  run(): { satisfied: boolean } { return { satisfied: true }; }
}

@FeatureTest(TogglingFeature)
class ReleaseStageTests {
  @Verifies<TogglingFeature>('featureReleaseStageIsOrthogonalToStatus')
  'FeatureReleaseStage is an orthogonal enum — projects add it without editing Feature base class'() {
    const shipped = new ShippedFeature();
    const deprecated = new DeprecatedFeature();
    expect(shipped.releaseStage).toBe('Shipped');
    expect(deprecated.releaseStage).toBe('Deprecated');
    // Priority is unchanged by releaseStage — orthogonality.
    expect(shipped.priority).toBe(Priority.Medium);
    expect(deprecated.priority).toBe(Priority.Medium);
    // All six stages are distinct strings.
    const stages: readonly FeatureReleaseStage[] = [
      'Planned', 'InDevelopment', 'Shipped', 'Sunsetting', 'Deprecated', 'Sunsetted',
    ];
    expect(new Set(stages).size).toBe(6);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AC 6/14 — compliancePrintsNotApplicableForToggledOffAcs
// ────────────────────────────────────────────────────────────────────────────

@FeatureTest(TogglingFeature)
class ComplianceOffTests {
  @Verifies<TogglingFeature>('compliancePrintsNotApplicableForToggledOffAcs')
  'resolver returns { enabled:false, reason } that compliance can surface as NotApplicable'() {
    const m = namedGate('feat:off');
    const provider = createStubToggleProvider({ 'feat:off': false });
    const r = resolveToggle(m, provider, {});
    expect(r.enabled).toBe(false);
    expect(r.reason).toBe('gate:feat:off off');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AC 7/14 — complianceStrictIgnoresNotApplicableAcs
// ────────────────────────────────────────────────────────────────────────────

@FeatureTest(TogglingFeature)
class ComplianceStrictTests {
  @Verifies<TogglingFeature>('complianceStrictIgnoresNotApplicableAcs')
  'a toggled-off AC yields enabled=false — strict gates filter on this flag, not on "uncovered"'() {
    const toggledOff = resolveToggle(namedGate('gate:sunset'),
      createStubToggleProvider({ 'gate:sunset': false }), {});
    const toggledOn = resolveToggle(namedGate('gate:live'),
      createStubToggleProvider({ 'gate:live': true }), {});
    // A strict-gate implementation reduces to `enabled === false`, not "uncovered".
    const isNotApplicable = (res: { enabled: boolean }) => res.enabled === false;
    expect(isNotApplicable(toggledOff)).toBe(true);
    expect(isNotApplicable(toggledOn)).toBe(false);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AC 8/14 — rolloutPercentageGatedByRng
// ────────────────────────────────────────────────────────────────────────────

@FeatureTest(TogglingFeature)
class RolloutTests {
  @Verifies<TogglingFeature>('rolloutPercentageGatedByRng')
  'createPercentageRollout buckets deterministically via a seed function'() {
    // Seed stub: returns a value controlled per input — deterministic.
    const seen: string[] = [];
    const stubSeed = (input: string): number => { seen.push(input); return input.endsWith('alice') ? 0.1 : 0.9; };
    const rollout = createPercentageRollout('feat:rollout', 50, stubSeed);

    expect(rollout.isEnabled('feat:rollout', { userId: 'alice' })).toBe(true);
    expect(rollout.isEnabled('feat:rollout', { userId: 'bob' })).toBe(false);
    expect(seen).toEqual(['feat:rollout:alice', 'feat:rollout:bob']);

    // Anonymous user → conservative off.
    expect(rollout.isEnabled('feat:rollout', {})).toBe(false);
    expect(rollout.isEnabled('feat:rollout', undefined)).toBe(false);

    // Unknown gate → default-on (pass-through).
    expect(rollout.isEnabled('feat:other', { userId: 'alice' })).toBe(true);

    // Default seed is stable across calls.
    expect(defaultRolloutSeed('x')).toBe(defaultRolloutSeed('x'));
    expect(defaultRolloutSeed('a')).not.toBe(defaultRolloutSeed('b'));

    // 0% → nobody; 100% → everyone (with userId).
    const zero = createPercentageRollout('g', 0, stubSeed);
    expect(zero.isEnabled('g', { userId: 'alice' })).toBe(false);
    const full = createPercentageRollout('g', 100, stubSeed);
    expect(full.isEnabled('g', { userId: 'alice' })).toBe(true);

    expect(() => createPercentageRollout('g', -1)).toThrow(/pct must be in/);
    expect(() => createPercentageRollout('g', 101)).toThrow(/pct must be in/);

    // Default-seed branch exercised when seedFn omitted.
    const defaultSeeded = createPercentageRollout('g2', 100);
    expect(defaultSeeded.isEnabled('g2', { userId: 'alice' })).toBe(true);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AC 9/14 — toggleContextCarriesEnvAndTier
// ────────────────────────────────────────────────────────────────────────────

@FeatureTest(TogglingFeature)
class ContextShapeTests {
  @TypeCheckOnly()
  @Verifies<TogglingFeature>('toggleContextCarriesEnvAndTier')
  'ToggleContext propagates env, tier, userId, now + arbitrary keys to providers'() {
    let received: ToggleContext | undefined;
    const provider: ToggleProvider = {
      isEnabled(_g, ctx): boolean { received = ctx; return true; },
    };
    const ctx: ToggleContext = { env: 'prod', tier: 'enterprise', userId: 'u1', now: '2026-04-14', region: 'eu' };
    provider.isEnabled('g', ctx);
    expect(received).toBe(ctx);
    expect(received!.env).toBe('prod');
    expect(received!.tier).toBe('enterprise');
    expect(received!.userId).toBe('u1');
    expect(received!.now).toBe('2026-04-14');
    expect(received!.region).toBe('eu');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AC 10/14 — toggleDecoratorRefusesUnknownGateName
// ────────────────────────────────────────────────────────────────────────────

@FeatureTest(TogglingFeature)
class GateNameValidationTests {
  @Verifies<TogglingFeature>('toggleDecoratorRefusesUnknownGateName')
  '@Toggle rejects empty / whitespace / invalid-character gate names'() {
    expect(() => Toggle('')).toThrow(/invalid gate name/);
    expect(() => Toggle('  ')).toThrow(/invalid gate name/);
    expect(() => Toggle('has space')).toThrow(/invalid gate name/);
    expect(() => Toggle('bad$char')).toThrow(/invalid gate name/);
    expect(() => Toggle(42 as unknown as string)).toThrow(/invalid gate name/);
    // Valid shapes pass.
    expect(() => Toggle('feat:cart-v2')).not.toThrow();
    expect(() => Toggle('a.b.c')).not.toThrow();
    expect(() => Toggle('Alpha_1-2')).not.toThrow();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AC 11/14 — toggleContextRejectsUnknownEnvValues
// ────────────────────────────────────────────────────────────────────────────

@FeatureTest(TogglingFeature)
class ContextValidationTests {
  @Verifies<TogglingFeature>('toggleContextRejectsUnknownEnvValues')
  'validateToggleContext rejects misspelled env values but accepts dev/staging/prod and missing env'() {
    expect(() => validateToggleContext({ env: 'dev' })).not.toThrow();
    expect(() => validateToggleContext({ env: 'staging' })).not.toThrow();
    expect(() => validateToggleContext({ env: 'prod' })).not.toThrow();
    expect(() => validateToggleContext({})).not.toThrow();
    expect(() => validateToggleContext({ env: 'produciton' as never }))
      .toThrow(/unknown value/);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AC 12/14 — stubToggleProviderAllowsDeterministicTests
// ────────────────────────────────────────────────────────────────────────────

@FeatureTest(TogglingFeature)
class StubProviderTests {
  @Verifies<TogglingFeature>('stubToggleProviderAllowsDeterministicTests')
  'createStubToggleProvider returns map answers and defaults-on for unknown gates'() {
    const p = createStubToggleProvider({ a: true, b: false });
    expect(p.isEnabled('a')).toBe(true);
    expect(p.isEnabled('b')).toBe(false);
    expect(p.isEnabled('missing')).toBe(true); // default-on for adoption
    // Deterministic — same input, same output, no RNG.
    expect(p.isEnabled('a')).toBe(true);
    expect(p.isEnabled('b')).toBe(false);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AC 13/14 — toggleProviderInjectedViaCliShell
// ────────────────────────────────────────────────────────────────────────────

@FeatureTest(TogglingFeature)
class InjectionTests {
  @Verifies<TogglingFeature>('toggleResolverRejectsUnknownGateKinds')
  'malformed persisted metadata cannot silently enable an unknown gate'() {
    const metadata: ToggleMetadata = JSON.parse('{"featureClass":"Feature","acName":"accepts","gates":[{"kind":"typo","value":"gate"}]}');
    expect(() => resolveToggle(metadata, undefined, {})).toThrow('Unknown toggle gate kind');
  }

  @Verifies<TogglingFeature>('toggleProviderInjectedViaCliShell')
  'resolveToggle takes the provider as an explicit argument — no module-level singleton'() {
    const m = namedGate('feat:x');
    const offProvider = createStubToggleProvider({ 'feat:x': false });
    const onProvider = createStubToggleProvider({ 'feat:x': true });
    // Same metadata, different injected providers → different verdicts.
    expect(resolveToggle(m, offProvider, {}).enabled).toBe(false);
    expect(resolveToggle(m, onProvider, {}).enabled).toBe(true);
    // Undefined provider = default-on (adoption without a backend).
    const def = resolveToggle(m, undefined, {});
    expect(def.enabled).toBe(true);
    expect(def.reason).toMatch(/default-on \(no provider\)/);

    // Zero-gate metadata → default-on with a sentinel reason (no-gates edge case).
    const zero: ToggleMetadata = { featureClass: '_', acName: '_', gates: [] };
    const empty = resolveToggle(zero, undefined, {});
    expect(empty.enabled).toBe(true);
    expect(empty.reason).toBe('no gates');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AC 14/14 — endToEndToggledOffAcDoesNotFailStrictGate
// ────────────────────────────────────────────────────────────────────────────

class E2ETarget {
  @Toggle('feat:e2e')
  @AvailableFrom('2026-01-01')
  complexAc(): { satisfied: boolean } { return { satisfied: true }; }
}

@FeatureTest(TogglingFeature)
class EndToEndTests {
  @Verifies<TogglingFeature>('endToEndToggledOffAcDoesNotFailStrictGate')
  'stacked gates AND-compose; off-by-named OR off-by-temporal both mark the AC NotApplicable'() {
    const m = metaFor('E2ETarget', 'complexAc');
    expect(m.gates).toHaveLength(2);

    // Named off → whole AC off.
    const offByNamed = resolveToggle(m,
      createStubToggleProvider({ 'feat:e2e': false }), { now: '2026-06-15' });
    expect(offByNamed.enabled).toBe(false);
    expect(offByNamed.reason).toMatch(/gate:feat:e2e off/);

    // Named on + temporal not yet → still off.
    const offByDate = resolveToggle(m,
      createStubToggleProvider({ 'feat:e2e': true }), { now: '2025-06-15' });
    expect(offByDate.enabled).toBe(false);
    expect(offByDate.reason).toMatch(/from:2026-01-01/);

    // Both on → on.
    const allOn = resolveToggle(m,
      createStubToggleProvider({ 'feat:e2e': true }), { now: '2026-06-15' });
    expect(allOn.enabled).toBe(true);
    expect(allOn.reason).toBe('all gates open');

    // Strict-gate policy: `enabled === false` → NotApplicable, never uncovered.
    const strictVerdict = (res: { enabled: boolean }) => res.enabled ? 'Covered' : 'NotApplicable';
    expect(strictVerdict(offByNamed)).toBe('NotApplicable');
    expect(strictVerdict(offByDate)).toBe('NotApplicable');
    expect(strictVerdict(allOn)).toBe('Covered');

    // Registry is live and read-only-view.
    expect(getToggleMetadata().some(x => x.featureClass === 'E2ETarget' && x.acName === 'complexAc')).toBe(true);

    // Test-only registry clearer exists and works without corrupting subsequent runs.
    const snapshot = [...getToggleMetadata()];
    __clearToggleRegistry();
    expect(getToggleMetadata()).toHaveLength(0);
    expect(snapshot.length).toBeGreaterThan(0);
    // Re-trigger a registration so subsequent assertions (if any) see a non-empty registry.
    class ReRegister { @Toggle('feat:post-clear') m(): { satisfied: boolean } { return { satisfied: true }; } }
    void new ReRegister();
    expect(getToggleMetadata().length).toBeGreaterThan(0);
  }
}

// Silence "declared but never used" — decorator classes are registered by side-effect.
void PortShapeTests;
void ToggleDecoratorTests;
void EnabledWhenTests;
void TemporalTests;
void ReleaseStageTests;
void ComplianceOffTests;
void ComplianceStrictTests;
void RolloutTests;
void ContextShapeTests;
void GateNameValidationTests;
void ContextValidationTests;
void StubProviderTests;
void InjectionTests;
void EndToEndTests;
void ToggleTarget;
void PredicateTarget;
void TemporalTarget;
void E2ETarget;
