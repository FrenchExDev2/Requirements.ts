import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqRoundTripEditableRequirement } from './req-round-trip-editable.js';
import { ReqDogFoodRequirement } from './req-dog-food.js';
import { ReqParallelDeliverableRequirement } from './req-parallel-deliverable.js';

/** Tier-2 roadmap — enriched ACs for implementer agent. */
@Satisfies(
  ReqRoundTripEditableRequirement,
  ReqDogFoodRequirement,
  ReqParallelDeliverableRequirement,
)
export abstract class FeatureBidirectionalSyncFeature extends Feature {
  readonly id = 'FEATURE-BIDIRECTIONAL-SYNC';
  readonly title = 'Bidirectional sync — either .ts class or .spec.json is authoritative';
  readonly priority = Priority.Medium;
  readonly enabled = false;

  // ── Positive path ──
  abstract bidirectionalSyncTsToJson(): ACResult;
  abstract bidirectionalSyncJsonToTs(): ACResult;
  abstract roundTripIsIdempotentAfterThreeCycles(): ACResult;
  abstract syncPreservesCommentsAndDecoratorOrderInTs(): ACResult;

  // ── Error / validation paths ──
  abstract syncRefusesAmbiguousMerge(): ACResult;
  abstract syncDetectsDivergenceBetweenSources(): ACResult;
  abstract syncRefusesWhenTsDoesNotCompile(): ACResult;

  // ── Integration ──
  abstract syncWritesViaFileSystemPort(): ACResult;
  abstract syncEmitsSchemaVersionOnJsonOutput(): ACResult;

  // ── End-to-end ──
  abstract endToEndTsEditFlowsIntoJsonAndBack(): ACResult;
}
