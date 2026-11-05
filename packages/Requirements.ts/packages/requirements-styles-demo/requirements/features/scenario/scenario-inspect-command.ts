import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-core';
import { ReqScenarioDrivenWorkflowRequirement } from '../../requirements/req-scenario-driven-workflow';
import { ReqMultiFsmOrchestrationRequirement } from '../../requirements/req-multi-fsm-orchestration';
import { ReqDogFoodRequirement } from '../../requirements/req-dog-food';
import { ReqParallelDeliverableRequirement } from '../../requirements/req-parallel-deliverable';

/**
 * `requirements scenario inspect <file>` — dry-run that prints the FSM
 * transition sequence the player would walk, without any side effect.
 */
@Satisfies(
  ReqScenarioDrivenWorkflowRequirement,
  ReqMultiFsmOrchestrationRequirement,
  ReqParallelDeliverableRequirement,
  ReqDogFoodRequirement,
)
export abstract class ScenarioInspectCommandFeature extends Feature {
  readonly id = 'SCENARIO-INSPECT';
  readonly title = '`requirements scenario inspect <file>` — dry-run FSM trace';
  readonly priority = Priority.Medium;
  readonly enabled = true;

  abstract inspectPrintsProjectLifecycleTransitions(): ACResult;
  abstract inspectPrintsPerFeatureTransitions(): ACResult;
  abstract inspectPrintsPerAcTransitions(): ACResult;
  abstract inspectAnnotatesTransitionsWithEventAndGuard(): ACResult;
  abstract inspectPerformsNoFileWrite(): ACResult;
  abstract inspectSupportsMermaidOutputFlag(): ACResult;
  abstract inspectPrintsExpectedArtifactPaths(): ACResult;
}
