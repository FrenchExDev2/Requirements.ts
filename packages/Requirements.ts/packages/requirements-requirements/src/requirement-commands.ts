import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqDslCompleteRequirement } from '@frenchexdev2/requirements-requirements';
import { ReqSpecIsSourceOfTruthRequirement } from '@frenchexdev2/requirements-requirements';
import { ReqVocabIndustryAlignedRequirement } from './req-vocab-industry-aligned.js';
import { ReqTuiModernRequirement } from '@frenchexdev2/requirements-requirements';
import { ReqParallelDeliverableRequirement } from '@frenchexdev2/requirements-requirements';
import { ReqDogFoodRequirement } from '@frenchexdev2/requirements-requirements';

/**
 * Self-Feature for the `requirements requirement *` commands (new, sync, list, show, orphan).
 * Owned by Stream F (requirement commands).
 */
@Satisfies(
  ReqDslCompleteRequirement,             // primary — this is the keystone
  ReqVocabIndustryAlignedRequirement,    // primary — @Satisfies / @Refines semantics
  ReqSpecIsSourceOfTruthRequirement,     // joint: reuses SyncPlan machinery
  ReqTuiModernRequirement,               // joint: wizard uses Prompt port
  ReqParallelDeliverableRequirement,     // joint
  ReqDogFoodRequirement,                 // joint
)
export abstract class RequirementCommandsFeature extends Feature {
  readonly id = 'REQUIREMENT-COMMANDS';
  readonly title = '`requirements requirement *` — Requirement bootstrap + sync + list + show + orphan';
  readonly priority = Priority.Critical;

  // ── `requirement new` wizard ──
  abstract requirementNewWizardCollectsAllFields(): ACResult;
  abstract requirementNewLoopsChildFeaturesUntilEnd(): ACResult;
  abstract requirementNewPromptsEarsPattern(): ACResult;
  abstract requirementNewRequiresNonEmptyFitCriterion(): ACResult;
  abstract fromFeatureFlagPreFillsFromExistingFeature(): ACResult;

  // ── `requirement sync` ──
  abstract requirementSyncReusesDiffCore(): ACResult;

  // ── Decorators ──
  abstract satisfiesDecoratorRegistersBidirectionalLink(): ACResult;
  abstract satisfiesDecoratorRejectsNonRequirementClass(): ACResult;
  abstract refinesDecoratorRegistersParentChildLink(): ACResult;

  // ── `requirement show` / `list` / `orphan` ──
  abstract requirementListShowsCoveragePerRequirement(): ACResult;
  abstract requirementShowReportUsesInverseTerms(): ACResult;
  abstract orphanCommandListsFeaturesWithoutRequirement(): ACResult;
  abstract orphanDetectionStaysSilentWhenRuntimeRegistryIsEmpty(): ACResult;
  abstract coverageFlowsUpToARefinedRequirement(): ACResult;
  abstract refinementCoverageTerminatesOnACycle(): ACResult;

  // ── trace chain extended to 4 tiers ──
  abstract traceChainShowsRequirementTier(): ACResult;

  // ── `compliance --strict` extended (both directions) ──
  abstract complianceStrictFailsOnUncoveredApprovedRequirement(): ACResult;
  abstract complianceStrictFailsOnFeatureWithoutSatisfies(): ACResult;

  // ── `feature new` wizard extension ──
  abstract featureNewWizardOffersRequirementSelection(): ACResult;

  // ── Generative workflows ──
  abstract projectCanDefineCustomStatusWorkflow(): ACResult;
  abstract projectCanDefineCustomRiskTaxonomy(): ACResult;

  // ── End-to-end ──
  abstract endToEndRequirementToTestChain(): ACResult;
}
