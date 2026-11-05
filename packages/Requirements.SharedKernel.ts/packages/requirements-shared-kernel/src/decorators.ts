/**
 * Requirements Tracking DSL — Decorators.
 * Class decorators accept both legacy experimentalDecorators and TC39 Stage 3 call shapes.
 * Method decorators are dual-mode: Stage 3 (value, ClassMethodDecoratorContext) and legacy
 * (target, propertyKey, descriptor?). Runtime behavior is identical in both modes so packages
 * still on experimentalDecorators (Requirements, vitest oxc legacy) keep working while
 * consumers that typecheck against Stage-3 sources (Builder.Tests + customConditions "source")
 * can drop experimentalDecorators.
 */

import type { Feature, Requirement } from './base.js';
import type { TestLevel } from './base.js';

// Runtime registry for the compliance scanner
export interface RequirementRef {
  feature: string;
  ac: string;
  testClass: string;
  testMethod: string;
}

const registry: RequirementRef[] = [];
const excludedMethods = new Set<string>();

export function getRequirementRegistry(): RequirementRef[] {
  return registry;
}

export function getExcludedMethods(): Set<string> {
  return excludedMethods;
}

export interface FeatureTestOptions {
  timeout?: number;
}

function isStage3MethodContext(value: unknown): value is ClassMethodDecoratorContext {
  return typeof value === 'object' && value !== null && 'kind' in value && (value as { kind: string }).kind === 'method';
}

/**
 * Class decorator: link a test class to a Feature AND auto-register with vitest.
 * The decorator creates a describe/it block internally so test files never need
 * to contain bare describe() or it() calls.
 * Usage: @FeatureTest(NavigationFeature)
 *        @FeatureTest(SlowFeature, { timeout: 30_000 })
 */
export function FeatureTest<T extends abstract new (...args: any[]) => Feature>(feature: T, opts?: FeatureTestOptions) {
  return function <C extends new (...args: any[]) => any>(target: C, _context?: ClassDecoratorContext): C {
    (target as any).__feature = feature.name;
    (target as any).__featureClass = feature;

    // Backfill feature name on registry entries that were registered before the class decorator ran
    for (const ref of registry) {
      if (ref.testClass === target.name && !ref.feature) {
        ref.feature = feature.name;
      }
    }

    // Auto-register with vitest — test files only need classes, no boilerplate.
    // vitest globals (describe/it) are available when globals: true in vitest.config.
    const g = globalThis as Record<string, unknown>;
    if (typeof g.describe === 'function' && typeof g.it === 'function') {
      const vDescribe = g.describe as (name: string, fn: () => void) => void;
      const vIt = g.it as (name: string, fn: () => unknown, timeout?: number) => void;
      const instance = new target();
      vDescribe(target.name, () => {
        for (const method of Object.getOwnPropertyNames(target.prototype)) {
          if (method === 'constructor') continue;
          if (excludedMethods.has(`${target.name}.${method}`)) continue;
          vIt(method, () => (instance as unknown as Record<string, () => unknown>)[method]!(), opts?.timeout);
        }
      });
    }

    return target;
  };
}

/**
 * Method decorator: link a test method to the AC it verifies.
 * Dual-mode (Stage 3 + legacy experimentalDecorators).
 * Usage: @Verifies<NavigationFeature>('tocClickLoadsPage')
 */
export function Verifies<T extends Feature>(ac: keyof T & string) {
  return function (targetOrValue: any, keyOrContext: ClassMethodDecoratorContext | string, _descriptor?: PropertyDescriptor): void {
    if (isStage3MethodContext(keyOrContext)) {
      const propertyKey = String(keyOrContext.name);
      const entry: RequirementRef = { feature: '', ac, testClass: '', testMethod: propertyKey };
      registry.push(entry);
      // Bind class name as soon as the class finishes initializing (static) / first instance (instance).
      // FeatureTest backfill also matches by method name when testClass is still empty.
      keyOrContext.addInitializer(function (this: any) {
        if (entry.testClass) return;
        entry.testClass = keyOrContext.static ? (this as Function).name : (this as object).constructor.name;
        if (!entry.feature) {
          const featureName = keyOrContext.static
            ? (this as any).__feature
            : (this as any).constructor?.__feature;
          if (typeof featureName === 'string') entry.feature = featureName;
        }
      });
      return;
    }

    const propertyKey = keyOrContext as string;
    registry.push({
      feature: '',
      ac,
      testClass: targetOrValue.constructor.name,
      testMethod: propertyKey,
    });
  };
}

