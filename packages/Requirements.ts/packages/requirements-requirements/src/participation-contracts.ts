import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqDiscoverableTraceabilityRequirement } from './req-discoverable-traceability.js';
import { ReqVersionedTraceabilityRequirement } from './req-versioned-traceability.js';

@Satisfies(ReqDiscoverableTraceabilityRequirement, ReqVersionedTraceabilityRequirement)
export abstract class ParticipationContractsFeature extends Feature {
  readonly id = 'PARTICIPATION-CONTRACTS';
  readonly title = 'Immutable Feature references, catalogue evolution and participation metadata';
  readonly priority = Priority.High;
  abstract freezesAndValidatesFeatureReferences(): ACResult;
  abstract detectsCatalogueEvolutionErrors(): ACResult;
  abstract recordsParticipationOnClassesAndMethods(): ACResult;
  abstract rejectsInvalidParticipationTargets(): ACResult;
}
