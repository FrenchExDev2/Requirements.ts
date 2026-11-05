import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqLiveFeedbackRequirement } from './req-live-feedback.js';
import { ReqDogFoodRequirement } from '@frenchexdev2/requirements-requirements';
import { ReqParallelDeliverableRequirement } from '@frenchexdev2/requirements-requirements';

/** Tier-2 roadmap — enriched ACs for implementer agent. */
@Satisfies(
  ReqLiveFeedbackRequirement,
  ReqDogFoodRequirement,
  ReqParallelDeliverableRequirement,
)
export abstract class FeatureWatchModeFeature extends Feature {
  readonly id = 'FEATURE-WATCH-MODE';
  readonly title = '`requirements watch` — live revalidation + compliance delta on file change';
  readonly priority = Priority.Medium;
  readonly enabled = false;

  // ── Positive path ──
  abstract watchDetectsSpecChange(): ACResult;
  abstract watchRevalidatesWithinLatencyBudget(): ACResult;
  abstract watchDetectsRapidSuccessionAndDebounces(): ACResult;
  abstract watchPrintsOneLineComplianceDelta(): ACResult;
  abstract watchReactsToFeatureTsFileSaveAsWellAsSpecJson(): ACResult;

  // ── Error / validation paths ──
  abstract watchSurfacesSchemaViolationsInline(): ACResult;
  abstract watchIgnoresTemporaryEditorSwapFiles(): ACResult;

  // ── Integration ──
  abstract watchUsesFileSystemPortWatcher(): ACResult;
  abstract watchTearsDownAllWatchersOnCtrlC(): ACResult;

  // ── End-to-end ──
  abstract endToEndBurstOfSavesYieldsExactlyOneRevalidation(): ACResult;
}
