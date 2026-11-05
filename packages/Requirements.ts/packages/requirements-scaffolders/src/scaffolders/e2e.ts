/**
 * End-to-End scaffolder — delegates to `generateE2eTestStub`.
 */

import type { FeatureMeta } from '@frenchexdev2/requirements-compliance';
import { generateE2eTestStub, type UncoveredAC } from '../stub-templates.js';
import type { TestScaffolder } from './port.js';

export const E2eScaffolder: TestScaffolder = {
  level: 'e2e',
  defaultDir: 'test/e2e',
  filenameSuffix: '.spec.ts',
  description: 'Playwright end-to-end test stub — real browser, real routes.',
  generate(feature: FeatureMeta, uncovered: readonly UncoveredAC[]): string {
    return generateE2eTestStub(feature, uncovered);
  },
};
