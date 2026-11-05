import { expect } from 'vitest';
import {
  FeatureTest,
  Verifies,
  Expects,
  Exclude,
  Satisfies,
  Refines,
  getRequirementRegistry,
  getExcludedMethods,
  getSatisfactionLinks,
  getRefinementLinks,
} from '@frenchexdev2/requirements-core';
import { DecoratorsFeature } from '@frenchexdev2/requirements-requirements';
import { Feature, Priority, TestLevel, Requirement } from '@frenchexdev2/requirements-core';

@FeatureTest(DecoratorsFeature)
class RegistryAccessorTests {
  @Verifies<DecoratorsFeature>('getRequirementRegistryReturnsRegisteredRefs')
  'getRequirementRegistry exposes the live array of refs registered via @Verifies'() {
    const refs = getRequirementRegistry();
    expect(Array.isArray(refs)).toBe(true);
    // This very test is registered, so the registry can never be empty when this runs.
    expect(refs.length).toBeGreaterThan(0);
    const self = refs.find(r => r.testClass === 'RegistryAccessorTests' && r.ac === 'getRequirementRegistryReturnsRegisteredRefs');
    expect(self).toBeDefined();
    expect(self!.feature).toBe('DecoratorsFeature');
  }

  @Verifies<DecoratorsFeature>('getExcludedMethodsReturnsExcludedSet')
  'getExcludedMethods exposes the live Set of excluded "Class.method" keys'() {
    const set = getExcludedMethods();
    expect(set).toBeInstanceOf(Set);
  }
}

abstract class StubFeature extends Feature {
  readonly id = 'STUB';
  readonly title = 'Stub';
  readonly priority = Priority.Low;
  abstract someAc(): { satisfied: boolean };
}

@FeatureTest(DecoratorsFeature)
class FeatureTestDecoratorTests {
  @Verifies<DecoratorsFeature>('featureTestStampsFeatureMetadataOnClass')
  'stamps __feature and __featureClass on the decorated class'() {
    // Mock describe/it: real ones forbid re-entry from inside an it().
    const g = globalThis as Record<string, unknown>;
    const od = g.describe; const oi = g.it;
    g.describe = (_n: string, fn: () => void) => fn();
    g.it = (_n: string, _fn: () => unknown) => {};
    try {
      class TempClass { m() {} }
      FeatureTest(StubFeature)(TempClass);
      expect((TempClass as unknown as { __feature: string }).__feature).toBe('StubFeature');
      expect((TempClass as unknown as { __featureClass: typeof StubFeature }).__featureClass).toBe(StubFeature);
    } finally {
      g.describe = od; g.it = oi;
    }
  }

  @Verifies<DecoratorsFeature>('featureTestBackfillsFeatureNameOnPriorRegistryEntries')
  'backfills feature name on registry entries that were registered before the class decorator ran'() {
    class BackfillTarget {
      a() { return { satisfied: true }; }
    }
    Verifies<StubFeature>('someAc')(BackfillTarget.prototype, 'a', Object.getOwnPropertyDescriptor(BackfillTarget.prototype, 'a')!);

    const refs = getRequirementRegistry();
    const before = refs.find(r => r.testClass === 'BackfillTarget' && r.ac === 'someAc');
    expect(before).toBeDefined();
    expect(before!.feature).toBe('');

    const g = globalThis as Record<string, unknown>;
    const od = g.describe; const oi = g.it;
    g.describe = (_n: string, fn: () => void) => fn();
    g.it = (_n: string, _fn: () => unknown) => {};
    try {
      FeatureTest(StubFeature)(BackfillTarget);
    } finally {
      g.describe = od; g.it = oi;
    }
    const after = refs.find(r => r.testClass === 'BackfillTarget' && r.ac === 'someAc');
    expect(after!.feature).toBe('StubFeature');
  }

