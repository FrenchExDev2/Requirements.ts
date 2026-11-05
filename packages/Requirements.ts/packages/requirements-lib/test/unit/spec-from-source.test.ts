import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { FeatureBidirectionalSyncFeature } from '@frenchexdev2/requirements-requirements';
import {
  ParseFeatureSourceError,
  assertFeatureSourceCompiles,
  parseFeatureSource,
} from '@frenchexdev2/requirements-spec-io/spec-from-source';
import { generateFeatureSource } from '@frenchexdev2/requirements-spec-io/spec-to-source';
import type { FeatureSpec, FeatureId, RequirementId, AcName } from '@frenchexdev2/requirements-core/types';
import { SCHEMA_VERSION } from '@frenchexdev2/requirements-core/types';
import { Priority, TestLevel } from '@frenchexdev2/requirements-core';

const fid = (s: string) => s as FeatureId;
const rid = (s: string) => s as RequirementId;
const an = (s: string) => s as AcName;

function featureSpec(partial: Partial<FeatureSpec> = {}): FeatureSpec {
  return {
    $schemaVersion: SCHEMA_VERSION,
    kind: 'feature',
    id: fid('CART'),
    title: 'Cart persistence',
    priority: Priority.High,
    satisfies: [rid('REQ-CART-PERSIST')],
    acs: [
      { name: an('persistsAcrossReloads'), expects: [TestLevel.Unit] },
      { name: an('walksFullCheckout'), expects: [TestLevel.EndToEnd] },
    ],
    ...partial,
  };
}

