import { expect } from 'vitest';
import {
  FeatureTest,
  Verifies,
  Priority,
  TestLevel,
  Feature,
  featureClassName,
  requirementClassName,
  kebabOfId,
} from '../../src/index.js';
import { featureId, requirementId } from '../../src/types.js';

/** Local feature stub — kernel must not import requirements-requirements. */
abstract class KernelIdNamingFeature extends Feature {
  readonly id = 'KERNEL-ID-NAMING';
  readonly title = 'Kernel id naming';
  readonly description = 'Local stub';
  readonly priority = Priority.Medium;
  abstract idNamesPreserveVocabulary(): unknown;
}

@FeatureTest(KernelIdNamingFeature)
class KernelIdNamingTests {
  @Verifies<KernelIdNamingFeature>('idNamesPreserveVocabulary')
  idNamesPreserveVocabulary() {
    expect(kebabOfId('REQ-CART-CHECKOUT')).toBe('req-cart-checkout');
    expect(featureClassName(featureId('CART-CHECKOUT'))).toBe('CartCheckoutFeature');
    expect(requirementClassName(requirementId('REQ-CART-CHECKOUT'))).toBe('ReqCartCheckoutRequirement');
    expect(Priority.Critical).toBe('critical');
    expect(TestLevel.Unit).toBe('unit');
  }
}
void KernelIdNamingTests;
