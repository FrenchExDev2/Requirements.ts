import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqScaffoldExtensibilityRequirement } from './req-scaffold-extensibility.js';
import { ReqDogFoodRequirement } from '@frenchexdev2/requirements-requirements';
import { ReqParallelDeliverableRequirement } from '@frenchexdev2/requirements-requirements';

/**
 * Self-Feature for the pluggable TestScaffolder registry.
 * One port + one registry + one built-in per TestLevel.
 */
@Satisfies(
  ReqScaffoldExtensibilityRequirement,  // primary
  ReqDogFoodRequirement,
  ReqParallelDeliverableRequirement,
)
export abstract class ScaffolderRegistryFeature extends Feature {
  readonly id = 'SCAFFOLDER-REGISTRY';
  readonly title = 'Pluggable TestScaffolder registry — one strategy per TestLevel, project-extensible';
  readonly priority = Priority.High;

  // Registry surface
  abstract registryCoversEveryBuiltInTestLevel(): ACResult;
  abstract registryReturnsUndefinedForUnknownLevel(): ACResult;
  abstract registerScaffolderAddsNewLevel(): ACResult;
  abstract registerScaffolderOverridesDefault(): ACResult;
  abstract listScaffoldersReturnsEverythingRegistered(): ACResult;

  // Built-in scaffolders — shape guarantees
  abstract unitScaffolderEmitsVitestStub(): ACResult;
  abstract e2eScaffolderEmitsPlaywrightStub(): ACResult;
  abstract functionalScaffolderEmitsVitestIntegrationStub(): ACResult;
  abstract a11yScaffolderEmitsAxePlaywrightStub(): ACResult;
  abstract i18nScaffolderEmitsLocaleSweepStub(): ACResult;
  abstract visualScaffolderEmitsPlaywrightSnapshotStub(): ACResult;
  abstract perfScaffolderEmitsLatencyBudgetStub(): ACResult;

  // Universal output invariants — one AC, enforced across all scaffolders
  abstract scaffolderOutputUsesFeatureTestVerifiesOnly(): ACResult;
  abstract scaffolderOutputContainsNoDescribeOrIt(): ACResult;
  abstract scaffolderHonoursFilenameSuffixConvention(): ACResult;

  // Integration
  abstract planWritesEnumeratesAllExpectedLevels(): ACResult;
  abstract unknownLevelInExpectsYieldsTypedError(): ACResult;
}
