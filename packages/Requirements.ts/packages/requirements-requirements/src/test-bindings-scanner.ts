import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqDiscoverableTraceabilityRequirement } from '@frenchexdev2/requirements-requirements';

@Satisfies(
  ReqDiscoverableTraceabilityRequirement,
)
export abstract class TestBindingsScannerFeature extends Feature {
  readonly id = 'TEST-BINDINGS-SCANNER';
  readonly title = 'Test bindings scanner — AST walker over @FeatureTest/@Verifies test files';
  readonly priority = Priority.Critical;

  // ── parseTestFile + extractors ──
  abstract parsesFeatureTestDecoratedClass(): ACResult;
  abstract skipsClassWithoutFeatureTestDecorator(): ACResult;
  abstract skipsAnonymousClass(): ACResult;
  abstract skipsNonClassDeclarations(): ACResult;
  abstract extractsFeatureTestArgIdentifier(): ACResult;
  abstract returnsNullWhenFeatureTestArgNotIdentifier(): ACResult;
  abstract returnsNullWhenFeatureTestHasNoCallExpression(): ACResult;
  abstract returnsNullWhenDecoratorNameIsNotFeatureTest(): ACResult;
  abstract handlesClassWithNoModifiers(): ACResult;
  abstract extractsAllVerifiesArgsFromMethod(): ACResult;
  abstract skipsMethodWithoutVerifiesDecorator(): ACResult;
  abstract skipsVerifiesWithoutStringLiteralArg(): ACResult;
  abstract skipsVerifiesWithoutCallExpression(): ACResult;
  abstract skipsVerifiesIfDecoratorNameDiffers(): ACResult;
  abstract handlesMethodWithStringLiteralName(): ACResult;
  abstract skipsNonMethodMembers(): ACResult;
  abstract dedupesSymbolsWithinMethod(): ACResult;
  abstract emitsEmptyTargetsWhenNoMatchingImports(): ACResult;
  abstract addsClassEvenWhenNoMethodsHaveBindings(): ACResult;

  // ── collectImports ──
  abstract collectsNamedImports(): ACResult;
  abstract collectsDefaultImport(): ACResult;
  abstract collectsNamespaceImport(): ACResult;
  abstract skipsTypeOnlyImport(): ACResult;
  abstract skipsTypeOnlyNamedSpecifiers(): ACResult;
  abstract skipsImportWithoutClause(): ACResult;
  abstract skipsNonImportStatements(): ACResult;

  // ── resolveTarget ──
  abstract resolvesRelativeImportToRelPath(): ACResult;
  abstract appendsTsExtensionWhenMissing(): ACResult;
  abstract returnsNullForBareModuleSpecifier(): ACResult;
  abstract preservesExistingTsExtension(): ACResult;
  abstract mapsJsExtensionToTsForNodeNextImports(): ACResult;

  // ── resolveBarrelTarget (barrel-import fallback) ──
  abstract resolvesBarrelImportToIndexTs(): ACResult;
  abstract returnsNullForBarrelTargetOnBareModule(): ACResult;
  abstract returnsNullForBarrelTargetWhenSpecHasExtension(): ACResult;
  abstract fallsBackToBarrelWhenPrimaryOutOfScope(): ACResult;
  abstract fallsBackToBarrelWhenPrimaryFileDoesNotExist(): ACResult;

  // ── buildFileExistsPredicate (fs port → sync existence oracle) ──
  abstract buildsFileExistsPredicateOverConfiguredScopes(): ACResult;
  abstract fileExistsPredicateReturnsFalseForUnknownPath(): ACResult;

  // ── collectDynamicImportTargets ──
  abstract tracksDynamicImportFromMethodBody(): ACResult;
  abstract ignoresBareModuleDynamicImport(): ACResult;
  abstract ignoresOutOfScopeDynamicImport(): ACResult;
  abstract ignoresNonStringLiteralDynamicImportArg(): ACResult;
  abstract emitsStarSymbolForDynamicImport(): ACResult;

  // ── hasTypeCheckOnlyDecorator ──
  abstract detectsTypeCheckOnlyDecoratorOnMethod(): ACResult;
  abstract returnsFalseWhenTypeCheckOnlyAbsent(): ACResult;

  // ── isInScope ──
  abstract isInScopeReturnsTrueForMatch(): ACResult;
  abstract isInScopeReturnsFalseForNoMatch(): ACResult;

