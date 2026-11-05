import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { QualificationFeature } from '../../../requirements-requirements/src/qualification-contracts.js';
import * as fc from '../../../../test/support/qualification-fast-check.js';
import { parseQualificationEvidence } from '../../src/qualification-project.js';
import { inspectQualificationTests } from '../../src/qualification-inventory.js';

@FeatureTest(QualificationFeature, { timeout: 120_000 })
class QualificationFuzzTests {
  @Verifies<QualificationFeature>('loadsRetainedEvidenceSafely')
  arbitraryJsonNeverBecomesSuccessfulEvidenceByDefault() {
    fc.assert(fc.property(fc.jsonValue(), value => {
      expect(() => parseQualificationEvidence(JSON.stringify({ schemaVersion: 0, payload: value }))).toThrow();
    }), { numRuns: 10000 });
  }

  @Verifies<QualificationFeature>('inspectsAliasedTestRegistration')
  malformedUnicodeSourcesProduceDiagnosticsWithoutExecution() {
    fc.assert(fc.property(fc.string({ maxLength: 256 }), text => {
      const result = inspectQualificationTests({ file: 'test/unit/fuzz-input.test.ts', text }, '/fixture');
      expect(Array.isArray(result.diagnostics)).toBe(true);
      if (!result.tests.length) expect(result.diagnostics.some(d => d.code === 'unregistered-test-file')).toBe(true);
    }), { numRuns: 10000 });
  }
}
void QualificationFuzzTests;
