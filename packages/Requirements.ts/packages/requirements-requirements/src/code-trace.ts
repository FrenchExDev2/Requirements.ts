import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqDiscoverableTraceabilityRequirement } from './req-discoverable-traceability.js';
import { ReqVersionedTraceabilityRequirement } from './req-versioned-traceability.js';

/**
 * Self-Feature for packages/requirements-trace/src/code-trace.ts.
 * One AC = one observable behavior contributing to 100% coverage.
 */
@Satisfies(
  ReqDiscoverableTraceabilityRequirement,
  ReqVersionedTraceabilityRequirement,
)
export abstract class CodeTraceFeature extends Feature {
  readonly id = 'CODE-TRACE';
  readonly title = 'Code participation scan — decorators, @rac-feature markers, evidence, explain/impact/gaps';
  readonly priority = Priority.High;

  // ── primitives ──
  abstract hashesSourceBytesWithSha256(): ACResult;
  abstract normalizesPathsToPosixAbsolute(): ACResult;

  // ── scanParticipation — imports & decorators ──
  abstract linksNamedParticipatesInDecorator(): ACResult;
  abstract linksNamespaceParticipatesInDecorator(): ACResult;
  abstract linksCataloguePropertyAccess(): ACResult;
  abstract linksNamespaceCataloguePropertyAccess(): ACResult;
  abstract linksMethodDecoratorWithSymbol(): ACResult;
  abstract acceptsSharedKernelParticipatesInImport(): ACResult;
  abstract reportsUnknownFeatureReference(): ACResult;
  abstract reportsDeprecatedFeatureWithAndWithoutReplacement(): ACResult;
  abstract reportsEmptyParticipation(): ACResult;
  abstract reportsInvalidDecoratorTarget(): ACResult;
  abstract ignoresUnrelatedDecoratorsAndImports(): ACResult;

  // ── scanParticipation — markers ──
  abstract linksInstructionMarkerPrecedingStatement(): ACResult;
  abstract linksBalancedFeatureBlock(): ACResult;
  abstract reportsMalformedFeatureMarker(): ACResult;
  abstract reportsMarkerNotImmediatelyPrecedingStatement(): ACResult;
  abstract reportsUnbalancedEndMarker(): ACResult;
  abstract reportsUnclosedFeatureBlock(): ACResult;

  // ── loadCodeTrace ──
  abstract loadsProjectFromConfigAndSources(): ACResult;
  abstract rejectsInvalidConfiguration(): ACResult;
  abstract rejectsDuplicateFeatureCatalogue(): ACResult;
  abstract skipsIgnoredDirectoriesAndDeclarationFiles(): ACResult;
  abstract appliesSourceOverridesAndAbortSignal(): ACResult;
  abstract recordsGeneratedOriginsCurrentStaleUnknownAndInvalid(): ACResult;
  abstract loadsEvidenceAndHashesInputs(): ACResult;
  abstract ignoresMissingEvidenceAndRethrowsOtherIoErrors(): ACResult;

  // ── evidence / explain / impact / gaps ──
  abstract classifiesEvidenceMissingStaleIncompleteCurrent(): ACResult;
  abstract explainsCodeAtLineWithCoverageAndDiagnostics(): ACResult;
  abstract rejectsNonPositiveExplainLine(): ACResult;
  abstract navigatesFeatureCodeImpactAndGaps(): ACResult;
}
