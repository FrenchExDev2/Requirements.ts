import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqVisualTraceabilityRequirement } from '@frenchexdev2/requirements-requirements';
import { ReqDogFoodRequirement } from '@frenchexdev2/requirements-requirements';
import { ReqParallelDeliverableRequirement } from '@frenchexdev2/requirements-requirements';

/** Tier-2 roadmap — enriched ACs for implementer agent. */
@Satisfies(
  ReqVisualTraceabilityRequirement,
  ReqDogFoodRequirement,
  ReqParallelDeliverableRequirement,
)
export abstract class FeatureMermaidGraphFeature extends Feature {
  readonly id = 'FEATURE-MERMAID-GRAPH';
  readonly title = '`requirements trace graph --format mermaid` — full REQ→FEAT→AC→TEST DAG';
  readonly priority = Priority.Medium;
  readonly enabled = false;

  // ── Positive path ──
  abstract traceGraphEmitsMermaidFlowchart(): ACResult;
  abstract traceGraphHighlightsDisabledFeatures(): ACResult;
  abstract traceGraphDistinguishesCoveredFromUncoveredAcs(): ACResult;
  abstract traceGraphGroupsAcsUnderTheirFeature(): ACResult;
  abstract traceGraphRendersRefinesEdgesBetweenRequirements(): ACResult;

  // ── Error / validation paths ──
  abstract traceGraphRefusesUnknownFormatFlag(): ACResult;
  abstract traceGraphEmitsWarningWhenCorpusIsEmpty(): ACResult;

  // ── Integration ──
  abstract traceGraphUsesFileSystemPortForDiscovery(): ACResult;
  abstract traceGraphOutputsToStdoutOrFileFlag(): ACResult;

  // ── End-to-end ──
  abstract endToEndRendersSelfFeatureCorpusIntoReadme(): ACResult;
}
