import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { StyleValidatorsFeature } from '@frenchexdev2/requirements-requirements';
import { FixtureStyle } from './_style-fixture';

@FeatureTest(StyleValidatorsFeature)
class StyleValidatorsContractTests {
  @Verifies<StyleValidatorsFeature>('validateStatementReturnsValidationResult')
  'validateStatement returns a ValidationResult with ok + errors'() {
    const r = FixtureStyle.validators.validateStatement({ pattern: 'ubiquitous', response: 'work' });
    expect(typeof r.ok).toBe('boolean');
    expect(Array.isArray(r.errors)).toBe(true);
  }

  @Verifies<StyleValidatorsFeature>('validateSpecReturnsValidationResult')
  'validateSpec returns a ValidationResult with ok + errors'() {
    const r = FixtureStyle.validators.validateSpec({ id: 'REQ-1', title: 'T' });
    expect(typeof r.ok).toBe('boolean');
    expect(Array.isArray(r.errors)).toBe(true);
  }

  @Verifies<StyleValidatorsFeature>('validationErrorHasPathAndMessage')
  'every ValidationError carries a path and a message'() {
    const r = FixtureStyle.validators.validateStatement({ pattern: 'unknown-pattern' });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
    for (const err of r.errors) {
      expect(typeof err.path).toBe('string');
      expect(typeof err.message).toBe('string');
      expect(err.message.length).toBeGreaterThan(0);
    }
  }

  @Verifies<StyleValidatorsFeature>('validSpecReturnsOkTrueEmptyErrors')
  'a spec conforming to the style returns ok:true with no errors'() {
    const r = FixtureStyle.validators.validateSpec({ id: 'REQ-1', title: 'Valid' });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  }
}

void StyleValidatorsContractTests;
