import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { QualificationInfrastructureFeature } from '../../../requirements-requirements/src/qualification-contracts.js';
import { parseFeatureSource } from '../../src/compliance-core';

@FeatureTest(QualificationInfrastructureFeature)
class GeneratedLevelsTests {
@Verifies<QualificationInfrastructureFeature>('preservesGeneratedTestLevelObligations')
readsGeneratedExpectations() {
for (const [levels, expected] of [
  ['unit, e2e', ['unit', 'e2e']],
  ['functional, a11y, visual, perf, i18n, smoke', ['functional', 'a11y', 'visual', 'perf', 'i18n', 'smoke']],
  ['nonsense', ['unit']],
  ['unit, nonsense, e2e', ['unit', 'e2e']],
] as const) {
  const source = `export abstract class Generated extends Feature {
    abstract verifies(): unknown; // expects: ${levels}
  }`;
  expect(parseFeatureSource(source, 'generated.ts')?.acDetails[0]?.expectedLevels).toEqual(expected);
}
}

@Verifies<QualificationInfrastructureFeature>('preservesGeneratedTestLevelObligations')
preservesDecoratorPrecedence() {
  const source = `export abstract class Generated extends Feature {
    @Expects(TestLevel.Smoke)
    abstract verifies(): unknown; // expects: e2e
  }`;
  expect(parseFeatureSource(source, 'generated.ts')?.acDetails[0]?.expectedLevels).toEqual(['smoke']);
}
}
void GeneratedLevelsTests;
