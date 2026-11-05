/**
 * Performance scaffolder — vitest + performance.now() latency budget.
 */

import type { FeatureMeta } from '@frenchexdev2/requirements-compliance';
import type { UncoveredAC } from '../stub-templates.js';
import type { TestScaffolder } from './port.js';

export const PerfScaffolder: TestScaffolder = {
  level: 'perf',
  defaultDir: 'test/perf',
  filenameSuffix: '.perf.test.ts',
  description: 'Vitest performance stub — performance.now() latency budget assertion.',
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
    lines.push(`class ${shortName}PerfTests {`);

    for (const ac of uncovered) {
      lines.push(`  @Verifies<${feature.className}>('${ac.ac}')`);
      lines.push(`  async '${ac.ac}'() {`);
      lines.push(`    const BUDGET_MS = 100;`);
      lines.push(`    const t0 = performance.now();`);
      lines.push(`    // Exercise the code path under test here.`);
      lines.push(`    const elapsed = performance.now() - t0;`);
      lines.push(`    expect(elapsed).toBeLessThan(BUDGET_MS);`);
      lines.push(`    throw new Error('Not implemented: ${feature.id}/${ac.ac}');`);
      lines.push(`  }`);
      lines.push('');
    }

    lines.push('}');
    lines.push('');
    return lines.join('\n');
  },
};
