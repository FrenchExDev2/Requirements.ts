import { expect } from 'vitest';
import {
  checkFeatureEvolution,
  featureReference,
  ParticipatesIn,
  getParticipation,
  FeatureTest,
  Verifies,
} from '@frenchexdev2/requirements-shared-kernel';
import { ParticipationContractsFeature } from '../../src/participation-contracts.js';

@FeatureTest(ParticipationContractsFeature)
class ParticipationContractTests {
  @Verifies<ParticipationContractsFeature>('freezesAndValidatesFeatureReferences')
  "freezes a valid identity"() {
    const ref = featureReference('CART-CHECKOUT');
    expect(ref.id).toBe('CART-CHECKOUT');
    expect(Object.isFrozen(ref)).toBe(true);
  }

  @Verifies<ParticipationContractsFeature>('freezesAndValidatesFeatureReferences')
  "rejects invalid identities"() {
    expect(() => featureReference('cart')).toThrow(/Invalid feature identity/);
    expect(() => featureReference('')).toThrow(/Invalid feature identity/);
  }

  @Verifies<ParticipationContractsFeature>('detectsCatalogueEvolutionErrors')
  "accepts a stable catalogue"() {
    const current = [featureReference('A'), featureReference('B')];
    expect(checkFeatureEvolution(['A', 'B'], current)).toEqual([]);
  }

  @Verifies<ParticipationContractsFeature>('detectsCatalogueEvolutionErrors')
  "flags duplicate identities"() {
    const current = [featureReference('A'), featureReference('A')];
    expect(checkFeatureEvolution(['A'], current)).toContain('Duplicate feature identity');
  }

  @Verifies<ParticipationContractsFeature>('freezesAndValidatesFeatureReferences')
  "requires an explicit retirement when an identity disappears"() {
    const current = [featureReference('B')];
    expect(checkFeatureEvolution(['A', 'B'], current).some((e) => e.includes('without explicit retirement'))).toBe(true);
  }

  @Verifies<ParticipationContractsFeature>('detectsCatalogueEvolutionErrors')
  "accepts a reasoned retirement and validates replacements"() {
    const current = [featureReference('B')];
    expect(checkFeatureEvolution(['A', 'B'], current, { A: { reason: 'merged', replacedBy: 'B' } })).toEqual([]);
    expect(
      checkFeatureEvolution(['A', 'B'], current, { A: { reason: 'merged', replacedBy: 'Z' } }).some((e) =>
        e.includes('Unknown replacement'),
      ),
    ).toBe(true);
  }

  @Verifies<ParticipationContractsFeature>('detectsCatalogueEvolutionErrors')
  "flags broken replacedBy on current features"() {
    const current = [{ id: 'A', replacedBy: 'Z' } as const];
    expect(checkFeatureEvolution(['A'], current).some((e) => e.includes('Unknown replacement for A'))).toBe(true);
  }

  @Verifies<ParticipationContractsFeature>('recordsParticipationOnClassesAndMethods')
  "records participation on a class context"() {
    const a = featureReference('FEAT-A');
    const b = featureReference('FEAT-B');
    class Target {}
    ParticipatesIn(a, b)(Target, { kind: 'class' } as ClassDecoratorContext);
    expect(getParticipation(Target).map((f) => f.id)).toEqual(['FEAT-A', 'FEAT-B']);
  }

  @Verifies<ParticipationContractsFeature>('recordsParticipationOnClassesAndMethods')
  "accumulates participation across repeated decorations"() {
    const a = featureReference('FEAT-A');
    const b = featureReference('FEAT-B');
    class Target {}
    ParticipatesIn(a)(Target, { kind: 'class' } as ClassDecoratorContext);
    ParticipatesIn(b)(Target, { kind: 'method' } as ClassMethodDecoratorContext);
    expect(getParticipation(Target).map((f) => f.id)).toEqual(['FEAT-A', 'FEAT-B']);
  }

  @Verifies<ParticipationContractsFeature>('recordsParticipationOnClassesAndMethods')
  "returns an empty list for undecorated values"() {
    expect(getParticipation({})).toEqual([]);
  }

  @Verifies<ParticipationContractsFeature>('rejectsInvalidParticipationTargets')
  "rejects empty or invalid feature lists"() {
    expect(() => ParticipatesIn()).toThrow(/valid feature references/);
    expect(() => ParticipatesIn({ id: 'bad' })).toThrow(/valid feature references/);
  }

  @Verifies<ParticipationContractsFeature>('rejectsInvalidParticipationTargets')
  "rejects unsupported decorator kinds"() {
    const a = featureReference('FEAT-A');
    expect(() =>
      ParticipatesIn(a)({}, { kind: 'getter' } as unknown as ClassDecoratorContext),
    ).toThrow(/class or method/);
  }
}
void ParticipationContractTests;
