/**
 * Orthogonal feature-flag / AC toggling.
 *
 * Problem — continuous-delivery shops ship behind rollout gates; a traceability
 * DSL that conflates "intentionally off in this env" with "missing test" is
 * unusable in production pipelines (see `req-orthogonal-toggling.ts`).
 *
 * Solution — a `ToggleProvider` port (in `ports/external.ts`) plus four method
 * decorators that annotate an AC with one or more *gates*:
 *
 *   - `@Toggle(gateName)`           — provider-driven, named gate
 *   - `@EnabledWhen(ctx => …)`      — inline predicate
 *   - `@AvailableFrom('2026-…')`    — temporal lower bound
 *   - `@AvailableUntil('2026-…')`   — temporal upper bound
 *
 * Semantics — multiple gates on the same AC compose with AND; a missing
 * provider defaults-on for `@Toggle` (adoption without a backend); the
 * resolver returns a `{ enabled, reason }` pair so compliance can print the
 * *why* next to the `NotApplicable` tag.
 *
 * Orthogonality — `FeatureReleaseStage` lives alongside `Priority` and the
 * Requirement `status` workflow without replacing either: a Shipped feature
 * can still be toggled off in a given context, and a Deprecated feature can
 * still be toggled on for a bug-fix cohort.
 */

import type { ToggleContext, ToggleEnv, ToggleProvider } from './ports/index.js';
import { KNOWN_TOGGLE_ENVS } from './ports/index.js';

// ────────────────────────────────────────────────────────────────────────────
// FeatureReleaseStage — orthogonal to status, orthogonal to Priority.
// Projects opt in voluntarily by declaring
//   readonly releaseStage: FeatureReleaseStage = 'Shipped';
// on their Feature subclasses. We do NOT patch the Feature base class.
// ────────────────────────────────────────────────────────────────────────────

// Derive the union FROM the tuple so they cannot drift. Adding / renaming a
// stage means editing exactly one place; the union updates automatically.
export const FEATURE_RELEASE_STAGES = [
  'Planned', 'InDevelopment', 'Shipped', 'Sunsetting', 'Deprecated', 'Sunsetted',
] as const;

export type FeatureReleaseStage = typeof FEATURE_RELEASE_STAGES[number];

// ────────────────────────────────────────────────────────────────────────────
// Gate algebra — four kinds, all reduced to a boolean against a ToggleContext.
// ────────────────────────────────────────────────────────────────────────────

export type ToggleGate =
  | { readonly kind: 'named';     readonly value: string }
  | { readonly kind: 'predicate'; readonly value: (ctx: ToggleContext) => boolean }
  | { readonly kind: 'from';      readonly value: string }
  | { readonly kind: 'until';     readonly value: string };

export interface ToggleMetadata {
  readonly featureClass: string;
  readonly acName: string;
  readonly gates: readonly ToggleGate[];
}

// Private registry — one entry per (testClass/featureClass, acName) pair,
// gates accumulate across stacked decorators on the same method.
const toggleRegistry: ToggleMetadata[] = [];

/** Read-only view of every gated AC registered via the four decorators. */
export function getToggleMetadata(): readonly ToggleMetadata[] {
  return toggleRegistry;
}

/** Test-only: clear the registry between cases. */
export function __clearToggleRegistry(): void {
  toggleRegistry.length = 0;
}

function pushGate(target: unknown, acName: string, gate: ToggleGate): void {
  const featureClass = (target as { constructor: { name: string } }).constructor.name;
  const existing = toggleRegistry.find(
    m => m.featureClass === featureClass && m.acName === acName,
  );
  if (existing) {
    (existing.gates as ToggleGate[]).push(gate);
    return;
  }
  toggleRegistry.push({ featureClass, acName, gates: [gate] });
}

// ────────────────────────────────────────────────────────────────────────────
// Decorator factories — registry pattern mirrors @Satisfies / @Verifies.
// Each one is a method decorator; arguments are captured at decoration time
// and reduced at resolve time against a ToggleContext.
// ────────────────────────────────────────────────────────────────────────────

const GATE_NAME_PATTERN = /^[a-z][a-z0-9._:-]*$/i;

/**
 * Gate an AC behind a named provider gate.
 * `gate` must match `[a-z][a-z0-9._:-]*` — rejects empty strings, whitespace,
 * and injection characters that would corrupt provider-side lookups.
 */
export function Toggle(gate: string): MethodDecorator {
  if (typeof gate !== 'string' || !GATE_NAME_PATTERN.test(gate)) {
    throw new Error(`@Toggle: invalid gate name ${JSON.stringify(gate)} — must match ${GATE_NAME_PATTERN}`);
  }
  return function (target: object, propertyKey: string | symbol): void {
    pushGate(target, String(propertyKey), { kind: 'named', value: gate });
  };
}

/** Predicate-based gate — more dynamic than a named gate, not provider-aware. */
export function EnabledWhen(predicate: (ctx: ToggleContext) => boolean): MethodDecorator {
  if (typeof predicate !== 'function') {
    throw new Error('@EnabledWhen: predicate must be a function');
  }
  return function (target: object, propertyKey: string | symbol): void {
    pushGate(target, String(propertyKey), { kind: 'predicate', value: predicate });
  };
}