// Cold ts-morph/compiler initialization also runs under parallel package load.
@FeatureTest(FeatureBidirectionalSyncFeature, { timeout: 15_000 })
class ParseFeatureSourceTests {
  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  rejectsUnknownPriorityMembers() {
    const source = generateFeatureSource(featureSpec()).replace('Priority.High', 'Priority.Unrecognized');
    expect(() => parseFeatureSource(source)).toThrow(/unknown Priority member: Unrecognized/);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  acceptsCompactHandWrittenClassesAndUnsuffixedRequirementNames() {
    const source = "@Satisfies(ReqExternal) export abstract class CompactFeature { readonly id = 'COMPACT'; readonly title = 'Compact'; readonly priority = Priority.High; abstract ac(): ACResult; }";
    const parsed = parseFeatureSource(source);
    expect(parsed.satisfies).toEqual(['REQ-EXTERNAL']);
    expect(parsed.acs).toEqual([{ name: 'ac', expects: [] }]);
    expect(() => parseFeatureSource(source.replace('ReqExternal', 'Requirement'))).toThrow();
  }
  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'parses a generated Feature source back to a matching spec'() {
    const src = generateFeatureSource(featureSpec());
    const parsed = parseFeatureSource(src);
    expect(parsed.id).toBe('CART');
    expect(parsed.title).toBe('Cart persistence');
    expect(parsed.priority).toBe(Priority.High);
    expect(parsed.acs.map(a => a.name)).toEqual(['persistsAcrossReloads', 'walksFullCheckout']);
    expect(parsed.satisfies).toEqual(['REQ-CART-PERSIST']);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'recovers every Priority enum value from source'() {
    for (const p of [Priority.Critical, Priority.High, Priority.Medium, Priority.Low]) {
      const src = generateFeatureSource(featureSpec({ priority: p }));
      expect(parseFeatureSource(src).priority).toBe(p);
    }
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'parses multi-segment requirement ids from @Satisfies'() {
    const src = generateFeatureSource(featureSpec({
      satisfies: [rid('REQ-A'), rid('REQ-B-C')],
    }));
    const parsed = parseFeatureSource(src);
    expect(parsed.satisfies).toEqual(['REQ-A', 'REQ-B-C']);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'parses feature without @Satisfies decorator'() {
    const src = generateFeatureSource(featureSpec({ satisfies: [] }));
    const parsed = parseFeatureSource(src);
    expect(parsed.satisfies).toBeUndefined();
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'recovers the expects comment on each AC line'() {
    const src = generateFeatureSource(featureSpec());
    const parsed = parseFeatureSource(src);
    expect(parsed.acs[0]!.expects).toEqual(['unit']);
    expect(parsed.acs[1]!.expects).toEqual(['e2e']);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'tolerates AC with no expects comment'() {
    const src = generateFeatureSource(featureSpec({
      acs: [{ name: an('bare'), expects: [] }],
    }));
    const parsed = parseFeatureSource(src);
    expect(parsed.acs[0]!.expects).toEqual([]);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('syncRefusesWhenTsDoesNotCompile')
  'assertFeatureSourceCompiles throws on malformed TS'() {
    expect(() => assertFeatureSourceCompiles('export class { 123 !@#')).toThrow(ParseFeatureSourceError);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('syncRefusesWhenTsDoesNotCompile')
  'assertFeatureSourceCompiles accepts well-formed TS'() {
    const src = generateFeatureSource(featureSpec());
    expect(() => assertFeatureSourceCompiles(src)).not.toThrow();
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'throws when class declaration is missing'() {
    expect(() => parseFeatureSource(`export const x = 1;`)).toThrow(/no exported class/);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'throws when id property is missing'() {
    const src = `
      export abstract class FooFeature {
        readonly title = 'x';
        readonly priority = Priority.High;
      }`;
    expect(() => parseFeatureSource(src)).toThrow(/missing .id/);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'throws when title property is missing'() {
    const src = `
      export abstract class FooFeature {
        readonly id = 'FOO';
        readonly priority = Priority.High;
      }`;
    expect(() => parseFeatureSource(src)).toThrow(/missing .title/);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'throws when priority property is missing'() {
    const src = `
      export abstract class FooFeature {
        readonly id = 'FOO';
        readonly title = 'x';
      }`;
    expect(() => parseFeatureSource(src)).toThrow(/missing .priority/);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'throws when id is not a string literal'() {
    const src = `
      export abstract class FooFeature {
        readonly id = 42;
        readonly title = 'x';
        readonly priority = Priority.High;
      }`;
    expect(() => parseFeatureSource(src)).toThrow(/id must be a string literal/);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'throws when priority is not a Priority.* expression'() {
    const src = `
      export abstract class FooFeature {
        readonly id = 'FOO';
        readonly title = 'x';
        readonly priority = 'high';
      }`;
    expect(() => parseFeatureSource(src)).toThrow(/priority must be a Priority/);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'silently drops unknown test levels in expects comment'() {
    const src = `
      export abstract class FooFeature {
        readonly id = 'FOO';
        readonly title = 'x';
        readonly priority = Priority.Low;
        abstract ac(): ACResult; // expects: unit, xyz, e2e
      }`;
    const parsed = parseFeatureSource(src);
    expect(parsed.acs[0]!.expects).toEqual(['unit', 'e2e']);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'ignores unknown properties, property without initializer, computed names'() {
    const src = `
      export abstract class FooFeature {
        readonly id = 'FOO';
        readonly title = 'x';
        readonly priority = Priority.Low;
        readonly enabled = false;
        readonly ignored!: string;
        ['computed'] = 1;
      }`;
    const parsed = parseFeatureSource(src);
    expect(parsed.id).toBe('FOO');
    expect(parsed.priority).toBe(Priority.Low);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'skips non-abstract methods and method with computed name'() {
    const src = `
      export abstract class FooFeature {
        readonly id = 'FOO';
        readonly title = 'x';
        readonly priority = Priority.Low;
        concreteMethod() { return 1; }
        ['computedName']() { return 2; }
        abstract ['computedAc'](): ACResult;
        abstract realAc(): ACResult; // expects: unit
      }`;
    const parsed = parseFeatureSource(src);
    expect(parsed.acs.map(a => a.name)).toEqual(['realAc']);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'ignores non-identifier @Satisfies arguments (e.g. string literal)'() {
    const src = `
      @Satisfies('not-an-identifier', ReqCartPersistRequirement)
      export abstract class FooFeature {
        readonly id = 'FOO';
        readonly title = 'x';
        readonly priority = Priority.Low;
      }`;
    const parsed = parseFeatureSource(src);
    expect(parsed.satisfies).toEqual(['REQ-CART-PERSIST']);
  }

  @Verifies<FeatureBidirectionalSyncFeature>('bidirectionalSyncJsonToTs')
  'ignores non-Satisfies decorators on the class'() {
    const src = `
      @OtherDecorator()
      @NotCalled
      export abstract class FooFeature {
        readonly id = 'FOO';
        readonly title = 'x';
        readonly priority = Priority.Low;
      }`;
    const parsed = parseFeatureSource(src);
    expect(parsed.satisfies).toBeUndefined();
  }

  @Verifies<FeatureBidirectionalSyncFeature>('syncPreservesCommentsAndDecoratorOrderInTs')
  'preserves JSDoc and decorator order through TS→JSON→TS round-trip'() {
    const src = generateFeatureSource(featureSpec());
    // Round-trip: parse, regenerate, parse again → identical spec.
    const specA = parseFeatureSource(src);
    const regen = generateFeatureSource(specA);
    const specB = parseFeatureSource(regen);
    expect(specB).toEqual(specA);
    // JSDoc survives at the textual level.
    expect(regen).toContain('/**');
    expect(regen).toContain('Generated from FeatureSpec');
    // Decorator comes BEFORE the class keyword (order preserved).
    const decoratorIdx = regen.indexOf('@Satisfies(');
    const classIdx = regen.indexOf('export abstract class');
    expect(decoratorIdx).toBeGreaterThan(-1);
    expect(decoratorIdx).toBeLessThan(classIdx);
  }
}
void ParseFeatureSourceTests;
