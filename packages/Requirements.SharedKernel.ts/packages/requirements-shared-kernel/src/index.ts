// @frenchexdev2/requirements-shared-kernel — Tier-0 kernel.
// Zero deps. Base types, decorators, RequirementStyle abstraction, branded IDs, ports.
// Every package in @frenchexdev2/requirements-* depends on this.

export { Feature, Requirement, Priority, TestLevel, type ACResult } from './base.js';
export type {
  RequirementStatement,
  RequirementRationale,
  RequirementEvidence,
  RequirementFitCriterion,
  RequirementProvenance,
  RequirementRisk,
  TracedToLink,
  RequirementHistoryEntry,
} from './base.js';
export {
  FeatureTest,
  Verifies,
  Expects,
  Exclude,
  TypeCheckOnly,
  Satisfies,
  Refines,
  getRequirementRegistry,
  getExcludedMethods,
  getSatisfactionLinks,
  getRefinementLinks,
  type RequirementRef,
  type FeatureTestOptions,
  type SatisfactionLink,
  type RefinementLink,
} from './decorators.js';

// ── Style system — project-extensible ontology (abstract only, no presets) ──
export type {
  RequirementStyle,
  StyleVocabulary,
  StyleValidators,
  StyleTemplates,
  RequirementReporter,
  RequirementTemplate,
  TemplateSkeleton,
  StatusWorkflow,
  RiskTaxonomy,
  RiskMatrix,
  SourceKindSchema,
  SourceSlot,
  StatementPatternSchema,
  StatementSlot,
  ValidationResult,
  ValidationError,
  KindsOf,
  StatusesOf,
  RiskLevelsOf,
  VerificationMethodsOf,
  RationaleKindsOf,
  SourceKindsOf,
  StatementPatternsOf,
} from './style.js';

// ── Pure ID → name transformations ──
export * from './id-naming.js';
export { featureReference, ParticipatesIn, getParticipation, checkFeatureEvolution, type FeatureReference, type FeatureRetirement } from './participation.js';
