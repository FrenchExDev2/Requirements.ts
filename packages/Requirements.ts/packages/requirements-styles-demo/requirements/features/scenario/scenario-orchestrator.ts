import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-core';
import { ReqScenarioDrivenWorkflowRequirement } from '../../requirements/req-scenario-driven-workflow';
import { ReqMultiFsmOrchestrationRequirement } from '../../requirements/req-multi-fsm-orchestration';
import { ReqAiAsImplementerAdapterRequirement } from '../../requirements/req-ai-as-implementer-adapter';
import { ReqDogFoodRequirement } from '../../requirements/req-dog-food';
import { ReqParallelDeliverableRequirement } from '../../requirements/req-parallel-deliverable';

/**
 * Scenario orchestrator — owns the 3 FSM transitions, event dispatch, and
 * replay log. Consumed by `scenario play` / `scenario inspect`.
 *
 * FSMs: ProjectLifecycleFsm (one) · PerFeatureFsm (one per feature seed) ·
 * PerAcFsm (one per AC). Cross-FSM coupling is event-only.
 */
@Satisfies(
  ReqMultiFsmOrchestrationRequirement,    // primary
  ReqScenarioDrivenWorkflowRequirement,   // joint: consumed by `play`
  ReqAiAsImplementerAdapterRequirement,   // joint: PerAcFsm delegates to adapter
  ReqParallelDeliverableRequirement,
  ReqDogFoodRequirement,
)
export abstract class ScenarioOrchestratorFeature extends Feature {
  readonly id = 'SCENARIO-ORCHESTRATOR';
  readonly title = 'Scenario orchestrator — 3 coordinated FSMs + event bus + replay log';
  readonly priority = Priority.High;
  readonly enabled = true;

  // ── ProjectLifecycleFsm (8 states + Failed) ──
  abstract projectLifecycleStartsInEmpty(): ACResult;
  abstract loadScenarioTransitionsEmptyToSeeded(): ACResult;
  abstract generateRequirementsTransitionsSeededToRequirementsDrafted(): ACResult;
  abstract deriveFeaturesTransitionsToFeaturesDerived(): ACResult;
  abstract scaffoldTransitionsToScaffoldingReady(): ACResult;
  abstract implementTransitionsToImplementing(): ACResult;
  abstract allAcsDoneTransitionsToVerifying(): ACResult;
  abstract verifyTransitionsVerifyingToPublished(): ACResult;
  abstract everyProjectLifecycleTransitionIsTested(): ACResult;
  abstract anyStepFailureTransitionsToFailed(): ACResult;

  // ── PerFeatureFsm ──
  abstract perFeatureSpawnsOnePerFeatureSeed(): ACResult;
  abstract everyPerFeatureTransitionIsTested(): ACResult;
  abstract perFeatureAggregatesAcImplementedCount(): ACResult;

  // ── PerAcFsm ──
  abstract perAcSpawnsOnePerAc(): ACResult;
  abstract everyPerAcTransitionIsTested(): ACResult;
  abstract perAcFiresAcImplementedOnTestPassing(): ACResult;

  // ── Event bus + replay log ──
  abstract orchestratorAppendsEveryEventToReplayLog(): ACResult;
  abstract orchestratorReplaysFromLogProducesIdenticalFinalStates(): ACResult;
  abstract orchestratorCrossCouplingIsEventsOnly(): ACResult;

  // ── Determinism ──
  abstract orchestratorIsDeterministicUnderFixedSeed(): ACResult;
}
