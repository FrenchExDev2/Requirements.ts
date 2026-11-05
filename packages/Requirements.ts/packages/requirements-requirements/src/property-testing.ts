import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqPropertyInvariantsRequirement } from './req-property-invariants.js';
import { ReqDogFoodRequirement } from '@frenchexdev2/requirements-requirements';

/**
 * Self-Feature for the fast-check property + fuzzy test suite.
 * One AC per algebraic invariant the package guarantees on its pure functions.
 */
@Satisfies(
  ReqPropertyInvariantsRequirement,
  ReqDogFoodRequirement,
)
export abstract class PropertyTestingFeature extends Feature {
  readonly id = 'PROPERTY-TESTING';
  readonly title = 'Property + fuzzy tests via fast-check on every pure function in src/cli/*';
  readonly priority = Priority.High;

  // Smart constructors — accept iff regex matches, never crash
  abstract smartConstructorsAcceptIfAndOnlyIfRegexMatches(): ACResult;
  abstract smartConstructorsThrowParseErrorOnReject(): ACResult;
  abstract smartConstructorsNeverThrowOtherErrorTypes(): ACResult;

  // Id helpers — idempotent / reversible
  abstract idHelpersAreIdempotentAndReversible(): ACResult;
  abstract kebabOfIdProducesLowercase(): ACResult;
  abstract featureClassNameAlwaysEndsWithFeature(): ACResult;
  abstract requirementClassNameAlwaysEndsWithRequirement(): ACResult;

  // Sentence + Percentage
  abstract sentenceAcceptsIffNonEmptyAndTerminated(): ACResult;
  abstract percentageAcceptsIffFiniteAnd0to100(): ACResult;

  // specToJson — deterministic + roundtrip
  abstract specToJsonIsDeterministicAndRoundtrips(): ACResult;
  abstract specToJsonAlwaysHasSchemaVersionFirst(): ACResult;

  // validateSpec / validateStatement / renderStatement robustness:
  // moved to @frenchexdev2/requirements-styles → DefaultStyleRobustnessFeature
  // (tests follow the code: DefaultStyle lives in the styles package).

  // diffSpecToDisk — algebraic invariants
  abstract diffOfEqualContentYieldsAllUnchanged(): ACResult;
  abstract diffOfMissingCurrentYieldsAllCreate(): ACResult;
}
