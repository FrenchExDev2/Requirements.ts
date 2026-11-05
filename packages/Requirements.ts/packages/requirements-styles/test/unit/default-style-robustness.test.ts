/**
 * Property-based robustness tests for the DefaultStyle preset.
 *
 * Validators and reporters of `DefaultStyle` must accept arbitrary runtime
 * input without crashing — they sit at the FFI / JSON.parse boundary and
 * must not assume input shape.
 *
 * Moved from `@frenchexdev2/requirements-lib`'s `property.test.ts` because
 * the code under test (DefaultStyle) lives here.
 */

import { expect } from 'vitest';
import * as fc from '../../../../test/support/qualification-fast-check.js';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { DefaultStyleRobustnessFeature } from '../../requirements/features/default-style-robustness';
import { DefaultStyle } from '../../src/index';

function assertValidationShape(r: unknown): void {
  expect(r).toBeDefined();
  expect(typeof (r as { ok: unknown }).ok).toBe('boolean');
  expect(Array.isArray((r as { errors: unknown }).errors)).toBe(true);
}

@FeatureTest(DefaultStyleRobustnessFeature)
class DefaultStyleRobustnessTests {
  @Verifies<DefaultStyleRobustnessFeature>('validateSpecNeverCrashesOnRandomInput')
  'validateSpec never crashes; returns {ok, errors[]}'() {
    fc.assert(fc.property(fc.anything(), (input: unknown) => {
      let r: unknown;
      try {
        r = DefaultStyle.validators.validateSpec(input);
      } catch (e) {
        throw new Error(`validateSpec threw on ${JSON.stringify(input)}: ${(e as Error)?.message}`);
      }
      assertValidationShape(r);
    }), { numRuns: 200 });
  }

  @Verifies<DefaultStyleRobustnessFeature>('validateStatementNeverCrashesOnRandomInput')
  'validateStatement never crashes; returns {ok, errors[]}'() {
    fc.assert(fc.property(fc.anything(), (input: unknown) => {
      let r: unknown;
      try {
        r = DefaultStyle.validators.validateStatement(input);
      } catch (e) {
        throw new Error(`validateStatement threw on ${JSON.stringify(input)}: ${(e as Error)?.message}`);
      }
      assertValidationShape(r);
    }), { numRuns: 200 });
  }

  @Verifies<DefaultStyleRobustnessFeature>('renderStatementNeverCrashesOnRandomInput')
  'renderStatement returns string; never throws'() {
    fc.assert(fc.property(fc.anything(), (input: unknown) => {
      let r: unknown;
      try {
        r = DefaultStyle.reporter.renderStatement(input);
      } catch (e) {
        throw new Error(`renderStatement threw on ${JSON.stringify(input)}: ${(e as Error)?.message}`);
      }
      expect(typeof r).toBe('string');
    }), { numRuns: 200 });
  }
}

void DefaultStyleRobustnessTests;
