import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqSpecIsSourceOfTruthRequirement } from '@frenchexdev2/requirements-requirements';
import { ReqTuiModernRequirement } from '@frenchexdev2/requirements-requirements';
import { ReqParallelDeliverableRequirement } from '@frenchexdev2/requirements-requirements';
import { ReqDogFoodRequirement } from '@frenchexdev2/requirements-requirements';

/**
 * Self-Feature for the `requirements feature sync <spec>` command.
 * Owned by Stream C (diff/sync core).
 */
@Satisfies(
  ReqSpecIsSourceOfTruthRequirement,     // primary
  ReqTuiModernRequirement,               // joint: preview uses Prompt port
  ReqParallelDeliverableRequirement,     // joint
  ReqDogFoodRequirement,                 // joint
)
export abstract class FeatureSyncCommandFeature extends Feature {
  readonly id = 'FEATURE-SYNC-COMMAND';
  readonly title = '`requirements feature sync` — reconcile spec.json with on-disk files';
  readonly priority = Priority.High;

  // ── Spec loading ──
  abstract loadsSpecFromJsonPath(): ACResult;

  // ── Diff classification ──
  abstract diffClassifiesEachTargetAsCreateUnchangedModified(): ACResult;
  abstract diffComputesStructuredHunksViaJsdiff(): ACResult;

  // ── Rendering ──
  abstract renderColorizesAddRemoveContext(): ACResult;

  // ── Interactive apply ──
  abstract interactivePromptsApplyOrSkipPerModified(): ACResult;
  abstract unchangedEntriesNotPrompted(): ACResult;

  // ── Dry-run / yes ──
  abstract dryRunRendersDiffsWithoutWriting(): ACResult;
  abstract yesFlagAppliesAllSilently(): ACResult;

  // ── Safety ──
  abstract neverTouchesNonScaffoldTestFiles(): ACResult;

  // ── End-to-end ──
  abstract endToEndSyncReconcilesEditedSpec(): ACResult;
}