/** Temporal lower bound — the AC is off until `ctx.now >= isoDate`. */
export function AvailableFrom(isoDate: string): MethodDecorator {
  assertIsoDate(isoDate, '@AvailableFrom');
  return function (target: object, propertyKey: string | symbol): void {
    pushGate(target, String(propertyKey), { kind: 'from', value: isoDate });
  };
}

/** Temporal upper bound — the AC is off once `ctx.now > isoDate`. */
export function AvailableUntil(isoDate: string): MethodDecorator {
  assertIsoDate(isoDate, '@AvailableUntil');
  return function (target: object, propertyKey: string | symbol): void {
    pushGate(target, String(propertyKey), { kind: 'until', value: isoDate });
  };
}

function assertIsoDate(s: string, label: string): void {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}(T.+)?$/.test(s)) {
    throw new Error(`${label}: expected ISO-8601 date (YYYY-MM-DD or full datetime), got ${JSON.stringify(s)}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Context validation — `env` is open-world but canonical values are checked
// when present; silent misspellings ("produciton") would otherwise mask bugs.
// ────────────────────────────────────────────────────────────────────────────

export function validateToggleContext(ctx: ToggleContext): void {
  if (ctx.env !== undefined && !KNOWN_TOGGLE_ENVS.includes(ctx.env as ToggleEnv)) {
    throw new Error(
      `ToggleContext.env: unknown value ${JSON.stringify(ctx.env)} — expected one of ${KNOWN_TOGGLE_ENVS.join(', ')}`,
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Resolver — reduces a ToggleMetadata to a verdict. AND-composition across
// gates; first failing gate wins the `reason` for a human-readable compliance
// report entry.
// ────────────────────────────────────────────────────────────────────────────

export interface ToggleResolution {
  readonly enabled: boolean;
  readonly reason: string;
}

export function resolveToggle(
  meta: ToggleMetadata,
  provider: ToggleProvider | undefined,
  context: ToggleContext,
): ToggleResolution {
  let last: ToggleResolution = { enabled: true, reason: 'no gates' };
  for (const gate of meta.gates) {
    last = resolveOne(gate, provider, context);
    if (!last.enabled) return last;
  }
  // All gates passed — single-gate AC reports that one gate's reason; multi-gate reports a composite.
  if (meta.gates.length <= 1) return last;
  return { enabled: true, reason: 'all gates open' };
}

function resolveOne(
  gate: ToggleGate,
  provider: ToggleProvider | undefined,
  context: ToggleContext,
): ToggleResolution {
  switch (gate.kind) {
    case 'named': {
      if (!provider) return { enabled: true, reason: `gate:${gate.value} default-on (no provider)` };
      const on = provider.isEnabled(gate.value, context);
      return { enabled: on, reason: on ? `gate:${gate.value} on` : `gate:${gate.value} off` };
    }
    case 'predicate': {
      const on = gate.value(context);
      return { enabled: on, reason: on ? 'predicate true' : 'predicate false' };
    }
    case 'from': {
      const now = context.now ?? '';
      const on = now >= gate.value;
      return { enabled: on, reason: on ? `from:${gate.value} reached` : `from:${gate.value} pending (now=${now || 'unset'})` };
    }
    case 'until': {
      const now = context.now ?? '';
      const on = now <= gate.value;
      return { enabled: on, reason: on ? `until:${gate.value} not yet` : `until:${gate.value} expired (now=${now})` };
    }
    
    default:
      throw new TypeError('Unknown toggle gate kind.');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Stub provider — deterministic testability.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Stub ToggleProvider for tests and examples. Unknown gates default-on, so
 * adding a new `@Toggle(...)` in production code does not silently break
 * existing unit tests.
 */
export function createStubToggleProvider(map: Record<string, boolean>): ToggleProvider {
  return {
    isEnabled(gate: string): boolean {
      return map[gate] ?? true;
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Percentage rollout — deterministic bucketing by `userId` + gate name.
// Seeded via FNV-1a-like hash; tests inject their own seed function to pin
// the verdict regardless of Node engine quirks.
// ────────────────────────────────────────────────────────────────────────────

export type RolloutSeedFn = (input: string) => number;

/** Default seed — FNV-1a 32-bit, pure function, no dependency on Math.random. */
export const defaultRolloutSeed: RolloutSeedFn = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Normalise to [0, 1)
  return ((hash >>> 0) % 10_000) / 10_000;
};

/**
 * Build a ToggleProvider that answers `isEnabled(gate)` by bucketing the
 * context's userId into a deterministic percentage slot.
 *
 * - No userId → gate is off (conservative: we cannot bucket an anonymous user).
 * - Matches gate only; other gate names fall through to `true`.
 */
export function createPercentageRollout(
  gate: string,
  pct: number,
  seedFn: RolloutSeedFn = defaultRolloutSeed,
): ToggleProvider {
  if (pct < 0 || pct > 100) {
    throw new Error(`createPercentageRollout: pct must be in [0, 100], got ${pct}`);
  }
  const threshold = pct / 100;
  return {
    isEnabled(g: string, ctx?: ToggleContext): boolean {
      if (g !== gate) return true;
      const userId = ctx?.userId;
      if (!userId) return false;
      return seedFn(`${gate}:${userId}`) < threshold;
    },
  };
}
