// Reuse the original behavioral contracts, instrumenting the shared kernel itself.
import '../../../requirements-core/test/unit/base.test.js';
import '../../../requirements-core/test/unit/decorators.test.js';
import '../../../requirements-core/test/unit/style-vocabulary.test.js';
import '../../../requirements-core/test/unit/style-type-helpers.types.test.js';
import '../../../requirements-lib/test/unit/types-smart-constructors.test.js';
import { expect } from 'vitest';
import {
  FeatureTest,
  Verifies,
  TypeCheckOnly,
  getRequirementRegistry,
  getExcludedMethods,
  featureClassName,
  requirementClassName,
  kebabOfId,
} from '@frenchexdev2/requirements-shared-kernel';
import { featureId, requirementId } from '@frenchexdev2/requirements-shared-kernel/types';
import { KernelContractsFeature } from '../../src/kernel-contracts.js';

@FeatureTest(KernelContractsFeature)
class KernelContractTests {
  @Verifies<KernelContractsFeature>('idNamesPreserveVocabulary')
  idNamesPreserveVocabulary() {
    expect(kebabOfId('REQ-CART-CHECKOUT')).toBe('req-cart-checkout');
    expect(featureClassName(featureId('CART-CHECKOUT'))).toBe('CartCheckoutFeature');
    expect(requirementClassName(requirementId('REQ-CART-CHECKOUT'))).toBe('ReqCartCheckoutRequirement');
  }
  @Verifies<KernelContractsFeature>('typeCheckOnlyKeepsTestTrace')
  @TypeCheckOnly()
  typeCheckOnlyKeepsTestTrace() {
    expect(getRequirementRegistry().some(ref=>ref.testClass==='KernelContractTests'&&ref.ac==='typeCheckOnlyKeepsTestTrace')).toBe(true);
    expect(getExcludedMethods().has('KernelContractTests.typeCheckOnlyKeepsTestTrace')).toBe(false);
  }
}
void KernelContractTests;
