import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqDiscoverableTraceabilityRequirement } from '@frenchexdev2/requirements-requirements';
import { ReqVisualTraceabilityRequirement } from '@frenchexdev2/requirements-requirements';

/**
 * Self-Feature for src/analysis/compliance-core.ts.
 * One AC = one observable behavior that contributes to 100% line+branch coverage.
 */
@Satisfies(
  ReqDiscoverableTraceabilityRequirement,
  ReqVisualTraceabilityRequirement,
)
export abstract class ComplianceCoreFeature extends Feature {
  readonly id = 'COMPLIANCE-CORE';
  readonly title = 'Compliance scanner — core (feature parsing, coverage loading, runtime rollup, orphans)';
  readonly priority = Priority.Critical;

  // ── parseFeatureSource ──
  abstract parsesAbstractExportedFeatureClass(): ACResult;
  abstract parsesIdAndTitleFromStringLiterals(): ACResult;
  abstract parsesPriorityFromEnumPropertyAccess(): ACResult;
  abstract parsesEnabledFalseLiteral(): ACResult;
  abstract collectsAbstractMethodNamesAsAcs(): ACResult;
  abstract readsExpectsDecoratorEnumArguments(): ACResult;
  abstract readsExpectsDecoratorStringLiteralArguments(): ACResult;
  abstract defaultsToUnitLevelWhenNoExpects(): ACResult;
  abstract ignoresExpectsDecoratorWithUnknownLevels(): ACResult;
  abstract unwrapsAsExpressionsOnInitializers(): ACResult;
  abstract returnsNullForConcreteClass(): ACResult;
  abstract returnsNullForNonExportedClass(): ACResult;
  abstract returnsNullForClassNotExtendingFeature(): ACResult;
  abstract returnsNullWhenNoFeatureClassFound(): ACResult;
  abstract ignoresNonClassDeclarations(): ACResult;
  abstract ignoresPropertiesWithNonStringInitializers(): ACResult;
  abstract readsSatisfiesDecoratorArgumentsAsClassNames(): ACResult;
  abstract returnsEmptySatisfiesWhenDecoratorsButNoSatisfies(): ACResult;

  // ── readFeatures ──
  abstract readFeaturesParsesAllTsFiles(): ACResult;
  abstract readFeaturesSkipsNonTsFiles(): ACResult;
  abstract readFeaturesFiltersOutNullParseResults(): ACResult;

  // ── parseRequirementSource / readRequirements ──
  abstract parseRequirementSourceExtractsClassNameAndIdFromStringLiteral(): ACResult;
  abstract parseRequirementSourceFallsBackToClassNameWhenNoIdField(): ACResult;
  abstract parseRequirementSourceReturnsNullForNonRequirementClass(): ACResult;
  abstract parseRequirementSourceReturnsNullForNonAbstractOrNonExported(): ACResult;
  abstract parseRequirementSourceExtractsStatusLiteral(): ACResult;
  abstract readRequirementsWalksDirAndReturnsMetas(): ACResult;
  abstract readRequirementsReturnsEmptyWhenDirMissing(): ACResult;

  // ── deriveTraceabilityCorpus ──
  abstract deriveCorpusResolvesSatisfiesClassNamesToReqIds(): ACResult;
  abstract deriveCorpusKeepsClassNamesThatResolveToNoRequirement(): ACResult;
  abstract deriveCorpusProjectsRequirementStatus(): ACResult;
  abstract parseRequirementSourceReadsRefinesDecorator(): ACResult;
  abstract deriveCorpusResolvesRefinesClassNamesToReqIds(): ACResult;

  // ── normalizeCoveragePath ──
  abstract normalizesAbsoluteWindowsPath(): ACResult;
  abstract normalizesAbsolutePosixPath(): ACResult;
  abstract preservesRelativePathAndConvertsBackslashes(): ACResult;

  // ── findLatestCoverageSummary ──
  abstract findLatestCoverageReturnsExplicitRunIdMatch(): ACResult;
  abstract findLatestCoverageHandlesNestedUnitLayout(): ACResult;
  abstract findLatestCoverageReturnsNullForExplicitRunIdWhenAbsent(): ACResult;
  abstract findLatestCoverageReturnsNullWhenTestResultsMissing(): ACResult;
  abstract findLatestCoverageScansAllRunsWithoutRunId(): ACResult;
  abstract findLatestCoveragePicksNewestByLexSort(): ACResult;
  abstract findLatestCoverageIgnoresNonIsoDirs(): ACResult;
  abstract findLatestCoverageReturnsNullWhenNoCandidates(): ACResult;

  // ── loadCoverageSummary ──
  abstract loadCoverageSummarySkipsTotalKey(): ACResult;
  abstract loadCoverageSummaryExtractsAllPctMetrics(): ACResult;
  abstract loadCoverageSummaryNormalizesAllKeys(): ACResult;

  // ── computeRuntimeCoverage ──
  abstract runtimeCoverageDisabledFeature(): ACResult;
  abstract runtimeCoverageNoSourceFiles(): ACResult;
  abstract runtimeCoverageNullCoverageMap(): ACResult;
  abstract runtimeCoverageAllPresentReturnsOk(): ACResult;
  abstract runtimeCoverageSomeMissingReturnsPartial(): ACResult;
  abstract runtimeCoverageAllMissingReturnsMissing(): ACResult;
  abstract runtimeCoverageReportsMinLinesPct(): ACResult;

  // ── findOrphanSourceFiles ──
  abstract findOrphanReturnsUnclaimedCoverageKeys(): ACResult;
  abstract findOrphanExcludesClaimedFiles(): ACResult;
  abstract findOrphanSortsAlphabetically(): ACResult;
  abstract findOrphanHandlesFeatureWithoutDerivedFiles(): ACResult;
  abstract findOrphanExemptsTypeOnlyFiles(): ACResult;
}