  @Verifies<DecoratorsFeature>('featureTestAutoRegistersWithVitestGlobals')
  'auto-registers a describe block with one it per non-constructor method when globals are present'() {
    const calls: { kind: 'describe' | 'it'; name: string; timeout?: number }[] = [];
    const g = globalThis as Record<string, unknown>;
    const origDescribe = g.describe;
    const origIt = g.it;
    g.describe = (name: string, fn: () => void) => { calls.push({ kind: 'describe', name }); fn(); };
    g.it = (name: string, _fn: () => unknown, timeout?: number) => { calls.push({ kind: 'it', name, timeout }); };
    try {
      class Auto {
        m1() { return { satisfied: true }; }
        m2() { return { satisfied: true }; }
      }
      FeatureTest(StubFeature)(Auto);
      expect(calls.find(c => c.kind === 'describe' && c.name === 'Auto')).toBeDefined();
      expect(calls.filter(c => c.kind === 'it').map(c => c.name).sort()).toEqual(['m1', 'm2']);
    } finally {
      g.describe = origDescribe;
      g.it = origIt;
    }
  }

  @Verifies<DecoratorsFeature>('featureTestSkipsAutoRegistrationWhenGlobalsAbsent')
  'is a no-op when neither describe nor it are on globalThis'() {
    const g = globalThis as Record<string, unknown>;
    const origDescribe = g.describe;
    const origIt = g.it;
    delete g.describe;
    delete g.it;
    try {
      class Bare { m() { return { satisfied: true }; } }
      // Must not throw — and must still stamp metadata.
      FeatureTest(StubFeature)(Bare);
      expect((Bare as unknown as { __feature: string }).__feature).toBe('StubFeature');
    } finally {
      g.describe = origDescribe;
      g.it = origIt;
    }
  }

  @Verifies<DecoratorsFeature>('featureTestSkipsConstructorMember')
  'skips the constructor when iterating prototype members'() {
    const itNames: string[] = [];
    const g = globalThis as Record<string, unknown>;
    const origDescribe = g.describe;
    const origIt = g.it;
    g.describe = (_n: string, fn: () => void) => fn();
    g.it = (name: string, _fn: () => unknown) => { itNames.push(name); };
    try {
      class WithCtor {
        constructor() { /* explicit ctor */ }
        m() { return { satisfied: true }; }
      }
      FeatureTest(StubFeature)(WithCtor);
      expect(itNames).toEqual(['m']);
      expect(itNames).not.toContain('constructor');
    } finally {
      g.describe = origDescribe;
      g.it = origIt;
    }
  }

  @Verifies<DecoratorsFeature>('featureTestSkipsExcludedMethods')
  'skips methods marked with @Exclude when registering its'() {
    const itNames: string[] = [];
    const g = globalThis as Record<string, unknown>;
    const origDescribe = g.describe;
    const origIt = g.it;
    g.describe = (_n: string, fn: () => void) => fn();
    g.it = (name: string, _fn: () => unknown) => { itNames.push(name); };
    try {
      class WithHelper {
        helper() { /* helper */ }
        ac() { return { satisfied: true }; }
      }
      Exclude()(WithHelper.prototype, 'helper', Object.getOwnPropertyDescriptor(WithHelper.prototype, 'helper')!);
      FeatureTest(StubFeature)(WithHelper);
      expect(itNames).toEqual(['ac']);
    } finally {
      g.describe = origDescribe;
      g.it = origIt;
    }
  }

  @Verifies<DecoratorsFeature>('featureTestPassesTimeoutOptionToVitest')
  'forwards the timeout option to every it() call'() {
    const seenTimeouts: (number | undefined)[] = [];
    const g = globalThis as Record<string, unknown>;
    const origDescribe = g.describe;
    const origIt = g.it;
    g.describe = (_n: string, fn: () => void) => fn();
    g.it = (_n: string, _fn: () => unknown, timeout?: number) => { seenTimeouts.push(timeout); };
    try {
      class Slow { slow() { return { satisfied: true }; } }
      FeatureTest(StubFeature, { timeout: 99_000 })(Slow);
      expect(seenTimeouts).toEqual([99_000]);
    } finally {
      g.describe = origDescribe;
      g.it = origIt;
    }
  }
}

