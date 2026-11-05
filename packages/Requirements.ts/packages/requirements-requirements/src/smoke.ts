import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqDogFoodRequirement } from './req-dog-food.js';

/**
 * Smoke tests for the `requirements` CLI bin.
 * Each AC = one sub-command happy path or a graceful-failure case.
 */
@Satisfies(ReqDogFoodRequirement)
export abstract class SmokeFeature extends Feature {
  readonly id = 'REQUIREMENTS-SMOKE';
  readonly title = 'CLI bin smoke tests — sub-command happy paths';
  readonly priority = Priority.High;

  abstract binPrintsHelpOnHelpFlag(): ACResult; // expects: smoke
  abstract complianceHelpListsFlags(): ACResult; // expects: smoke
  abstract traceHelpListsSubcommands(): ACResult; // expects: smoke
  abstract scaffoldHelpListsSubcommands(): ACResult; // expects: smoke
  abstract traceGapsOnEmptyFixtureDoesNotCrash(): ACResult; // expects: smoke

  // ── Traceability corpus resolution (spec sidecars vs decorated classes) ──
  abstract orphanCommandReadsSatisfiesFromTsClassesWhenNoSpecSidecarExists(): ACResult; // expects: smoke
  abstract complianceStrictFailsOnAnOrphanDeclaredOnlyInTypeScript(): ACResult; // expects: smoke
}
