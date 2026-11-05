import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { BaseTypesFeature } from '@frenchexdev2/requirements-requirements';
import { Priority, TestLevel, Feature } from '@frenchexdev2/requirements-core';

@FeatureTest(BaseTypesFeature)
class BaseTypesTests {
  @Verifies<BaseTypesFeature>('priorityEnumExposesAllLevels')
  'Priority enum exposes critical/high/medium/low string values'() {
    expect(Priority.Critical).toBe('critical');
    expect(Priority.High).toBe('high');
    expect(Priority.Medium).toBe('medium');
    expect(Priority.Low).toBe('low');
  }

  @Verifies<BaseTypesFeature>('testLevelEnumExposesAllLevels')
  'TestLevel enum exposes unit/functional/e2e/a11y/visual/perf string values'() {
    expect(TestLevel.Unit).toBe('unit');
    expect(TestLevel.Functional).toBe('functional');
    expect(TestLevel.EndToEnd).toBe('e2e');
    expect(TestLevel.Accessibility).toBe('a11y');
    expect(TestLevel.Visual).toBe('visual');
    expect(TestLevel.Performance).toBe('perf');
  }

  @Verifies<BaseTypesFeature>('featureClassIsAbstract')
  'Feature is an abstract class — instantiation requires a concrete subclass'() {
    // Concrete subclass must define the abstract readonly properties.
    class Concrete extends Feature {
      readonly id = 'X';
      readonly title = 'X';
      readonly priority = Priority.Low;
    }
    const f = new Concrete();
    expect(f.id).toBe('X');
    expect(f.title).toBe('X');
    expect(f.priority).toBe(Priority.Low);
  }
}

void BaseTypesTests;
