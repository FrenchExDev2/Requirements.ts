/**
 * Visual scaffolder — Playwright snapshot.
 */

import type { FeatureMeta } from '@frenchexdev2/requirements-compliance';
import type { UncoveredAC } from '../stub-templates.js';
import type { TestScaffolder } from './port.js';

export const VisualScaffolder: TestScaffolder = {
  level: 'visual',
  defaultDir: 'test/visual',
  filenameSuffix: '.visual.test.ts',
  description: 'Playwright visual-regression stub — toHaveScreenshot baseline comparison.',
  generate(feature: FeatureMeta, uncovered: readonly UncoveredAC[]): string {
    if (uncovered.length === 0) return '';

    const featureFile = feature.file.replace(/\.ts$/, '');
    const shortName = feature.className.replace(/Feature$/, '');
    const lines: string[] = [];

    lines.push(`import { test, expect } from '@playwright/test';`);
    lines.push(`import { FeatureTest, Verifies } from '@frenchexdev2/requirements';`);
    lines.push(`import { ${feature.className} } from '../../requirements/features/${featureFile}';`);
    lines.push('');
    lines.push(`@FeatureTest(${feature.className})`);
    lines.push(`class ${shortName}VisualTests {`);

    for (const ac of uncovered) {
      lines.push(`  @Verifies<${feature.className}>('${ac.ac}')`);
      lines.push(`  async '${ac.ac}'({ page }: { page: import('@playwright/test').Page }) {`);
      lines.push(`    // Example: await page.goto('/'); await expect(page).toHaveScreenshot('${ac.ac}.png');`);
      lines.push(`    throw new Error('Not implemented: ${feature.id}/${ac.ac}');`);
      lines.push(`  }`);
      lines.push('');
    }

    lines.push('}');
    lines.push('');
    return lines.join('\n');
  },
};