@FeatureTest(DecoratorsFeature)
class VerifiesDecoratorTests {
  @Verifies<DecoratorsFeature>('verifiesAddsRefToRegistryWithEmptyFeature')
  'adds a ref with empty feature when applied before @FeatureTest'() {
    class StandaloneTarget {
      foo() { return { satisfied: true }; }
    }
    Verifies<StubFeature>('someAc')(StandaloneTarget.prototype, 'foo', Object.getOwnPropertyDescriptor(StandaloneTarget.prototype, 'foo')!);
    const ref = getRequirementRegistry().find(r => r.testClass === 'StandaloneTarget' && r.testMethod === 'foo');
    expect(ref).toBeDefined();
    expect(ref!.ac).toBe('someAc');
    expect(ref!.feature).toBe('');
  }

  @Verifies<DecoratorsFeature>('verifiesCapturesTestClassAndMethodNames')
  'captures the test class name (from constructor.name) and the property key'() {
    class Captured {
      bar() { return { satisfied: true }; }
    }
    Verifies<StubFeature>('someAc')(Captured.prototype, 'bar', Object.getOwnPropertyDescriptor(Captured.prototype, 'bar')!);
    const ref = getRequirementRegistry().find(r => r.testClass === 'Captured' && r.testMethod === 'bar');
    expect(ref).toBeDefined();
  }
}

@FeatureTest(DecoratorsFeature)
class ExpectsDecoratorTests {
  @Verifies<DecoratorsFeature>('expectsIsNoOpAtRuntime')
  'returns a function that does nothing when applied'() {
    const decorate = Expects(TestLevel.Unit, TestLevel.Visual);
    expect(typeof decorate).toBe('function');
    // Apply it: must not throw, must not register anything.
    const refsBefore = getRequirementRegistry().length;
    class T { m() { return { satisfied: true }; } }
    decorate(T.prototype, 'm');
    expect(getRequirementRegistry().length).toBe(refsBefore);
  }
}

@FeatureTest(DecoratorsFeature)
class ExcludeDecoratorTests {
  @Verifies<DecoratorsFeature>('excludeAddsMethodKeyToExcludedSet')
  'adds a "ClassName.methodName" entry to the excluded set'() {
    class WithEx { helper() { /* stub */ } }
    Exclude()(WithEx.prototype, 'helper', Object.getOwnPropertyDescriptor(WithEx.prototype, 'helper')!);
    expect(getExcludedMethods().has('WithEx.helper')).toBe(true);
  }
}

@FeatureTest(DecoratorsFeature)
class SatisfiesRefinesDecoratorTests {
  @Verifies<DecoratorsFeature>('getSatisfactionLinksReturnsRegisteredLinks')
  'getSatisfactionLinks returns the live array of satisfaction links'() {
    const links = getSatisfactionLinks();
    expect(Array.isArray(links)).toBe(true);
  }

  @Verifies<DecoratorsFeature>('getRefinementLinksReturnsRegisteredLinks')
  'getRefinementLinks returns the live array of refinement links'() {
    const links = getRefinementLinks();
    expect(Array.isArray(links)).toBe(true);
  }

