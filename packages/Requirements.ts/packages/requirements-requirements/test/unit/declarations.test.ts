import { expect } from 'vitest';
import { Feature, Requirement, FeatureTest, Verifies, Priority } from '@frenchexdev2/requirements-shared-kernel';
import { featureId, requirementId } from '@frenchexdev2/requirements-shared-kernel/types';
import * as declarations from '../../src/index.js';
import { DeclarationContractsFeature } from '../../src/declaration-contracts.js';
import { DefaultStyle } from '../../../requirements-styles/src/default.js';

function assertPresentMetadata(value: unknown, path: string): void {
  if (typeof value === 'string') expect(value.trim().length, path).toBeGreaterThan(0);
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) assertPresentMetadata(child, `${path}.${key}`);
}

@FeatureTest(DeclarationContractsFeature)
class DeclarationContractTests {
  @Verifies<DeclarationContractsFeature>('featureMetadataValid')
  featureMetadataValid() {
    const features=Object.values(declarations).filter(value=>typeof value==='function'&&value.prototype instanceof Feature);
    expect(features.length).toBeGreaterThan(0);
    const ids=new Set<string>();
    for(const feature of features) {
      const value=Reflect.construct(feature,[]) as Feature;
      expect(featureId(value.id)).toBe(value.id);
      expect(value.title.trim().length).toBeGreaterThan(0);
      expect(Object.values(Priority)).toContain(value.priority);
      expect(ids.has(value.id),`duplicate feature id ${value.id}`).toBe(false);
      ids.add(value.id);
    }
  }
  @Verifies<DeclarationContractsFeature>('requirementMetadataValid')
  requirementMetadataValid() {
    const requirements=Object.values(declarations).filter(value=>typeof value==='function'&&value.prototype instanceof Requirement);
    expect(requirements.length).toBeGreaterThan(0);
    const ids=new Set<string>();
    for(const requirement of requirements) {
      const value=Reflect.construct(requirement,[]) as Requirement;
      expect(requirementId(value.id)).toBe(value.id);
      expect(value.title.trim().length).toBeGreaterThan(0);
      expect(Object.values(Priority)).toContain(value.priority);
      expect(value.status.length).toBeGreaterThan(0);
      expect(DefaultStyle.validators.validateSpec({ ...value, kind: 'requirement', requirementKind: value.kind }).ok, value.id).toBe(true);
      expect(DefaultStyle.vocabulary.rationaleKinds).toContain(value.rationale.kind);
      expect(DefaultStyle.vocabulary.verificationMethods).toContain(value.verificationMethod);
      expect(DefaultStyle.vocabulary.riskTaxonomy.levels).toContain(value.risk.level);
      expect(DefaultStyle.vocabulary.sourceKinds.map(source => source.kind)).toContain(value.source.type);
      expect(value.fitCriteria.length, value.id).toBeGreaterThan(0);
      assertPresentMetadata(value, value.id);
      expect(ids.has(value.id),`duplicate requirement id ${value.id}`).toBe(false);
      ids.add(value.id);
    }
  }
}
void DeclarationContractTests;
