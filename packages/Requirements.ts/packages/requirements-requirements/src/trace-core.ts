import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqDiscoverableTraceabilityRequirement } from '@frenchexdev2/requirements-requirements';

/**
 * Self-Feature for src/cli/trace-core.ts.
 * One AC = one observable behavior contributing to 100% coverage.
 */
@Satisfies(
  ReqDiscoverableTraceabilityRequirement,
)
export abstract class TraceCoreFeature extends Feature {
  readonly id = 'TRACE-CORE';
  readonly title = 'Trace queries — gaps, matrix, chain, impact, hotspots, fragile';
  readonly priority = Priority.Critical;

  // ── buildTraceIndex ──
  abstract buildsFeatureNodesFromMeta(): ACResult;
  abstract buildsFileToFeaturesFromManifest(): ACResult;
  abstract buildsFeatureToFilesFromManifest(): ACResult;
  abstract mergesAcsAndSymbolsPerFileFeature(): ACResult;
  abstract buildsFeatureToTestsViaFeatureId(): ACResult;
  abstract fallsBackToClassToIdWhenFeatureIdMissing(): ACResult;
  abstract fallsBackToRawFeatureNameWhenClassNotMapped(): ACResult;
  abstract derivesFileToTestsByJoiningFeatures(): ACResult;
  abstract buildsFileNodesWithFeatureAndTestLinks(): ACResult;
  abstract handlesEmptyManifestAndEmptyTests(): ACResult;

  // ── normalizePath ──
  abstract normalizesAbsoluteWindowsPath(): ACResult;
  abstract normalizesRelativePath(): ACResult;

  // ── queryFileToFeatures ──
  abstract returnsEmptyFeaturesWhenFileUnknown(): ACResult;
  abstract returnsFeatureDetailsForKnownFile(): ACResult;
  abstract defaultsMissingFeatureNodeFieldsToEmpty(): ACResult;

  // ── queryFeatureToFiles ──
  abstract returnsNullForUnknownFeature(): ACResult;
  abstract returnsEmptyFilesArrayWhenFeatureHasNoFiles(): ACResult;
  abstract listsFilesWithSymbolsForKnownFeature(): ACResult;
  abstract handlesFileNodeMissingFeatureLink(): ACResult;

  // ── queryFileToTests ──
  abstract returnsEmptyTestsWhenFileUnknown(): ACResult;
  abstract returnsTestLinksForKnownFile(): ACResult;

  // ── queryFeatureToTests ──
  abstract returnsNullWhenFeatureUnknownForTests(): ACResult;
  abstract returnsTestsAcrossFileNodesDeduplicated(): ACResult;
  abstract returnsEmptyWhenFeatureHasNoTests(): ACResult;

  // ── queryImpact ──
  abstract aggregatesFeaturesAndTestsFromChangedFiles(): ACResult;
  abstract skipsUnknownFilesInImpact(): ACResult;
  abstract sortsImpactedFeaturesByPriority(): ACResult;
  abstract handlesUnknownPriorityInImpactSort(): ACResult;

  // ── queryHotspots ──
  abstract sortsHotspotsByFeatureCountDesc(): ACResult;
  abstract respectsHotspotsLimit(): ACResult;

  // ── queryFragile ──
  abstract sortsFragileByFileCountDesc(): ACResult;
  abstract respectsFragileLimit(): ACResult;
  abstract fragileFallsBackWhenFeatureNodeMissing(): ACResult;

  // ── queryFsm ──
  abstract listsAllFsmsWhenNoFilter(): ACResult;
  abstract filtersFsmsByNameCaseInsensitive(): ACResult;
  abstract handlesFsmWithoutFeatures(): ACResult;
  abstract handlesFsmFeatureWithUnknownId(): ACResult;

  // ── queryGaps ──
  abstract reportsUnlinkedFsms(): ACResult;
  abstract skipsDisabledFeaturesInGaps(): ACResult;
  abstract reportsUncoveredAcsMissingLevels(): ACResult;
  abstract defaultsAcDetailsToUnitWhenMissing(): ACResult;
  abstract usesClassToIdFallbackInGaps(): ACResult;

  // ── queryMatrix ──
  abstract returnsNullForUnknownMatrixFeature(): ACResult;
  abstract buildsRowsWithCoveredAndGapLevels(): ACResult;
  abstract handlesMatrixWithFsmLinkingToFeature(): ACResult;
  abstract usesClassToIdFallbackInMatrix(): ACResult;
  abstract defaultsMatrixAcDetailsToUnit(): ACResult;

  // ── queryChain ──
  abstract returnsNullWhenChainFeatureUnknown(): ACResult;
  abstract returnsNullWhenChainAcUnknown(): ACResult;
  abstract buildsChainWithRequirementFsmAndTests(): ACResult;
  abstract skipsFsmsWithoutFeatures(): ACResult;
  abstract skipsFsmsThatDoNotMatchAc(): ACResult;

  // ── renderFileToFeatures ──
  abstract rendersFileToFeaturesEmpty(): ACResult;
  abstract rendersFileToFeaturesWithData(): ACResult;

  // ── renderFeatureToFiles ──
  abstract rendersFeatureToFilesEmpty(): ACResult;
  abstract rendersFeatureToFilesWithSymbols(): ACResult;
  abstract rendersFeatureToFilesWithoutSymbols(): ACResult;

  // ── renderFileToTests ──
  abstract rendersFileToTestsEmpty(): ACResult;
  abstract rendersFileToTestsGroupedByTestFile(): ACResult;

  // ── renderFeatureToTests ──
  abstract rendersFeatureToTestsEmpty(): ACResult;
  abstract rendersFeatureToTestsWithData(): ACResult;

  // ── renderImpact ──
  abstract rendersImpactWithCriticalAndOther(): ACResult;

  // ── renderHotspots ──
  abstract rendersHotspotsEmpty(): ACResult;
  abstract rendersHotspotsBarScaled(): ACResult;
  abstract rendersHotspotsWithZeroMaxCount(): ACResult;

  // ── renderFragile ──
  abstract rendersFragileEmpty(): ACResult;
  abstract rendersFragileBarScaled(): ACResult;
  abstract rendersFragileWithZeroMaxCount(): ACResult;

  // ── renderFsm ──
  abstract rendersFsmEmpty(): ACResult;
  abstract rendersFsmUnlinked(): ACResult;
  abstract rendersFsmWithFeaturesAndTitle(): ACResult;
  abstract rendersFsmFeatureWithoutTitle(): ACResult;

  // ── renderGaps ──
  abstract rendersGapsAllEmpty(): ACResult;
  abstract rendersGapsUnlinkedFsms(): ACResult;
  abstract rendersGapsUncoveredAcs(): ACResult;
  abstract rendersGapsTransitionsWithoutAcs(): ACResult;

  // ── renderMatrix ──
  abstract rendersMatrixEmpty(): ACResult;
  abstract rendersMatrixRowsWithCoveredAndGap(): ACResult;
  abstract rendersMatrixExpectedDash(): ACResult;

  // ── renderChain ──
  abstract rendersChainEmpty(): ACResult;
  abstract rendersChainAllKinds(): ACResult;
  abstract rendersChainWithoutDetail(): ACResult;
}
