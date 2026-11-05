import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqDiscoverableTraceabilityRequirement } from '@frenchexdev2/requirements-requirements';

@Satisfies(
  ReqDiscoverableTraceabilityRequirement,
)
export abstract class TestSmellsFeature extends Feature {
  readonly id = 'TEST-SMELLS';
  readonly title = 'Test smells — AST-level honest detection of declarative ↔ behavior gaps in @Verifies tests';
  readonly priority = Priority.High;

  // ── empty-targets : @Verifies method whose body touches no src/ symbol ──
  abstract detectsVerifiesMethodWithEmptyTargets(): ACResult;
  abstract ignoresMethodWithAtLeastOneTarget(): ACResult;

  // ── empty-body : @Verifies method whose body is missing or trivially empty ──
  abstract detectsMethodWithoutBody(): ACResult;
  abstract detectsMethodWithEmptyBlockBody(): ACResult;
  abstract detectsMethodWithOnlyReturnStatement(): ACResult;
  abstract ignoresMethodWithMeaningfulBody(): ACResult;
  abstract ignoresMethodWithSingleNonBareReturnStatement(): ACResult;

  // ── no-assertion : body has no expect()/assert*() invocation ──
  abstract detectsBodyWithoutAnyAssertion(): ACResult;
  abstract acceptsExpectCallAsAssertion(): ACResult;
  abstract acceptsAssertCallAsAssertion(): ACResult;
  abstract acceptsAssertDotMethodCallAsAssertion(): ACResult;
  abstract acceptsExpectChainedAssertion(): ACResult;
  abstract acceptsFastCheckAssertAsAssertion(): ACResult;
  abstract followsLocalHelperToFindAssertion(): ACResult;
  abstract followsClassHelperToFindAssertion(): ACResult;
  abstract breaksHelperCyclesViaVisitedSet(): ACResult;

  // ── scoping : only @FeatureTest + @Verifies methods are inspected ──
  abstract skipsClassWithoutFeatureTest(): ACResult;
  abstract skipsMethodWithoutVerifies(): ACResult;
  abstract skipsNonMethodMembersInsideFeatureTestClass(): ACResult;
  abstract emitsOneSmellPerVerifiesDecoratorWhenStacked(): ACResult;

  // ── output shape ──
  abstract emitsSmellWithFileClassMethodFeatureAc(): ACResult;
  abstract returnsEmptyArrayForCleanFile(): ACResult;
  abstract aggregatesSmellsAcrossMultipleFeatureTestClassesInSameFile(): ACResult;

  // ── @TypeCheckOnly() suppression of empty-targets ──
  abstract suppressesEmptyTargetsWhenMethodCarriesTypeCheckOnly(): ACResult;
  abstract stillFlagsEmptyBodyOnTypeCheckOnlyMethod(): ACResult;
  abstract stillFlagsNoAssertionOnTypeCheckOnlyMethod(): ACResult;

  // ── orchestrator (scanTestSmells, FileSystem port) ──
  abstract walksConfiguredTestDirsViaFileSystemPort(): ACResult;
  abstract aggregatesSmellsAcrossMultipleFiles(): ACResult;
  abstract resolvesRelativeTestDirsAgainstRoot(): ACResult;
  abstract acceptsAbsoluteTestDirsAsIs(): ACResult;
  abstract propagatesReadFileFailuresAsWarnings(): ACResult;
  abstract returnsZeroFileCountWhenNoTestDirs(): ACResult;
}
