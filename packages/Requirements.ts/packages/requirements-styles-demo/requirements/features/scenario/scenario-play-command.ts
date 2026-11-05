import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-core';
import { ReqScenarioDrivenWorkflowRequirement } from '../../requirements/req-scenario-driven-workflow';
import { ReqMultiFsmOrchestrationRequirement } from '../../requirements/req-multi-fsm-orchestration';
import { ReqAiAsImplementerAdapterRequirement } from '../../requirements/req-ai-as-implementer-adapter';
import { ReqDogFoodRequirement } from '../../requirements/req-dog-food';
import { ReqParallelDeliverableRequirement } from '../../requirements/req-parallel-deliverable';

/**
 * `requirements scenario play <file>` — the end-to-end playback command.
 *
 * Loads a Scenario JSON, validates it against scenario.schema.json, runs it
 * through the 3 coordinated FSMs (ProjectLifecycle / PerFeature / PerAc),
 * and at the end runs `compliance --strict` on the generated project.
 */
@Satisfies(
  ReqScenarioDrivenWorkflowRequirement,   // primary
  ReqMultiFsmOrchestrationRequirement,    // joint: dispatches to the orchestrator
  ReqAiAsImplementerAdapterRequirement,   // joint: --ai flag
  ReqParallelDeliverableRequirement,      // joint: Scenario stream deliverable
  ReqDogFoodRequirement,                  // joint: tests use @FeatureTest
)
export abstract class ScenarioPlayCommandFeature extends Feature {
  readonly id = 'SCENARIO-PLAY';
  readonly title = '`requirements scenario play <file>` — non-interactive project generation';
  readonly priority = Priority.High;
  readonly enabled = true;

  // ── Loading & validation ──
  abstract scenarioPlayLoadsScenarioJson(): ACResult;
  abstract scenarioPlayValidatesAgainstSchema(): ACResult;
  abstract scenarioPlayRejectsUnknownStyle(): ACResult;
  abstract scenarioPlayRejectsDanglingForwardReferences(): ACResult;

  // ── Orchestration ──
  abstract scenarioPlayDispatchesToOrchestrator(): ACResult;
  abstract scenarioPlayProducesFourTierProject(): ACResult;

  // ── Narration (clack intro/outro) ──
  abstract scenarioPlayEmitsIntroNarration(): ACResult;
  abstract scenarioPlayEmitsOutroNarration(): ACResult;
  abstract scenarioPlayRespectsStepDelayMs(): ACResult;

  // ── Flags ──
  abstract scenarioPlayHonoursAiFlag(): ACResult;
  abstract scenarioPlayNoAiFlagEmitsDeterministicStubs(): ACResult;
  abstract scenarioPlaySeedFlagMakesRunDeterministic(): ACResult;
  abstract scenarioPlayDryRunPrintsWithoutWriting(): ACResult;

  // ── Closure ──
  abstract scenarioPlayRunsComplianceStrictAtEnd(): ACResult;
  abstract scenarioPlayAssertsExpectedArtifactsExist(): ACResult;
}
