import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqDogFoodRequirement } from './req-dog-food.js';
import { ReqRefactorSafeRequirement } from './req-refactor-safe.js';
/** Contracts shared by generators, renames and type-only test declarations. */
@Satisfies(ReqDogFoodRequirement, ReqRefactorSafeRequirement)
export abstract class KernelContractsFeature extends Feature {
  readonly id='KERNEL-CONTRACTS';
  readonly title='Stable ID names and preservation of type-only test traceability';
  readonly priority=Priority.High;
  abstract idNamesPreserveVocabulary(): ACResult;
  abstract typeCheckOnlyKeepsTestTrace(): ACResult;
}