  @Verifies<DecoratorsFeature>('satisfiesDecoratorAppendsLinkWithFeatureAndRequirementNames')
  'Satisfies(ReqA, ReqB)(Feat) appends {featureClass: "Feat", requirementClasses: ["ReqA","ReqB"]}'() {
    abstract class ReqAlpha extends Requirement {
      readonly id = 'REQ-ALPHA';
      readonly title = 't';
      readonly priority = Priority.Low;
      readonly status = 'Draft' as const;
      readonly kind = 'Functional' as const;
      readonly statement = { pattern: 'ubiquitous' as const, response: 'x' };
      readonly rationale = { claim: 'c', kind: 'principle' as const, evidence: [] };
      readonly fitCriteria = [];
      readonly verificationMethod = 'Test' as const;
      readonly source = { type: 'stakeholder' as const, role: 'r', date: '2026-01-01' };
      readonly risk = { level: 'Low' as const, ifNotMet: 'n' };
      readonly tracedTo = [];
    }
    abstract class ReqBeta extends Requirement {
      readonly id = 'REQ-BETA';
      readonly title = 't';
      readonly priority = Priority.Low;
      readonly status = 'Draft' as const;
      readonly kind = 'Functional' as const;
      readonly statement = { pattern: 'ubiquitous' as const, response: 'x' };
      readonly rationale = { claim: 'c', kind: 'principle' as const, evidence: [] };
      readonly fitCriteria = [];
      readonly verificationMethod = 'Test' as const;
      readonly source = { type: 'stakeholder' as const, role: 'r', date: '2026-01-01' };
      readonly risk = { level: 'Low' as const, ifNotMet: 'n' };
      readonly tracedTo = [];
    }
    @Satisfies(ReqAlpha, ReqBeta)
    abstract class SatFeat extends Feature {
      readonly id = 'SAT-FEAT';
      readonly title = 't';
      readonly priority = Priority.Low;
    }
    const link = getSatisfactionLinks().find(l => l.featureClass === 'SatFeat');
    expect(link).toBeDefined();
    expect(link!.requirementClasses).toEqual(['ReqAlpha', 'ReqBeta']);
    expect((SatFeat as any).__satisfies).toEqual(['ReqAlpha', 'ReqBeta']);
  }

  @Verifies<DecoratorsFeature>('refinesDecoratorAppendsLinkWithChildAndParentNames')
  'Refines(ParentReq)(ChildReq) appends {childClass: "Child", parentClasses: ["Parent"]}'() {
    abstract class ReqParent extends Requirement {
      readonly id = 'REQ-PARENT';
      readonly title = 't';
      readonly priority = Priority.Low;
      readonly status = 'Draft' as const;
      readonly kind = 'Functional' as const;
      readonly statement = { pattern: 'ubiquitous' as const, response: 'x' };
      readonly rationale = { claim: 'c', kind: 'principle' as const, evidence: [] };
      readonly fitCriteria = [];
      readonly verificationMethod = 'Test' as const;
      readonly source = { type: 'stakeholder' as const, role: 'r', date: '2026-01-01' };
      readonly risk = { level: 'Low' as const, ifNotMet: 'n' };
      readonly tracedTo = [];
    }
    @Refines(ReqParent)
    abstract class ReqChild extends Requirement {
      readonly id = 'REQ-CHILD';
      readonly title = 't';
      readonly priority = Priority.Low;
      readonly status = 'Draft' as const;
      readonly kind = 'Functional' as const;
      readonly statement = { pattern: 'ubiquitous' as const, response: 'x' };
      readonly rationale = { claim: 'c', kind: 'principle' as const, evidence: [] };
      readonly fitCriteria = [];
      readonly verificationMethod = 'Test' as const;
      readonly source = { type: 'stakeholder' as const, role: 'r', date: '2026-01-01' };
      readonly risk = { level: 'Low' as const, ifNotMet: 'n' };
      readonly tracedTo = [];
    }
    const link = getRefinementLinks().find(l => l.childClass === 'ReqChild');
    expect(link).toBeDefined();
    expect(link!.parentClasses).toEqual(['ReqParent']);
    expect((ReqChild as any).__refines).toEqual(['ReqParent']);
  }
}

void RegistryAccessorTests;
void FeatureTestDecoratorTests;
void VerifiesDecoratorTests;
void ExpectsDecoratorTests;
void ExcludeDecoratorTests;
void SatisfiesRefinesDecoratorTests;
