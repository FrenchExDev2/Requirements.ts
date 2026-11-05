import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-core';
import { ReqAiAsImplementerAdapterRequirement } from '../../requirements/req-ai-as-implementer-adapter';
import { ReqScenarioDrivenWorkflowRequirement } from '../../requirements/req-scenario-driven-workflow';
import { ReqDogFoodRequirement } from '../../requirements/req-dog-food';
import { ReqParallelDeliverableRequirement } from '../../requirements/req-parallel-deliverable';

/**
 * AiAdapter port + two implementations:
 *   - StubAiAdapter    — deterministic throw-stub body; no network.
 *   - ClaudeAiAdapter  — Claude API with prompt caching per claude-api skill.
 */
@Satisfies(
  ReqAiAsImplementerAdapterRequirement,   // primary
  ReqScenarioDrivenWorkflowRequirement,
  ReqParallelDeliverableRequirement,
  ReqDogFoodRequirement,
)
export abstract class ScenarioAiAdapterFeature extends Feature {
  readonly id = 'SCENARIO-AI-ADAPTER';
  readonly title = 'AiAdapter port + Stub + ClaudeApi implementations with prompt caching';
  readonly priority = Priority.Medium;
  readonly enabled = true;

  // ── Port ──
  abstract aiAdapterPortIsDefinedInPortsModule(): ACResult;
  abstract aiAdapterPortExposesImplementAcMethod(): ACResult;
  abstract aiAdapterPortReturnsStructuredSourceResult(): ACResult;

  // ── Stub implementation ──
  abstract stubAdapterReturnsDeterministicThrowStub(): ACResult;
  abstract stubAdapterPerformsNoNetworkIo(): ACResult;
  abstract stubAdapterIsSelectedWhenAiFlagAbsent(): ACResult;

  // ── Claude implementation ──
  abstract claudeAdapterIsolatesAnthropicImport(): ACResult;
  abstract claudeAdapterEnablesPromptCachingByDefault(): ACResult;
  abstract claudeAdapterRespectsApiKeyFromEnv(): ACResult;
  abstract claudeAdapterRetriesOnTransientErrors(): ACResult;
  abstract claudeAdapterEmitsTelemetryOnCacheHitMiss(): ACResult;
}
