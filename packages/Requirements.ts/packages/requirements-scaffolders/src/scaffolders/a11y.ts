/**
 * Accessibility scaffolder — Playwright + @axe-core/playwright.
 */

import type { FeatureMeta } from '@frenchexdev2/requirements-compliance';
import type { UncoveredAC } from '../stub-templates.js';
import type { TestScaffolder } from './port.js';

export const A11yScaffolder: TestScaffolder = {
  level: 'a11y',
  defaultDir: 'test/a11y',
  filenameSuffix: '.a11y.test.ts',
  description: 'Playwright + @axe-core/playwright a11y stub — WCAG serious/critical gate.',
  generate(feature: FeatureMeta, uncovered: readonly UncoveredAC[]): string {
    if (uncovered.length === 0) return '';

    const featureFile = feature.file.replace(/\.ts$/, '');
    const shortName = feature.className.replace(/Feature$/, '');
    const lines: string[] = [];

    lines.push(`import { test, expect } from '@playwright/test';`);
    lines.push(`import AxeBuilder from '@axe-core/playwright';`);
    lines.push(`import { FeatureTest, Verifies } from '@frenchexdev2/requirements';`);
    lines.push(`import { ${feature.className} } from '../../requirements/features/${featureFile}';`);
    lines.push('');
    lines.push(`@FeatureTest(${feature.className})`);
    lines.push(`class ${shortName}A11yTests {`);

    for (const ac of uncovered) {
      lines.push(`  @Verifies<${feature.className}>('${ac.ac}')`);
      lines.push(`  async '${ac.ac}'({ page }: { page: import('@playwright/test').Page }) {`);
      lines.push(`    // Example: await page.goto('/'); const r = await new AxeBuilder({ page }).analyze();`);
      lines.push(`    //          expect(r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toHaveLength(0);`);
      lines.push(`    throw new Error('Not implemented: ${feature.id}/${ac.ac}');`);
      lines.push(`  }`);
      lines.push('');
    }

    lines.push('}');
    lines.push('');
    return lines.join('\n');
  },
};
