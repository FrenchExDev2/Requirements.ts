import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqDiscoverableTraceabilityRequirement } from '@frenchexdev2/requirements-requirements';
import { ReqVisualTraceabilityRequirement } from '@frenchexdev2/requirements-requirements';

/**
 * Self-Feature for src/analysis/compliance-report.ts.
 * Each AC = one observable behavior contributing to full branch+line coverage.
 * The filesystem orchestrator is measured alongside the rendering and analysis functions.
 */
@Satisfies(
  ReqDiscoverableTraceabilityRequirement,
  ReqVisualTraceabilityRequirement,
)
export abstract class ComplianceReportFeature extends Feature {
  readonly id = 'COMPLIANCE-REPORT';
  readonly title = 'Compliance scanner — report assembly, rendering, JSON payloads';
  readonly priority = Priority.Critical;

  abstract reportAssemblesDiskContractsBindingsAndCoverage(): ACResult; // expects: integration
  abstract reportDiffUsesPreviousArtifactWithoutImportingItsBindings(): ACResult; // expects: integration
  abstract reportOptionsAndInvalidArtifactsHaveExplicitOutcomes(): ACResult; // expects: integration

  // ── table / ANSI helpers ──
  abstract tableProducesHeaderSeparatorAndBody(): ACResult;
  abstract tableRespectsIndentOption(): ACResult;
  abstract tableComputesWidthFromHeaderMinWidthAndCells(): ACResult;
  abstract tableDefaultsToLeftAlignment(): ACResult;
  abstract tableHonoursRightAlignment(): ACResult;
  abstract tableStripsAnsiEscapesWhenMeasuringWidth(): ACResult;
  abstract tableHandlesMissingCellsAsEmpty(): ACResult;
  abstract tableAppliesHeaderAndSeparatorColors(): ACResult;
  abstract tableUsesExplicitWidthWhenLarger(): ACResult;

  // ── hasBareDescribeOrIt ──
  abstract hasBareDetectsDescribeCall(): ACResult;
  abstract hasBareDetectsItCall(): ACResult;
  abstract hasBareReturnsFalseForEmptySource(): ACResult;
  abstract hasBareIgnoresImports(): ACResult;
  abstract hasBareIgnoresLineComments(): ACResult;
  abstract hasBareIgnoresBlockComments(): ACResult;
  abstract hasBareIgnoresSingleQuoteStrings(): ACResult;
  abstract hasBareIgnoresDoubleQuoteStrings(): ACResult;
  abstract hasBareIgnoresTemplateStrings(): ACResult;

  // ── validateFsmFeatureLinks ──
  abstract validateFsmReturnsEmptyBucketsForAllLinked(): ACResult;
  abstract validateFsmDetectsMachineWithoutFeatures(): ACResult;
  abstract validateFsmDetectsMachineWithEmptyFeaturesArray(): ACResult;
  abstract validateFsmDetectsUnknownFeatureId(): ACResult;
  abstract validateFsmDetectsUnknownAcOnKnownFeature(): ACResult;
  abstract validateFsmHandlesMultipleFeatureLinksOnOneMachine(): ACResult;

  // ── scanTestFiles / scanDir / inferTestLevel ──
  abstract scanTestFilesSkipsMissingDirs(): ACResult;
  abstract scanTestFilesRecursesIntoSubdirectories(): ACResult;
  abstract scanTestFilesIgnoresNonTsJsFiles(): ACResult;
  abstract scanTestFilesExtractsVerifiesDecorator(): ACResult;
  abstract scanTestFilesExtractsFeatureTestWithCoversAcs(): ACResult;
  abstract scanTestFilesHandlesFeatureTestWithoutCoversAcs(): ACResult;
  abstract scanTestFilesExtractsLegacyFeatTag(): ACResult;
  abstract scanTestFilesUnnamedTestFallback(): ACResult;
  abstract scanTestFilesInfersE2eLevel(): ACResult;
  abstract scanTestFilesInfersA11yLevel(): ACResult;
  abstract scanTestFilesInfersVisualLevel(): ACResult;
  abstract scanTestFilesInfersPerfLevel(): ACResult;
  abstract scanTestFilesInfersUnitLevelByDefault(): ACResult;
  abstract scanTestFilesInfersSmokeLevel(): ACResult;

  // ── computeBindingsSummary ──
  abstract computeBindingsReturnsDisabledWhenFeatureDisabled(): ACResult;
  abstract computeBindingsReturnsUnboundWhenNoManifest(): ACResult;
  abstract computeBindingsReturnsBoundWhenAllAcsTargeted(): ACResult;
  abstract computeBindingsReturnsPartialWhenSomeAcsTargeted(): ACResult;
  abstract computeBindingsReturnsUnboundWhenFeatureMissingFromManifest(): ACResult;
  abstract computeBindingsFlattensSymbolsIntoArray(): ACResult;

  // ── crossReference / deriveFilesFromManifest ──
  abstract crossRefBackfillsFeatureIdFromClassName(): ACResult;
  abstract crossRefKeepsExistingFeatureId(): ACResult;
  abstract crossRefMatchesTestsToAcs(): ACResult;
  abstract crossRefReportsPercentageAt100WhenNoAcs(): ACResult;
  abstract crossRefComputesCoveredAndGapLevels(): ACResult;
  abstract crossRefFallsBackToUnitWhenNoAcDetails(): ACResult;
  abstract crossRefDerivesSourceFilesFromManifest(): ACResult;
  abstract crossRefFiltersDerivedFilesByCoverageMap(): ACResult;
  abstract crossRefKeepsAllFilesWhenCoverageNull(): ACResult;
  abstract crossRefReturnsEmptyFilesWhenNoManifest(): ACResult;
  abstract crossRefReturnsEmptyFilesWhenFeatureAbsentFromManifest(): ACResult;
  abstract crossRefMapsSatisfiesClassNamesThroughReqClassToId(): ACResult;
  abstract crossRefKeepsRawSatisfiesNameWhenClassMappingMisses(): ACResult;
  abstract crossRefDefaultsSatisfiesToEmptyWhenFeatureMetaOmitsField(): ACResult;

