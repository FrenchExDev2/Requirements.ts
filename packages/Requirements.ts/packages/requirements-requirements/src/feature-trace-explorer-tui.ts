import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqDiscoverableTraceabilityRequirement } from './req-discoverable-traceability.js';
import { ReqDogFoodRequirement } from './req-dog-food.js';
import { ReqParallelDeliverableRequirement } from './req-parallel-deliverable.js';

/** Tier-2 roadmap — enriched ACs for implementer agent. */
@Satisfies(
  ReqDiscoverableTraceabilityRequirement,
  ReqDogFoodRequirement,
  ReqParallelDeliverableRequirement,
)
export abstract class FeatureTraceExplorerTuiFeature extends Feature {
  readonly id = 'FEATURE-TRACE-EXPLORER-TUI';
  readonly title = '`requirements explore` — interactive TTY browser over the traceability graph';
  readonly priority = Priority.Low;
  readonly enabled = true;

  // ── Positive path ──
  abstract traceExplorerBuildsGraph(): ACResult;
  abstract traceExplorerHandlesArrowKeyNavigation(): ACResult;
  abstract traceExplorerDrillsDownFromAnyNode(): ACResult;
  abstract traceExplorerOpensHelpOverlayOnQuestionMark(): ACResult;
  abstract traceExplorerJumpsBackUpWithBackspace(): ACResult;

  // ── Error / validation paths ──
  abstract traceExplorerRefusesToStartOnNonTty(): ACResult;
  abstract traceExplorerExitsCleanlyOnCtrlC(): ACResult;
  abstract traceExplorerHandlesIncompleteRestoredPaths(): ACResult;

  // ── Integration ──
  abstract traceExplorerUsesFileSystemPortForDiscovery(): ACResult;
  abstract traceExplorerUsesPromptPortForInteraction(): ACResult;

  // ── End-to-end ──
  abstract endToEndNavigatesReqToFeatToAcToTest(): ACResult;

  // ── Render primitives (extracted from shell into pure core) ──
  abstract traceExplorerKeyChoicesIncludeAllNavigationActions(): ACResult;
  abstract traceExplorerEmptyStateRendersHelpfulMessage(): ACResult;
  abstract traceExplorerCursorMarkerHighlightsActiveLine(): ACResult;
  abstract traceExplorerActionPromptPluralizesItemCount(): ACResult;
  abstract traceExplorerErrorMessagePrefixesWithCommandName(): ACResult;
}
