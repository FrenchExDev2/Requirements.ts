/**
 * Unit scaffolder — delegates to the pre-existing `generateUnitTestStub`.
 * Zero duplication (DRY): the proven template lives in scaffold-core.
 */

import type { FeatureMeta } from '@frenchexdev2/requirements-compliance';
import { generateUnitTestStub, type UncoveredAC } from '../stub-templates.js';
import type { TestScaffolder } from './port.js';

export const UnitScaffolder: TestScaffolder = {
  level: 'unit',
  defaultDir: 'test/unit',
  filenameSuffix: '.test.ts',
  description: 'Vitest unit test stub — pure logic, no I/O, no browser.',
  generate(feature: FeatureMeta, uncovered: readonly UncoveredAC[]): string {
    return generateUnitTestStub(feature, uncovered);
  },
};
