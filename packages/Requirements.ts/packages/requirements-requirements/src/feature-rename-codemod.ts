import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqRefactorSafeRequirement } from './req-refactor-safe.js';
import { ReqDogFoodRequirement } from '@frenchexdev2/requirements-requirements';
import { ReqParallelDeliverableRequirement } from '@frenchexdev2/requirements-requirements';

/** Tier-2 roadmap — enriched ACs for implementer agent. */
@Satisfies(
  ReqRefactorSafeRequirement,
  ReqDogFoodRequirement,
  ReqParallelDeliverableRequirement,
)
export abstract class FeatureRenameCodemodFeature extends Feature {
  readonly id = 'FEATURE-RENAME-CODEMOD';
  readonly title = '`requirements feature rename` + `requirements requirement rename` — ts-morph-driven codemod';
  readonly priority = Priority.Medium;
  readonly enabled = false;

  // ── Positive path ──
  abstract featureRenameUpdatesAllReferences(): ACResult;
  abstract requirementRenameUpdatesSatisfiesArgs(): ACResult;
  abstract acRenameUpdatesVerifiesCallSites(): ACResult;
  abstract renameUpdatesClassFileNameOnDisk(): ACResult;
  abstract renameUpdatesSpecJsonIdField(): ACResult;

  // ── Error / validation paths ──
  abstract featureRenameRefusesConflict(): ACResult;
  abstract renameRefusesWhenResultingCodeDoesNotTypeCheck(): ACResult;
  abstract renameRefusesInvalidTargetIdFormat(): ACResult;
  abstract renameRefusesMissingSourceClassOrCriterion(): ACResult;
  abstract renameRefusesMissingRemovalCapabilityBeforeWrites(): ACResult;
  abstract sameIdentityRenamePreservesEveryFile(): ACResult;
  abstract renameRejectsContradictorySidecarsAndPreservesHistory(): ACResult;
  abstract renameDiagnosticsIdentifyGlobalAndFileErrors(): ACResult;

  // ── Integration ──
  abstract renameRunsInDryRunModeByDefault(): ACResult;
  abstract renameEmitsUnifiedDiffToStdout(): ACResult;
  abstract renameWritesViaFileSystemPort(): ACResult;

  // ── End-to-end ──
  abstract endToEndRenameFlowsAcrossThirtyVerifiesSites(): ACResult;
}
