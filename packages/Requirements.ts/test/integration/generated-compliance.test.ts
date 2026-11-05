import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements';
import { QualificationInfrastructureFeature } from '../../packages/requirements-requirements/src/qualification-contracts.js';
import { generateFeatureSource } from '../../packages/requirements-spec-io/src/spec-to-source';
import { parseFeatureSource } from '../../packages/requirements-compliance/src/compliance-core';
import { SCHEMA_VERSION, featureId, acName } from '@frenchexdev2/requirements-shared-kernel/types';
import { Priority, TestLevel } from '@frenchexdev2/requirements-shared-kernel';

@FeatureTest(QualificationInfrastructureFeature)
class GeneratedComplianceTests {
@Verifies<QualificationInfrastructureFeature>('preservesGeneratedTestLevelObligations')
preservesUnitAndE2eObligations() {
  const generated = generateFeatureSource({
    $schemaVersion: SCHEMA_VERSION, kind: 'feature', id: featureId('CHECKOUT'),
    title: 'Validation du panier', priority: Priority.High,
    acs: [{ name: acName('completesCheckout'), expects: [TestLevel.Unit, TestLevel.EndToEnd] }],
  });
  const feature = parseFeatureSource(generated, 'checkout.ts');
  expect(feature?.acDetails).toEqual([
    { name: 'completesCheckout', expectedLevels: ['unit', 'e2e'] },
  ]);
}
}
void GeneratedComplianceTests;
