// @frenchexdev2/requirements/analysis
export { qualifyProject, evaluateQualification, readQualificationInventory, COMPLETE_QUALIFICATION_POLICY } from '@frenchexdev2/requirements-compliance';
export type { QualificationPolicy, QualificationEvidence, QualificationReport, QualificationInventory } from '@frenchexdev2/requirements-compliance';
export {
  parseFeatureSource,
  readFeatures,
  parseRequirementSource,
  readRequirements,
  normalizeCoveragePath,
  findLatestCoverageSummary,
  loadCoverageSummary,
  computeRuntimeCoverage,
  findOrphanSourceFiles,
} from '@frenchexdev2/requirements-compliance';
export type { FeatureMeta, ACMeta, TestLevel, FileCov, RuntimeCoverage, OrphanFile, RequirementMeta } from '@frenchexdev2/requirements-compliance';


export {
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
} from '@frenchexdev2/requirements-compliance';
export type {
  TestRef,
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
} from '@frenchexdev2/requirements-compliance';

export {
  scanTestBindings,
  sortManifest,
  parseTestFile,
  collectTestFiles,
  buildFileExistsPredicate,
} from '@frenchexdev2/requirements-scanner';
export type {
  BindingsManifest,
  SymbolTarget,
  ManifestDiff,
  EmptyMethodRef,
  TestParseResult,
  ParsedTestClass,
  MethodBinding,
  TestScanOptions,
  TestScanResult,
} from '@frenchexdev2/requirements-scanner';

export { detectTestSmells, scanTestSmells } from '@frenchexdev2/requirements-test-smells';
export type {
  TestSmell,
  TestSmellKind,
  TestSmellsScanOptions,
  TestSmellsScanResult,
} from '@frenchexdev2/requirements-test-smells';

export { planBehavioralCheck, buildStrykerConfig, classifyVerdict, aggregateByAc } from '@frenchexdev2/requirements-behavioral-check';
export type {
  Plan,
  BehavioralCheckPlan,
  VacuousPlan,
  VacuousReason,
  Verdict,
  PlanOptions,
  BuildConfigOptions,
  StrykerConfigSnapshot,
  ClassifyOptions,
  MutationReport,
  ReportMutant,
  ReportTest,
  BehavioralAuditEntry,
  BehavioralAuditResult,
} from '@frenchexdev2/requirements-behavioral-check';
