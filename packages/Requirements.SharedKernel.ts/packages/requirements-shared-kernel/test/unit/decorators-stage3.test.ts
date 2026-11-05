import { expect, describe, it } from 'vitest';
import {
  Verifies,
  Exclude,
  FeatureTest,
  TypeCheckOnly,
  Expects,
  Satisfies,
  Refines,
  getRequirementRegistry,
  getExcludedMethods,
  getSatisfactionLinks,
  getRefinementLinks,
  Feature,
  Requirement,
  Priority,
} from '../../src/index.js';

function methodContext(name: string, opts: { static?: boolean } = {}): ClassMethodDecoratorContext & {
  runInitializers(thisArg: any): void;
} {
  const initializers: Array<(this: any) => void> = [];
  return {
    kind: 'method',
    name,
    static: !!opts.static,
    private: false,
    access: { has: () => true, get: () => undefined },
    addInitializer(fn: (this: any) => void) {
      initializers.push(fn);
    },
    metadata: Object.create(null),
    runInitializers(thisArg: any) {
      for (const fn of initializers) fn.call(thisArg);
    },
  } as ClassMethodDecoratorContext & { runInitializers(thisArg: any): void };
}

abstract class Stage3ParentReq extends Requirement {
  readonly id = 'REQ-STAGE3-PARENT';
  readonly title = 'p';
  readonly description = 'd';
  readonly priority = Priority.Low;
  readonly status = 'Draft';
}
abstract class Stage3ChildReq extends Requirement {
  readonly id = 'REQ-STAGE3-CHILD';
  readonly title = 'c';
  readonly description = 'd';
  readonly priority = Priority.Low;
  readonly status = 'Draft';
}
abstract class Stage3LinkedFeature extends Feature {
  readonly id = 'STAGE3-LINKED';
  readonly title = 'l';
  readonly description = 'd';
  readonly priority = Priority.Medium;
}

@FeatureTest(Stage3LinkedFeature, { timeout: 5_000 })
class Stage3FeatureHost {
  @Verifies('any' as never)
  @TypeCheckOnly()
  @Expects('Unit' as never)
  covers(): void {}

  @Exclude()
  helper(): void {}
}

// Top-level backfill: seed registry then FeatureTest fills feature name
const backfillCtx = methodContext('backfillMe');
Verifies('backfillMe' as never)(undefined, backfillCtx);
class BackfillHost {
  backfillMe(): void {}
}
Object.defineProperty(BackfillHost, 'name', { value: 'BackfillHost' });
backfillCtx.runInitializers(Object.create(BackfillHost.prototype));
FeatureTest(Stage3LinkedFeature)(BackfillHost);

describe('dual-mode Stage 3 decorator paths', () => {
  it('registers Verifies and Exclude via Stage 3 contexts', () => {
    const verifiesCtx = methodContext('stage3Verify');
    Verifies('stage3Verify' as never)(undefined, verifiesCtx);

    const excludeCtx = methodContext('stage3Helper');
    Exclude()(undefined, excludeCtx);

    class Host {
      static __feature = 'Stage3HostFeature';
    }
    const instance = Object.create(Host.prototype);
    verifiesCtx.runInitializers(instance);
    excludeCtx.runInitializers(instance);
    verifiesCtx.runInitializers(instance);

    expect(getRequirementRegistry().some((r) => r.testMethod === 'stage3Verify' && r.testClass === 'Host' && r.feature === 'Stage3HostFeature')).toBe(true);
    expect(getExcludedMethods().has('Host.stage3Helper')).toBe(true);

    const staticCtx = methodContext('staticMethod', { static: true });
    Verifies('staticMethod' as never)(undefined, staticCtx);
    Exclude()(undefined, staticCtx);
    function StaticHost() {}
    (StaticHost as any).__feature = 'StaticFeat';
    Object.defineProperty(StaticHost, 'name', { value: 'StaticHost' });
    staticCtx.runInitializers(StaticHost);
    expect(getRequirementRegistry().some((r) => r.testMethod === 'staticMethod' && r.testClass === 'StaticHost' && r.feature === 'StaticFeat')).toBe(true);
    expect(getExcludedMethods().has('StaticHost.staticMethod')).toBe(true);

    const noFeatCtx = methodContext('noFeat');
    Verifies('noFeat' as never)(undefined, noFeatCtx);
    class Bare {}
    noFeatCtx.runInitializers(Object.create(Bare.prototype));
    expect(getRequirementRegistry().some((r) => r.testMethod === 'noFeat' && r.testClass === 'Bare' && r.feature === '')).toBe(true);
  });

  it('runs Satisfies/Refines/TypeCheckOnly with Stage 3 class context', () => {
    Refines()(class extends Stage3ParentReq {}, { kind: 'class' } as ClassDecoratorContext);
    Refines(Stage3ParentReq)(class extends Stage3ChildReq {}, { kind: 'class' } as ClassDecoratorContext);
    const feature = Satisfies(Stage3ParentReq, Stage3ChildReq)(
      class extends Stage3LinkedFeature {},
      { kind: 'class' } as ClassDecoratorContext,
    );

    expect(getRefinementLinks().length).toBeGreaterThan(0);
    expect(getSatisfactionLinks().some((l) => l.featureClass === feature.name)).toBe(true);

    TypeCheckOnly()(undefined, methodContext('noop'));
    expect(Stage3FeatureHost).toBeDefined();
    expect(getRequirementRegistry().some((r) => r.testClass === 'BackfillHost' && r.feature === 'Stage3LinkedFeature')).toBe(true);
  });

  it('covers FeatureTest missing vitest globals branch', () => {
    const g = globalThis as Record<string, unknown>;
    const savedDescribe = g.describe;
    const savedIt = g.it;
    try {
      delete g.describe;
      delete g.it;
      class NoGlobalsHost {
        only(): void {}
      }
      FeatureTest(Stage3LinkedFeature)(NoGlobalsHost);
      expect((NoGlobalsHost as any).__feature).toBe('Stage3LinkedFeature');
    } finally {
      g.describe = savedDescribe;
      g.it = savedIt;
    }
  });
});
