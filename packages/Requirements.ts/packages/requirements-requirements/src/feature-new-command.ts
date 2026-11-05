import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqBootstrapZeroFrictionRequirement } from './req-bootstrap-zero-friction.js';
import { ReqSpecIsSourceOfTruthRequirement } from './req-spec-is-source-of-truth.js';
import { ReqEditorFirstClassRequirement } from './req-editor-first-class.js';
import { ReqTuiModernRequirement } from './req-tui-modern.js';
import { ReqDslCompleteRequirement } from './req-dsl-complete.js';
import { ReqParallelDeliverableRequirement } from './req-parallel-deliverable.js';
import { ReqDogFoodRequirement } from './req-dog-food.js';

/**
 * Self-Feature for the `requirements feature new` interactive wizard.
 * Owned by Stream A (wizard core) with cross-border contributions from B/C/E.
 */
@Satisfies(
  ReqBootstrapZeroFrictionRequirement,   // primary
  ReqSpecIsSourceOfTruthRequirement,     // joint: preview before write
  ReqEditorFirstClassRequirement,        // joint: emits $schema key
  ReqTuiModernRequirement,               // joint: uses Prompt port
  ReqDslCompleteRequirement,             // joint: wizard asks which Requirement(s)
  ReqParallelDeliverableRequirement,     // joint: one of the parallel streams
  ReqDogFoodRequirement,                 // joint: tests use @FeatureTest
)
export abstract class FeatureNewCommandFeature extends Feature {
  readonly id = 'FEATURE-NEW-COMMAND';
  readonly title = '`requirements feature new` — interactive Feature bootstrap wizard';
  readonly priority = Priority.High;

  // ── Wizard flow ──
  abstract wizardCollectsIdTitlePriority(): ACResult;
  abstract wizardLoopsAcsUntilEnd(): ACResult;
  abstract wizardValidatesIdFormat(): ACResult;
  abstract wizardValidatesAcNameFormat(): ACResult;
  abstract wizardRefusesEmptyExpects(): ACResult;

  // ── Replay ──
  abstract replaySeedsDefaultsFromSpec(): ACResult;
  abstract replayOffersKeepEditDeletePerAc(): ACResult;
  abstract yesFlagSkipsAllPromptsAndApplies(): ACResult;

  // ── Source generation ──
  abstract generateFeatureSourceMatchesSpec(): ACResult;
  abstract generatedFileGoesToFeaturesDir(): ACResult;
  abstract specJsonSavedNextToFeature(): ACResult;
  abstract featureSpecToMetaDefaultsSatisfiesToEmptyArrayWhenAbsent(): ACResult;

  // ── Test scaffolding ──
  abstract scaffoldsUnitTestsForUncoveredAcs(): ACResult;
  abstract scaffoldsE2eOnlyWhenAcExpectsEndToEnd(): ACResult;
  abstract noTestFlagSkipsScaffolding(): ACResult;

  // ── Preview / dry-run (interactive dry-run always runs before apply) ──
  abstract previewShowsDiffBeforeAnyWrite(): ACResult;
  abstract previewOffersApplyReviewCancel(): ACResult;
  abstract dryRunFlagForcesPreviewCancel(): ACResult;

  // ── Post-apply editor open ──
  abstract endOfWizardOffersOpenInEditor(): ACResult;

  // ── Safety ──
  abstract refusesOverwriteUntrackedFile(): ACResult;

  // ── Cross-link to Requirements (wired in Stream F) ──
  abstract wizardOffersRequirementSelection(): ACResult;

  // ── Schema validation pre-write (Tier 1 amenity) ──
  abstract replayValidatesSpecAgainstSchema(): ACResult;

  // ── Templates (Tier 1 amenity) ──
  abstract templateFlagPreFillsSpec(): ACResult;

  // ── Coverage delta in preview (Tier 1 amenity) ──
  abstract previewIncludesCoverageDelta(): ACResult;

  // ── End-to-end ──
  abstract walksFullWizardEndToEnd(): ACResult;
}
