// @frenchexdev2/requirements-lib
// Analysis + specs + schemas + port-based command cores.
// Pure logic layer — no commander, no @clack/prompts.

// ── Kernel re-export (subset: avoid symbols that collide with lib-local DTOs)
// Lib's types.ts has its own StatusWorkflow/RiskTaxonomy/RiskMatrix/VersionedSpec
// shapes for the spec DTOs. Kernel's versions remain accessible via
// `@frenchexdev2/requirements-core` directly.
export {
  Feature,
  Requirement,
  Priority,
  TestLevel,
  FeatureTest,
  Verifies,
  Expects,
  Exclude,
  TypeCheckOnly,
  Satisfies,
  Refines,
  getRequirementRegistry,
  getSatisfactionLinks,
  getRefinementLinks,
  getExcludedMethods,
} from '@frenchexdev2/requirements-core';
export type {
  ACResult,
  RequirementRef,
  FeatureTestOptions,
  SatisfactionLink,
  RefinementLink,
  RequirementStatement,
  RequirementRationale,
  RequirementEvidence,
  RequirementFitCriterion,
  RequirementProvenance,
  RequirementRisk,
  TracedToLink,
  RequirementHistoryEntry,
  RequirementStyle,
  StyleVocabulary,
  StyleValidators,
  StyleTemplates,
  RequirementReporter,
} from '@frenchexdev2/requirements-core';
// Ports (FileSystem, Logger, Fetcher, Prompt, etc.) — re-export without Clock
// (lib's versioning.ts defines its own Clock shape).
export type {
  FileSystem,
  Logger,
  CommandRunner,
  ProcessEnv,
  Fetcher,
  Scheduler,
  KeyValueStorage,
  Prompt,
  PromptChoice,
  PromptSpinner,
  PromptTextOptions,
  OutputSink,
  Vcs,
  Cancel,
  ToggleContext,
  ToggleEnv,
  ToggleProvider,
  AdapterContext,
  FitCriterionAdapter,
} from '@frenchexdev2/requirements-core/ports';

// ── Spec DTOs + branded primitives + smart constructors ─────────────────────
export * from '@frenchexdev2/requirements-core/types';

// ── Analysis (loadFeatures, scanTestFiles, compliance core/report) ──────────
// Note: `TestRef` from compliance-report collides with explore-core's TestRef;
// analysis/index.ts already exports its own TestRef explicitly. Use lib subpath
// `@frenchexdev2/requirements-lib/analysis` for the analysis-specific TestRef.
export {
  readFeatures,
  readRequirements,
  normalizeCoveragePath,
  findLatestCoverageSummary,
  loadCoverageSummary,
  computeRuntimeCoverage,
  findOrphanSourceFiles,
  validateFsmFeatureLinks,
  scanTestFiles,
  crossReference,
  computeBindingsSummary,
  generateReport,
  buildJsonPayload,
  buildByTestJson,
  renderConsole,
  renderByTest,
  hasBareDescribeOrIt,
  glyphFor,
  formatRuntimeCell,
  formatBindingsCell,
  formatBindingsCellColored,
  traceabilityGlyph,
  scanTestBindings,
  sortManifest,
} from './analysis/index.js';
export type {
  FeatureMeta,
  ACMeta,
  FileCov,
  RuntimeCoverage,
  OrphanFile,
  RequirementMeta,
  ACCoverage,
  MachineLink,
  FeatureCoverage,
  FsmFeatureLinkReport,
  GenerateReportOptions,
  GeneratedReport,
  RenderConsoleOptions,
  FeatureBindingsSummary,
  BindingsStatus,
  TableColumn,
  BindingsManifest,
  SymbolTarget,
  ManifestDiff,
  EmptyMethodRef,
} from './analysis/index.js';
// Pick analysis' TestRef as the canonical one (matches wrapper's historical barrel).
export type { TestRef } from './analysis/index.js';
// Re-export analysis' parseFeatureSource (reads Feature decorator meta).
// spec-from-source has a parseFeatureSource too but it parses spec-JSON literals —
// kept accessible only via the sub-path import of that module.
export { parseFeatureSource } from './analysis/index.js';

// ── Command cores (port-based; consumable by CLI shells, LSPs, extensions) ──
// 17 mechanical bulk re-exports auto-generated via @frenchexdev2/ts-codegen-pipeline.
// Ré-exports sélectifs (avec collisions résolues) restent ci-dessous, hand-written.
export * from './index.generated.js';
// spec-from-source.parseFeatureSource collides with analysis.parseFeatureSource;
// prefer the analysis one (matches legacy wrapper barrel). Users who need the
// ts-morph-based spec parser import from '@frenchexdev2/requirements-lib/spec-from-source'.
export {
  ParseFeatureSourceError,
  assertFeatureSourceCompiles,
} from '@frenchexdev2/requirements-spec-io/spec-from-source';
// versioning.VersionedSpec is a generic wrapper shape; types.VersionedSpec is the
// spec DTO supertype. Prefer types.VersionedSpec at the barrel level.
export {
  type VersionInfo,
  type VersionPin,
  type VersionDrift,
  type HistoryContext,
  NON_STRUCTURAL_FIELDS,
  canonicalize,
  canonicalJson,
  contentHashOf,
  computeVersionInfo,
  resolvePin,
  detectVersionDrift,
  buildBumpHistoryEntry,
  applyVersionBump,
} from '@frenchexdev2/requirements-versioning';

// ── Scaffolders registry + built-ins ────────────────────────────────────────
export * from '@frenchexdev2/requirements-scaffolders';