  // ── collectCalleeNames + getRootIdentifier ──
  abstract collectCalleeNamesFindsCallExpressions(): ACResult;
  abstract collectCalleeNamesFindsNewExpressions(): ACResult;
  abstract collectCalleeNamesEmptyWhenNoBody(): ACResult;
  abstract collectCalleeNamesIgnoresNonCallChildren(): ACResult;
  abstract getRootIdentifierThroughPropertyAccess(): ACResult;
  abstract getRootIdentifierThroughElementAccess(): ACResult;
  abstract getRootIdentifierThroughCallChain(): ACResult;
  abstract getRootIdentifierThroughParentheses(): ACResult;
  abstract getRootIdentifierThroughNonNullAndAs(): ACResult;
  abstract getRootIdentifierReturnsNullForLiteral(): ACResult;

  // ── collectReferencedNames + transitive + helpers ──
  abstract collectReferencedNamesGathersBareIdentifiers(): ACResult;
  abstract collectReferencedNamesSkipsTypeNodes(): ACResult;
  abstract collectReferencedNamesSkipsPropertyAccessName(): ACResult;
  abstract collectReferencedNamesSkipsObjectKey(): ACResult;
  abstract collectReferencedNamesSkipsDeclarationLhs(): ACResult;
  abstract collectReferencedNamesSkipsLabels(): ACResult;
  abstract collectReferencedNamesEmptyWhenNoBody(): ACResult;
  abstract collectLocalHelpersTracksFunctionDeclarations(): ACResult;
  abstract collectLocalHelpersTracksArrowFunctionAssignments(): ACResult;
  abstract collectLocalHelpersTracksFunctionExpressionAssignments(): ACResult;
  abstract collectLocalHelpersIgnoresNonFunctionVariables(): ACResult;
  abstract collectLocalHelpersIgnoresFunctionDeclarationsWithoutBody(): ACResult;
  abstract collectClassHelpersIncludesNonVerifiesMethods(): ACResult;
  abstract collectClassHelpersExcludesVerifiesMethods(): ACResult;
  abstract collectClassHelpersIgnoresAbstractOrComputedNames(): ACResult;
  abstract transitiveResolvesThroughLocalHelper(): ACResult;
  abstract transitiveResolvesThroughThisCallToClassHelper(): ACResult;
  abstract transitiveBreaksCyclesViaVisitedSet(): ACResult;

  // ── aggregateTestBindings + sortManifest ──
  abstract aggregatesMultipleClassesIntoManifest(): ACResult;
  abstract aggregateUsesClassToIdMapping(): ACResult;
  abstract aggregateFallsBackToClassNameWhenNoIdMapping(): ACResult;
  abstract aggregateRecordsEmptyMethods(): ACResult;
  abstract aggregateMergesTargetsAcrossClassesForSameAc(): ACResult;
  abstract aggregateDedupesTargetsByFileAndSymbol(): ACResult;
  abstract aggregatePropagatesParserWarnings(): ACResult;
  abstract sortManifestSortsFeatureIds(): ACResult;
  abstract sortManifestSortsAcsWithinFeature(): ACResult;
  abstract sortManifestSortsTargetsByFileThenSymbol(): ACResult;

  // ── collectTestFiles + scanTestBindings (FileSystem port) ──
  abstract collectsTestFilesByExtension(): ACResult;
  abstract collectsTestFilesRecursively(): ACResult;
  abstract collectTestFilesReturnsSorted(): ACResult;
  abstract collectTestFilesHandlesUnreadableDir(): ACResult;
  abstract collectTestFilesSkipsUnstatableEntries(): ACResult;
  abstract scanResolvesAbsoluteAndRelativeTestDirs(): ACResult;
  abstract scanSkipsUnreadableFiles(): ACResult;
  abstract scanReturnsAggregatedManifestStats(): ACResult;
  abstract scanRespectsCustomIncludeScopes(): ACResult;

  // ── diffManifests ──
  abstract diffReportsFeaturesOnlyInManual(): ACResult;
  abstract diffReportsFeaturesOnlyInInferred(): ACResult;
  abstract diffReportsAcsOnlyInManual(): ACResult;
  abstract diffReportsAcsOnlyInInferred(): ACResult;
  abstract diffReportsSymbolsOnlyInManual(): ACResult;
  abstract diffReportsSymbolsOnlyInInferred(): ACResult;
  abstract diffWalksAcsOfFeaturesOnlyInInferred(): ACResult;
  abstract diffEmptyForIdenticalManifests(): ACResult;
}
