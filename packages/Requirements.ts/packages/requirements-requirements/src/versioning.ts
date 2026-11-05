import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqVersionedTraceabilityRequirement } from './req-versioned-traceability.js';
import { ReqDogFoodRequirement } from '@frenchexdev2/requirements-requirements';
import { ReqParallelDeliverableRequirement } from '@frenchexdev2/requirements-requirements';

/** Tier-2 roadmap — C7. Implements versioned traceability. */
@Satisfies(
  ReqVersionedTraceabilityRequirement,
  ReqDogFoodRequirement,
  ReqParallelDeliverableRequirement,
)
export abstract class VersioningFeature extends Feature {
  readonly id = 'VERSIONING';
  readonly title = 'Versioning — monotonic version + content-hash + pin resolution on every spec node';
  readonly priority = Priority.High;
  readonly enabled = false;

  // ── Positive path: version computation ──
  abstract versionInfoComputesMonotonicInteger(): ACResult;
  abstract versionInfoComputesContentHashDeterministically(): ACResult;
  abstract contentHashExcludesHistoryAndSchemaVersion(): ACResult;
  abstract versionBumpsOnStructuralChange(): ACResult;
  abstract versionDoesNotBumpOnCosmeticChange(): ACResult;
  abstract supersedesLinkChainsSemanticHistory(): ACResult;

  // ── Pinning: decorator surface ──
  abstract satisfiesDecoratorCanPinRequirementVersion(): ACResult;
  abstract verifiesDecoratorCanPinAcVersion(): ACResult;
  abstract pinResolutionResolvesLatestWhenUnpinned(): ACResult;

  // ── Error / validation paths ──
  abstract complianceStrictFailsOnUnpinnedReqDrift(): ACResult;
  abstract complianceStrictWarnsButDoesNotFailOnUnpinned(): ACResult;
  abstract diffCoreDetectsVersionPinMismatch(): ACResult;
  abstract versionBumpRefusesWhenHistoryEntryMissing(): ACResult;

  // ── Integration ──
  abstract historyEntryLogsEveryVersionBump(): ACResult;
  abstract versioningWritesViaFileSystemPort(): ACResult;

  // ── End-to-end ──
  abstract endToEndPinnedFeatureSurvivesRequirementEdit(): ACResult;
}
