import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-core';
import { ReqScenarioDrivenWorkflowRequirement } from '../../requirements/req-scenario-driven-workflow';
import { ReqDogFoodRequirement } from '../../requirements/req-dog-food';
import { ReqParallelDeliverableRequirement } from '../../requirements/req-parallel-deliverable';

/**
 * `requirements scenario list` — enumerate built-in and project-defined
 * scenarii, each with id/title/style.
 */
@Satisfies(
  ReqScenarioDrivenWorkflowRequirement,
  ReqParallelDeliverableRequirement,
  ReqDogFoodRequirement,
)
export abstract class ScenarioListCommandFeature extends Feature {
  readonly id = 'SCENARIO-LIST';
  readonly title = '`requirements scenario list` — enumerate available scenarii';
  readonly priority = Priority.Low;
  readonly enabled = true;

  abstract listIncludesBuiltInScenarii(): ACResult;
  abstract listIncludesProjectDefinedScenarii(): ACResult;
  abstract listPrintsIdTitleStyleTriple(): ACResult;
  abstract listSupportsJsonOutputFlag(): ACResult;
  abstract listOrdersAlphabeticallyById(): ACResult;
  abstract listEmptyRegistryPrintsHelpfulHint(): ACResult;
}
