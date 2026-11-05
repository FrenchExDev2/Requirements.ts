import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqOrthogonalTogglingRequirement } from './req-orthogonal-toggling.js';
import { ReqDogFoodRequirement } from '@frenchexdev2/requirements-requirements';
import { ReqParallelDeliverableRequirement } from '@frenchexdev2/requirements-requirements';

/** Tier-2 roadmap — C8. Implements orthogonal toggling. */
@Satisfies(
  ReqOrthogonalTogglingRequirement,
  ReqDogFoodRequirement,
  ReqParallelDeliverableRequirement,
)
export abstract class TogglingFeature extends Feature {
  readonly id = 'ORTHOGONAL-TOGGLING';
  readonly title = 'Orthogonal toggling — ToggleProvider port + @Toggle decorator + ReleaseStage enum';
  readonly priority = Priority.High;
  readonly enabled = false;

  // ── Port + decorator surface ──
  abstract toggleProviderPortIsImplemented(): ACResult;
  abstract toggleDecoratorGatesAcByGateName(): ACResult;
  abstract enabledWhenDecoratorAcceptsPredicate(): ACResult;
  abstract availableFromAndUntilRespectDates(): ACResult;
  abstract featureReleaseStageIsOrthogonalToStatus(): ACResult;

  // ── Compliance integration ──
  abstract compliancePrintsNotApplicableForToggledOffAcs(): ACResult;
  abstract complianceStrictIgnoresNotApplicableAcs(): ACResult;

  // ── Rollout + context ──
  abstract rolloutPercentageGatedByRng(): ACResult;
  abstract toggleContextCarriesEnvAndTier(): ACResult;

  // ── Error / validation paths ──
  abstract toggleDecoratorRefusesUnknownGateName(): ACResult;
  abstract toggleContextRejectsUnknownEnvValues(): ACResult;
  abstract toggleResolverRejectsUnknownGateKinds(): ACResult;

  // ── Integration / testability ──
  abstract stubToggleProviderAllowsDeterministicTests(): ACResult;
  abstract toggleProviderInjectedViaCliShell(): ACResult;

  // ── End-to-end ──
  abstract endToEndToggledOffAcDoesNotFailStrictGate(): ACResult;
}
