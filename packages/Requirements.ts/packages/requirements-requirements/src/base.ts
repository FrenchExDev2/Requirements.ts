import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqDslCompleteRequirement } from './req-dsl-complete.js';
import { ReqRefactorSafeRequirement } from './req-refactor-safe.js';

@Satisfies(
  ReqDslCompleteRequirement,
  ReqRefactorSafeRequirement,
)
export abstract class BaseTypesFeature extends Feature {
  readonly id = 'BASE-TYPES';
  readonly title = 'Requirements DSL — base types (Priority, TestLevel, Feature)';
  readonly priority = Priority.High;

  abstract priorityEnumExposesAllLevels(): ACResult;
  abstract testLevelEnumExposesAllLevels(): ACResult;
  abstract featureClassIsAbstract(): ACResult;
}
