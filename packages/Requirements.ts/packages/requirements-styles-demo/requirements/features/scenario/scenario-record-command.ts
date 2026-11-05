import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-core';
import { ReqScenarioDrivenWorkflowRequirement } from '../../requirements/req-scenario-driven-workflow';
import { ReqDogFoodRequirement } from '../../requirements/req-dog-food';
import { ReqParallelDeliverableRequirement } from '../../requirements/req-parallel-deliverable';

/**
 * `requirements scenario record` — capture an interactive wizard session (or
 * an existing project) into a Scenario JSON file ready for replay.
 */
@Satisfies(
  ReqScenarioDrivenWorkflowRequirement,
  ReqParallelDeliverableRequirement,
  ReqDogFoodRequirement,
)
export abstract class ScenarioRecordCommandFeature extends Feature {
  readonly id = 'SCENARIO-RECORD';
  readonly title = '`requirements scenario record` — capture a session into a scenario file';
  readonly priority = Priority.Medium;
  readonly enabled = true;

  abstract recordCapturesInteractiveWizardSession(): ACResult;
  abstract recordCapturesFromExistingProject(): ACResult;
  abstract recordEmitsSchemaVersionedJson(): ACResult;
  abstract recordIncludesSatisfiesForwardReferences(): ACResult;
  abstract recordIncludesExpectsPerAc(): ACResult;
  abstract recordReplayFidelityProducesIdenticalArtifacts(): ACResult;
  abstract recordRefusesOverwriteWithoutForce(): ACResult;
  abstract recordOutputPassesValidateCommand(): ACResult;
  abstract recordSupportsPartialSeedingFromFeaturesOnly(): ACResult;
}
