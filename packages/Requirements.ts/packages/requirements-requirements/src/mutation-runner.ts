import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqDogFoodRequirement } from './req-dog-food.js';

/** Evidence guarantees for the process that produces mutation reports. */
@Satisfies(ReqDogFoodRequirement)
export abstract class MutationRunnerFeature extends Feature {
  readonly id = 'MUTATION-RUNNER';
  readonly title = 'Fresh mutation reports, process failures and Stryker-compatible metrics';
  readonly priority = Priority.Critical;
  abstract scoreMatchesStryker(): ACResult;
  abstract resolvesDocumentedBinShapes(): ACResult;
  abstract supportsExplicitPaths(): ACResult;
  abstract rejectsFailedChildren(): ACResult;
  abstract rejectsSpawnFailure(): ACResult;
  abstract cleansConfigOnMissingExecutable(): ACResult;
  abstract rejectsStaleReports(): ACResult;
}
