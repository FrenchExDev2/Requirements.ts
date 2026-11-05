import { expect } from 'vitest';
import { describe, it } from 'vitest';
import { Feature, Requirement, Priority, TestLevel } from '../../src/base.js';

describe('base types', () => {
  it('exposes enums and allows concrete Feature/Requirement subclasses', () => {
    expect(Object.values(Priority)).toContain('high');
    expect(Object.values(TestLevel)).toContain('e2e');

    class ConcreteFeature extends Feature {
      readonly id = 'F';
      readonly title = 't';
      readonly description = 'd';
      readonly priority = Priority.Low;
    }
    class ConcreteRequirement extends Requirement {
      readonly id = 'REQ-F';
      readonly title = 't';
      readonly description = 'd';
      readonly priority = Priority.Low;
      readonly status = 'Draft';
    }
    expect(new ConcreteFeature()).toBeInstanceOf(Feature);
    expect(new ConcreteRequirement()).toBeInstanceOf(Requirement);
  });
});
