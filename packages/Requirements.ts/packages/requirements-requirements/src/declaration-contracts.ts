import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqDslCompleteRequirement } from './req-dsl-complete.js';
import { ReqDogFoodRequirement } from './req-dog-food.js';
/** Runtime shape of the specification vocabulary, independent of its implementation claims. */
@Satisfies(ReqDslCompleteRequirement, ReqDogFoodRequirement)
export abstract class DeclarationContractsFeature extends Feature {
  readonly id='DECLARATION-CONTRACTS';
  readonly title='Exported specification classes have coherent identifiers and metadata';
  readonly priority=Priority.Critical;
  abstract featureMetadataValid(): ACResult;
  abstract requirementMetadataValid(): ACResult;
}
