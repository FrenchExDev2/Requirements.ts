import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqScaffoldExtensibilityRequirement } from './req-scaffold-extensibility.js';
import { ReqParallelDeliverableRequirement } from '@frenchexdev2/requirements-requirements';

/**
 * Self-Feature for src/cli/scaffold-core.ts.
 */
@Satisfies(
  ReqScaffoldExtensibilityRequirement,
  ReqParallelDeliverableRequirement,
)
export abstract class ScaffoldCoreFeature extends Feature {
  readonly id = 'SCAFFOLD-CORE';
  readonly title = 'Test scaffold — generate stubs for uncovered ACs';
  readonly priority = Priority.High;

  // ── findUncoveredACs ──
  abstract skipsAcsWhereExpectedLevelsOmitTarget(): ACResult;
  abstract marksAcsMissingExpectedLevel(): ACResult;
  abstract ignoresAcsAlreadyCoveredAtLevel(): ACResult;
  abstract matchesRefsByFeatureIdDirect(): ACResult;
  abstract matchesRefsByClassNameFallback(): ACResult;
  abstract defaultsAcDetailsToUnitWhenMissing(): ACResult;

  // ── generateUnitTestStub ──
  abstract returnsEmptyStringWhenNoUncovered(): ACResult;
  abstract emitsUnitStubWithFeatureImportAndDecorators(): ACResult;
  abstract unitStubStripsTsExtensionFromFile(): ACResult;

  // ── generateE2eTestStub ──
  abstract e2eReturnsEmptyStringWhenNoUncovered(): ACResult;
  abstract emitsE2eStubWithPlaywrightImport(): ACResult;

  // ── buildScaffoldResult ──
  abstract buildsUnitScaffoldForUnitLevel(): ACResult;
  abstract buildsE2eScaffoldForE2eLevel(): ACResult;
  abstract buildScaffoldPreservesFeatureMetadata(): ACResult;
}