  // ── buildJsonPayload ──
  abstract buildJsonIncludesTimestampAndFeatures(): ACResult;
  abstract buildJsonComputesTotalAndCoveredAcs(): ACResult;
  abstract buildJsonCountsDisabledFeatures(): ACResult;
  abstract buildJsonCollectsCriticalUncoveredAcs(): ACResult;
  abstract buildJsonSummaryPercentage100WhenNoAcs(): ACResult;
  abstract buildJsonReportsRuntimeWarningsCount(): ACResult;
  abstract buildJsonPropagatesOrphanList(): ACResult;

  // ── buildByTestJson ──
  abstract buildByTestGroupsByFileThenFeature(): ACResult;
  abstract buildByTestResolvesFeatureIdFromClassName(): ACResult;
  abstract buildByTestFallsBackToFeatureNameWhenNotMapped(): ACResult;
  abstract buildByTestIncludesTimestamp(): ACResult;

  // ── glyphFor ──
  abstract glyphReturnsDisabledForDisabledFeature(): ACResult;
  abstract glyphReturnsCrossForIncompleteCoverage(): ACResult;
  abstract glyphReturnsBangForOkAcsWithRuntimeWarning(): ACResult;
  abstract glyphReturnsCheckmarkForFullyCovered(): ACResult;

  // ── formatRuntimeCell ──
  abstract formatRuntimeCellOk(): ACResult;
  abstract formatRuntimeCellOkSingleFile(): ACResult;
  abstract formatRuntimeCellPartial(): ACResult;
  abstract formatRuntimeCellMissing(): ACResult;
  abstract formatRuntimeCellUndeclared(): ACResult;
  abstract formatRuntimeCellDisabled(): ACResult;

  // ── formatBindingsCell ──
  abstract formatBindingsCellDisabled(): ACResult;
  abstract formatBindingsCellUnboundWhenNoCoverage(): ACResult;
  abstract formatBindingsCellShowsTuOnly(): ACResult;
  abstract formatBindingsCellShowsE2eOnly(): ACResult;
  abstract formatBindingsCellShowsTuAndE2e(): ACResult;

  // ── traceabilityGlyph ──
  abstract traceabilityGlyphDisabled(): ACResult;
  abstract traceabilityGlyphFullWhenAllTu(): ACResult;
  abstract traceabilityGlyphNoneWhenZeroTu(): ACResult;
  abstract traceabilityGlyphPartialWhenMixed(): ACResult;

  // ── formatBindingsCellColored ──
  abstract formatColoredDisabled(): ACResult;
  abstract formatColoredUnbound(): ACResult;
  abstract formatColoredShowsFullGlyphAndGreenTu(): ACResult;
  abstract formatColoredShowsPartialGlyphAndYellowE2e(): ACResult;
  abstract formatColoredShowsNoneGlyphWhenAllE2e(): ACResult;

  // ── renderConsole ──
  abstract renderConsoleProducesHeaderAndSummary(): ACResult;
  abstract renderConsoleShowsCoverageRunIdWhenLoaded(): ACResult;
  abstract renderConsoleWarnsWhenCoverageMissing(): ACResult;
  abstract renderConsoleWarnsWhenBindingsMissing(): ACResult;
  abstract renderConsoleIncludesBindingsColumnsWhenRequested(): ACResult;
  abstract renderConsoleRendersDisabledRow(): ACResult;
  abstract renderConsoleAppendsMissingAcNote(): ACResult;
  abstract renderConsoleRendersOrphanSection(): ACResult;
  abstract renderConsoleSkipsOrphanSectionWhenFlagOff(): ACResult;
  abstract renderConsoleUsesColorWhenRequested(): ACResult;
  abstract renderConsoleQualityGatePassWhenClean(): ACResult;
  abstract renderConsoleQualityGateFailOnCriticalUncovered(): ACResult;
  abstract renderConsoleReportsRuntimeWarningsTally(): ACResult;
  abstract renderConsoleReportsUnboundFeatureList(): ACResult;
  abstract renderConsoleSummaryPercentage100WhenNoAcs(): ACResult;
  abstract renderConsolePercentColorsByThreshold(): ACResult;
  abstract renderConsoleSourceColorOkNotFull(): ACResult;
  abstract renderConsoleAppendsReqsColumnWhenAnyFeatureSatisfies(): ACResult;
  abstract renderConsoleShowsDashInReqsCellForFeaturesWithoutSatisfies(): ACResult;
  abstract renderConsoleMarksSrcCellAsSubprocessWhenAllTestsAreSmoke(): ACResult;

  // ── renderByTest ──
  abstract renderByTestGroupsByFile(): ACResult;
  abstract renderByTestResolvesFeatureIdViaClassToId(): ACResult;
  abstract renderByTestFallsBackToFeatureNameWhenNotMapped(): ACResult;
  abstract renderByTestHonoursUseColorFlag(): ACResult;
}
