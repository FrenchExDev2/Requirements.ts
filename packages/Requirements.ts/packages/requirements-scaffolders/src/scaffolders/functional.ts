/**
 * Functional scaffolder — vitest integration style (no browser, real I/O).
 */

import type { FeatureMeta } from '@frenchexdev2/requirements-compliance';
import type { UncoveredAC } from '../stub-templates.js';
import type { TestScaffolder } from './port.js';

export const FunctionalScaffolder: TestScaffolder = {
  level: 'functional',
  defaultDir: 'test/functional',
  filenameSuffix: '.functional.test.ts',
  description: 'Vitest functional/integration stub — real I/O fixtures, no browser.',
  generate(feature: FeatureMeta, uncovered: readonly UncoveredAC[]): string {
    if (uncovered.length === 0) return '';

    const featureFile = feature.file.replace(/\.ts$/, '');
    const shortName = feature.className.replace(/Feature$/, '');
    const lines: string[] = [];

    lines.push(`import { expect } from 'vitest';`);
    lines.push(`import { FeatureTest, Verifies } from '@frenchexdev2/requirements';`);
    lines.push(`import { ${feature.className} } from '../../requirements/features/${featureFile}';`);
    lines.push('');
    lines.push(`@FeatureTest(${feature.className})`);
    lines.push(`class ${shortName}FunctionalTests {`);

    for (const ac of uncovered) {
      lines.push(`  @Verifies<${feature.className}>('${ac.ac}')`);
      lines.push(`  async '${ac.ac}'() {`);
      lines.push(`    throw new Error('Not implemented: ${feature.id}/${ac.ac}');`);
      lines.push(`  }`);
      lines.push('');
    }

    lines.push('}');
    lines.push('');
    return lines.join('\n');
  },
};
