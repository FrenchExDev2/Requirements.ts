import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-core';
import { ReqScenarioDrivenWorkflowRequirement } from '../../requirements/req-scenario-driven-workflow';
import { ReqDogFoodRequirement } from '../../requirements/req-dog-food';
import { ReqParallelDeliverableRequirement } from '../../requirements/req-parallel-deliverable';

/**
 * `requirements scenario export` — post-run export to Markdown / PDF for demo
 * capture (scenario narration + generated artifacts + compliance report).
 */
@Satisfies(
  ReqScenarioDrivenWorkflowRequirement,
  ReqParallelDeliverableRequirement,
  ReqDogFoodRequirement,
)
export abstract class ScenarioExportCommandFeature extends Feature {
  readonly id = 'SCENARIO-EXPORT';
  readonly title = '`requirements scenario export` — post-run Markdown / PDF capture';
  readonly priority = Priority.Low;
  readonly enabled = false;

  abstract exportProducesMarkdownArtifact(): ACResult;
  abstract exportProducesPdfArtifact(): ACResult;
  abstract exportIncludesNarrationBlocks(): ACResult;
  abstract exportIncludesComplianceReport(): ACResult;
  abstract exportIncludesFsmTransitionMermaid(): ACResult;
  abstract exportRefusesOverwriteWithoutForce(): ACResult;
}
