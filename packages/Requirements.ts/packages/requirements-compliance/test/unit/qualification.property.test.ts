import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { QualificationFeature } from '../../../requirements-requirements/src/qualification-contracts.js';
import * as fc from '../../../../test/support/qualification-fast-check.js';
import { equalQualificationHashes, qualificationTestId } from '../../src/qualification.js';

@FeatureTest(QualificationFeature)
class QualificationProperties {
  @Verifies<QualificationFeature>('rejectsMissingStaleOrInterruptedProof')
  fingerprintsAreOrderIndependentButDetectChangedValues() {
    fc.assert(fc.property(fc.dictionary(fc.string(), fc.string(), { minKeys: 1, maxKeys: 12 }), hashes => {
      const reordered = Object.fromEntries(Object.entries(hashes).reverse());
      expect(equalQualificationHashes(hashes, reordered)).toBe(true);
      const key = Object.keys(hashes)[0]!;
      expect(equalQualificationHashes(hashes, { ...hashes, [key]: hashes[key] + '\u0000' })).toBe(false);
    }), { numRuns: 1000 });
  }

  @Verifies<QualificationFeature>('rejectsUnboundOrAssertionlessTests')
  identitiesRoundTripWithoutDelimiterCollisions() {
    fc.assert(fc.property(fc.string(), fc.string(), fc.string(), (file, cls, method) => {
      expect(JSON.parse(qualificationTestId(file, cls, method))).toEqual([file.replaceAll('\\', '/'), cls, method]);
    }), { numRuns: 1000 });
  }
}
void QualificationProperties;
