/**
 * Internationalization scaffolder — Playwright-driven locale sweep.
 *
 * Asserts that UI strings have translations in every configured locale and
 * that layout survives RTL / long-language-variant expansion (German ≈ +30%,
 * Finnish ≈ +50%). Adjust the locale list to match your i18n setup.
 */

import type { FeatureMeta } from '@frenchexdev2/requirements-compliance';
import type { UncoveredAC } from '../stub-templates.js';
import type { TestScaffolder } from './port.js';

export const I18nScaffolder: TestScaffolder = {
  level: 'i18n',
  defaultDir: 'test/i18n',
  filenameSuffix: '.i18n.test.ts',
  description: 'Playwright locale-sweep i18n stub — missing-key + RTL + text-expansion checks.',
  generate(feature: FeatureMeta, uncovered: readonly UncoveredAC[]): string {
    if (uncovered.length === 0) return '';

    const featureFile = feature.file.replace(/\.ts$/, '');
    const shortName = feature.className.replace(/Feature$/, '');
    const lines: string[] = [];

    lines.push(`import { test, expect } from '@playwright/test';`);
    lines.push(`import { FeatureTest, Verifies } from '@frenchexdev2/requirements';`);
    lines.push(`import { ${feature.className} } from '../../requirements/features/${featureFile}';`);
    lines.push('');
    lines.push(`// Adjust to the project's supported locales.`);
    lines.push(`const LOCALES = ['en', 'fr', 'de', 'ar'] as const;`);
    lines.push('');
    lines.push(`@FeatureTest(${feature.className})`);
    lines.push(`class ${shortName}I18nTests {`);

    for (const ac of uncovered) {
      lines.push(`  @Verifies<${feature.className}>('${ac.ac}')`);
      lines.push(`  async '${ac.ac}'({ page }: { page: import('@playwright/test').Page }) {`);
      lines.push(`    // Example: for (const locale of LOCALES) {`);
      lines.push(`    //   await page.context().addInitScript((l: string) => navigator.language = l, locale);`);
      lines.push(`    //   await page.goto('/');`);
      lines.push(`    //   // assert no raw keys leaked (e.g. pattern: ^[a-z][a-z0-9._-]*$ in visible text)`);
      lines.push(`    //   // assert RTL layout intact for 'ar'`);
      lines.push(`    //   // assert no overflow / clipped text in the longest locale`);
      lines.push(`    // }`);
      lines.push(`    throw new Error('Not implemented: ${feature.id}/${ac.ac}');`);
      lines.push(`  }`);
      lines.push('');
    }

    lines.push('}');
    lines.push('');
    return lines.join('\n');
  },
};
