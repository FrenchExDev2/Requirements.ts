import { expect } from 'vitest';
import {
  checkFeatureEvolution,
  featureReference,
  ParticipatesIn,
  getParticipation,
  FeatureTest,
  Verifies,
  Feature,
  Priority,
} from '../../src/index.js';

abstract class KernelParticipationFeature extends Feature {
  readonly id = 'KERNEL-PARTICIPATION';
  readonly title = 'Kernel participation';
  readonly description = 'Local stub';
  readonly priority = Priority.Medium;
  abstract freezesAndValidatesFeatureReferences(): unknown;
  abstract detectsCatalogueEvolutionErrors(): unknown;
  abstract recordsParticipationOnClassesAndMethods(): unknown;
  abstract rejectsInvalidParticipationTargets(): unknown;
}

@FeatureTest(KernelParticipationFeature)
class KernelParticipationTests {
  @Verifies<KernelParticipationFeature>('freezesAndValidatesFeatureReferences')
  "freezes a valid identity"() {
    const ref = featureReference('CART-CHECKOUT');
    expect(ref.id).toBe('CART-CHECKOUT');
    expect(Object.isFrozen(ref)).toBe(true);
  }

  @Verifies<KernelParticipationFeature>('freezesAndValidatesFeatureReferences')
  "rejects invalid identities"() {
    expect(() => featureReference('cart')).toThrow(/Invalid feature identity/);
    expect(() => featureReference('')).toThrow(/Invalid feature identity/);
  }

  @Verifies<KernelParticipationFeature>('detectsCatalogueEvolutionErrors')
  "accepts a stable catalogue"() {
    const current = [featureReference('A'), featureReference('B')];
    expect(checkFeatureEvolution(['A', 'B'], current)).toEqual([]);
  }

  @Verifies<KernelParticipationFeature>('detectsCatalogueEvolutionErrors')
  "flags duplicate identities"() {
    const current = [featureReference('A'), featureReference('A')];
    expect(checkFeatureEvolution(['A'], current)).toContain('Duplicate feature identity');
  }

  @Verifies<KernelParticipationFeature>('freezesAndValidatesFeatureReferences')
  "requires an explicit retirement when an identity disappears"() {
    const current = [featureReference('B')];
    expect(checkFeatureEvolution(['A', 'B'], current).some((e) => e.includes('without explicit retirement'))).toBe(true);
  }

  @Verifies<KernelParticipationFeature>('detectsCatalogueEvolutionErrors')
  "accepts a reasoned retirement and validates replacements"() {
    const current = [featureReference('B')];
    expect(checkFeatureEvolution(['A', 'B'], current, { A: { reason: 'merged', replacedBy: 'B' } })).toEqual([]);
    expect(
      checkFeatureEvolution(['A', 'B'], current, { A: { reason: 'merged', replacedBy: 'Z' } }).some((e) =>
        e.includes('Unknown replacement'),
      ),
    ).toBe(true);
  }

  @Verifies<KernelParticipationFeature>('detectsCatalogueEvolutionErrors')
  "flags broken replacedBy on current features"() {
    const current = [{ id: 'A', replacedBy: 'Z' } as const];
    expect(checkFeatureEvolution(['A'], current).some((e) => e.includes('Unknown replacement for A'))).toBe(true);
  }

  @Verifies<KernelParticipationFeature>('recordsParticipationOnClassesAndMethods')
  "records participation on a class context"() {
    const a = featureReference('FEAT-A');
    const b = featureReference('FEAT-B');
    class Target {}
    ParticipatesIn(a, b)(Target, { kind: 'class' } as ClassDecoratorContext);
    expect(getParticipation(Target).map((f) => f.id)).toEqual(['FEAT-A', 'FEAT-B']);
  }

  @Verifies<KernelParticipationFeature>('recordsParticipationOnClassesAndMethods')
  "accumulates participation across repeated decorations"() {
    const a = featureReference('FEAT-A');
    const b = featureReference('FEAT-B');
    class Target {}
    ParticipatesIn(a)(Target, { kind: 'class' } as ClassDecoratorContext);
    ParticipatesIn(b)(Target, { kind: 'method' } as ClassMethodDecoratorContext);
    expect(getParticipation(Target).map((f) => f.id)).toEqual(['FEAT-A', 'FEAT-B']);
  }

  @Verifies<KernelParticipationFeature>('recordsParticipationOnClassesAndMethods')
  "returns an empty list for undecorated values"() {
    expect(getParticipation({})).toEqual([]);
  }

  @Verifies<KernelParticipationFeature>('rejectsInvalidParticipationTargets')
  "rejects empty or invalid feature lists"() {
    expect(() => ParticipatesIn()).toThrow(/valid feature references/);
    expect(() => ParticipatesIn({ id: 'bad' })).toThrow(/valid feature references/);
  }

  @Verifies<KernelParticipationFeature>('rejectsInvalidParticipationTargets')
  "rejects unsupported decorator kinds"() {
    const a = featureReference('FEAT-A');
    expect(() =>
      ParticipatesIn(a)({}, { kind: 'getter' } as unknown as ClassDecoratorContext),
    ).toThrow(/class or method/);
  }
}
void KernelParticipationTests;
