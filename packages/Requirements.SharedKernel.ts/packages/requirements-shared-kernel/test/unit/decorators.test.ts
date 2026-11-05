import { expect } from 'vitest';
import {
  FeatureTest,
  Verifies,
  TypeCheckOnly,
  Exclude,
  Expects,
  Satisfies,
  Refines,
  getRequirementRegistry,
  getExcludedMethods,
  getSatisfactionLinks,
  getRefinementLinks,
  Feature,
  Requirement,
  Priority,
  TestLevel,
} from '../../src/index.js';

abstract class KernelDecoratorsFeature extends Feature {
  readonly id = 'KERNEL-DECORATORS';
  readonly title = 'Kernel decorators';
  readonly description = 'Local stub';
  readonly priority = Priority.High;
  abstract registryAndExclude(): unknown;
  abstract typeCheckOnlyKeepsTestTrace(): unknown;
}

@Satisfies()
abstract class DummySatisfiedRequirement extends Requirement {
  readonly id = 'REQ-DUMMY';
  readonly title = 'Dummy';
  readonly description = 'x';
  readonly priority = Priority.Low;
  readonly status = 'Draft';
}

@Refines()
abstract class DummyChildRequirement extends Requirement {
  readonly id = 'REQ-DUMMY-CHILD';
  readonly title = 'Child';
  readonly description = 'x';
  readonly priority = Priority.Low;
  readonly status = 'Draft';
}

@FeatureTest(KernelDecoratorsFeature)
class KernelDecoratorsTests {
  @Verifies<KernelDecoratorsFeature>('registryAndExclude')
  registryAndExclude() {
    const refs = getRequirementRegistry();
    expect(refs.some((r) => r.testClass === 'KernelDecoratorsTests' && r.ac === 'registryAndExclude')).toBe(true);
    expect(getExcludedMethods().has('KernelDecoratorsTests.helper')).toBe(true);
    expect(Array.isArray(getSatisfactionLinks())).toBe(true);
    expect(Array.isArray(getRefinementLinks())).toBe(true);
    Expects(TestLevel.Unit);
  }

  @Exclude()
  helper() {
    return 'skip-me';
  }

  @Verifies<KernelDecoratorsFeature>('typeCheckOnlyKeepsTestTrace')
  @TypeCheckOnly()
  typeCheckOnlyKeepsTestTrace() {
    expect(getRequirementRegistry().some((ref) => ref.testClass === 'KernelDecoratorsTests' && ref.ac === 'typeCheckOnlyKeepsTestTrace')).toBe(true);
    expect(getExcludedMethods().has('KernelDecoratorsTests.typeCheckOnlyKeepsTestTrace')).toBe(false);
  }
}
void KernelDecoratorsTests;
void DummySatisfiedRequirement;
void DummyChildRequirement;