/**
 * Method decorator: declare which test levels an AC expects.
 * No-op at runtime — the AST scanner reads the decorator arguments statically.
 */
export function Expects(..._levels: TestLevel[]) {
  return function (_targetOrValue: any, _keyOrContext?: ClassMethodDecoratorContext | string, _descriptor?: PropertyDescriptor): void {};
}

/**
 * Method decorator: exclude a helper from requirement scanning.
 * Dual-mode (Stage 3 + legacy).
 */
export function Exclude() {
  return function (targetOrValue: any, keyOrContext: ClassMethodDecoratorContext | string, _descriptor?: PropertyDescriptor): void {
    if (isStage3MethodContext(keyOrContext)) {
      const propertyKey = String(keyOrContext.name);
      // Class name may be unknown until initializer; exclude by method name alone is insufficient
      // for the Set format Class.method — defer via initializer.
      keyOrContext.addInitializer(function (this: any) {
        const className = keyOrContext.static ? (this as Function).name : (this as object).constructor.name;
        excludedMethods.add(`${className}.${propertyKey}`);
      });
      // Also pre-register under empty class for FeatureTest's exclude check during describe setup:
      // FeatureTest iterates prototype methods and checks excludedMethods.has(`${target.name}.${method}`).
      // So we need the class name before FeatureTest runs describe. Method initializers for instance
      // members run on construction, which is when FeatureTest does `new target()` — before describe's its.
      // Order: class decorator body runs (including `new target()` which fires method initializers), then returns.
      // So Exclude's initializer runs during FeatureTest's `new target()` BEFORE the describe/it loop. Good.
      return;
    }

    const propertyKey = keyOrContext as string;
    excludedMethods.add(`${targetOrValue.constructor.name}.${propertyKey}`);
  };
}

/**
 * Method decorator: mark a `@Verifies` test as type-check-only.
 * Dual-mode (Stage 3 + legacy). No runtime effect; AST scanners read the name statically.
 */
export function TypeCheckOnly() {
  return function (_targetOrValue: any, _keyOrContext?: ClassMethodDecoratorContext | string, _descriptor?: PropertyDescriptor): void {
    /* no-op at runtime */
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Traceability links — SysML-aligned (Satisfies, Refines)
// ────────────────────────────────────────────────────────────────────────────

/** Bidirectional link record populated by @Satisfies. */
export interface SatisfactionLink {
  /** The Feature class name declaring @Satisfies. */
  readonly featureClass: string;
  /** Requirement class names listed as args to @Satisfies. */
  readonly requirementClasses: readonly string[];
}

/** Bidirectional link record populated by @Refines. */
export interface RefinementLink {
  /** The Requirement class name declaring @Refines. */
  readonly childClass: string;
  /** Parent Requirement class names listed as args to @Refines. */
  readonly parentClasses: readonly string[];
}

const satisfactionLinks: SatisfactionLink[] = [];
const refinementLinks: RefinementLink[] = [];

export function getSatisfactionLinks(): readonly SatisfactionLink[] {
  return satisfactionLinks;
}

export function getRefinementLinks(): readonly RefinementLink[] {
  return refinementLinks;
}

/**
 * Class decorator: a Feature satisfies one or more Requirements (SysML `satisfy`).
 */
export function Satisfies<
  R extends ReadonlyArray<abstract new (...args: any[]) => Requirement>,
>(...requirements: R) {
  return function <C extends abstract new (...args: any[]) => Feature>(target: C, _context?: ClassDecoratorContext): C {
    const requirementClasses = requirements.map(r => r.name);
    satisfactionLinks.push({ featureClass: target.name, requirementClasses });
    (target as any).__satisfies = requirementClasses;
    return target;
  };
}

/**
 * Class decorator: a Requirement refines (is derived from / decomposes) one or more parent Requirements.
 */
export function Refines<R extends abstract new (...args: any[]) => Requirement>(
  ...parents: readonly R[]
) {
  return function <C extends abstract new (...args: any[]) => Requirement>(target: C, _context?: ClassDecoratorContext): C {
    const parentClasses = parents.map(p => p.name);
    refinementLinks.push({ childClass: target.name, parentClasses });
    (target as any).__refines = parentClasses;
    return target;
  };
}
