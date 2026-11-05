/**
 * Stub templates — pure source generators for unit / e2e test stubs.
 *
 * Lives in its own module (not scaffold-core) to break the cycle that would
 * otherwise form: scaffold-core → scaffolders/registry → scaffolders/unit →
 * scaffold-core. Since unit/e2e scaffolders only need these pure functions
 * (no registry, no spec-io), pulling them out lets the scaffolder modules
 * import from here without re-entering scaffold-core's evaluation.
 */

import type { FeatureMeta, TestLevel } from '@frenchexdev2/requirements-compliance';

export interface UncoveredAC {
  readonly ac: string;
  readonly missingLevels: readonly TestLevel[];
}

export function generateUnitTestStub(
  feature: FeatureMeta,
  uncovered: readonly UncoveredAC[],
): string {
  if (uncovered.length === 0) return '';

  const lines: string[] = [];

  lines.push(`import { expect } from 'vitest';`);
  lines.push(`import { FeatureTest, Verifies } from '@frenchexdev2/requirements';`);
  lines.push(`import { ${feature.className} } from '@frenchexdev2/requirements-requirements';`);
  lines.push('');
  lines.push(`@FeatureTest(${feature.className})`);
  lines.push(`class ${feature.className.replace(/Feature$/, '')}ScaffoldTests {`);

  for (const ac of uncovered) {
    lines.push(`  @Verifies<${feature.className}>('${ac.ac}')`);
    lines.push(`  '${ac.ac}'() {`);
    lines.push(`    throw new Error('Not implemented: ${feature.id}/${ac.ac}');`);
    lines.push(`  }`);
    lines.push('');
  }

  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

export function generateE2eTestStub(
  feature: FeatureMeta,
  uncovered: readonly UncoveredAC[],
): string {
  if (uncovered.length === 0) return '';

  const lines: string[] = [];

  lines.push(`import { test, expect } from '@playwright/test';`);
  lines.push(`import { FeatureTest, Verifies } from '@frenchexdev2/requirements';`);
  lines.push(`import { ${feature.className} } from '@frenchexdev2/requirements-requirements';`);
  lines.push('');
  lines.push(`@FeatureTest(${feature.className})`);
  lines.push(`class ${feature.className.replace(/Feature$/, '')}E2eTests {`);

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
}
