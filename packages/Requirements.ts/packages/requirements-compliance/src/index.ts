// @frenchexdev2/requirements-compliance — Tier-1 analyzer: compliance core + report
// (Feature/Requirement scanning, runtime-coverage aggregation, orphan detection,
// traceability matrix renderer).
export * from './compliance-core.js';
export * from './qualification.js';
export * from './qualification-inventory.js';
export * from './qualification-project.js';
export * from './qualification-evidence.js';
// Explicit re-exports from compliance-report (avoids TestLevel collision with
// compliance-core — pre-existing DRY violation flagged in the decomposition roadmap).
export {
  hasBareDescribeOrIt,
  validateFsmFeatureLinks,
  scanTestFiles,
  computeBindingsSummary,
  crossReference,
  buildJsonPayload,
  generateReport,
  glyphFor,
  formatRuntimeCell,
  formatBindingsCell,
  traceabilityGlyph,
  formatBindingsCellColored,
  renderConsole,
  renderByTest,
  buildByTestJson,
} from './compliance-report.js';
export type {
  TestRef,
  ACCoverage,
  BindingsStatus,
  FeatureBindingsSummary,
  FeatureCoverage,
  MachineLink,
  FsmFeatureLinkReport,
  GenerateReportOptions,
  GeneratedReport,
  RenderConsoleOptions,
  TableColumn,
} from './compliance-report.js';
