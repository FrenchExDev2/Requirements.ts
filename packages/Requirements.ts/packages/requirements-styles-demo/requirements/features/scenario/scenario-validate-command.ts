import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-core';
import { ReqScenarioDrivenWorkflowRequirement } from '../../requirements/req-scenario-driven-workflow';
import { ReqDogFoodRequirement } from '../../requirements/req-dog-food';
import { ReqParallelDeliverableRequirement } from '../../requirements/req-parallel-deliverable';

/**
 * `requirements scenario validate <file>` — validate a scenario against the
 * schema AND cross-check forward references, without executing any side effect.
 */
@Satisfies(
  ReqScenarioDrivenWorkflowRequirement,
  ReqParallelDeliverableRequirement,
  ReqDogFoodRequirement,
)
export abstract class ScenarioValidateCommandFeature extends Feature {
  readonly id = 'SCENARIO-VALIDATE';
  readonly title = '`requirements scenario validate <file>` — schema + cross-reference check';
  readonly priority = Priority.High;
  readonly enabled = true;

  abstract validateAcceptsWellFormedScenario(): ACResult;
  abstract validateRejectsMissingRequiredFields(): ACResult;
  abstract validateReportsAjvErrorsInFriendlyFormat(): ACResult;
  abstract validateCrossChecksSatisfiesForwardReferences(): ACResult;
  abstract validateCrossChecksSatisfiedByForwardReferences(): ACResult;
  abstract validateRejectsDuplicateIds(): ACResult;
  abstract validatePerformsNoFileWrite(): ACResult;
  abstract validateExitsNonZeroOnFailure(): ACResult;
}
