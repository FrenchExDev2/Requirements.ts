import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqDslCompleteRequirement } from '@frenchexdev2/requirements-requirements';
import { ReqDogFoodRequirement } from '@frenchexdev2/requirements-requirements';

/**
 * Self-Feature for the parse-don't-validate smart constructors in src/cli/types.ts.
 * One AC per constructor path (happy + reject), per the Parse-Don't-Validate
 * principle: every branded primitive is minted through exactly one function
 * whose behaviour is worth asserting in isolation.
 */
@Satisfies(
  ReqDslCompleteRequirement,
  ReqDogFoodRequirement,
)
export abstract class SmartConstructorsFeature extends Feature {
  readonly id = 'SMART-CONSTRUCTORS';
  readonly title = 'Branded primitives — parse-don\'t-validate smart constructors';
  readonly priority = Priority.Medium;

  abstract requirementIdAcceptsCanonicalForm(): ACResult;
  abstract requirementIdRejectsMalformed(): ACResult;

  abstract featureIdAcceptsCanonicalForm(): ACResult;
  abstract featureIdRejectsMalformed(): ACResult;

  abstract acNameAcceptsCamelCase(): ACResult;
  abstract acNameRejectsNonCamelCase(): ACResult;

  abstract isoDateAcceptsDateOnlyAndFullDatetime(): ACResult;
  abstract isoDateRejectsMalformed(): ACResult;

  abstract sentenceTrimsAndAcceptsTerminator(): ACResult;
  abstract sentenceRejectsEmpty(): ACResult;
  abstract sentenceRejectsMissingTerminator(): ACResult;

  abstract percentageAcceptsZeroToHundred(): ACResult;
  abstract percentageRejectsOutOfRange(): ACResult;
  abstract percentageRejectsNonFinite(): ACResult;

  abstract parseErrorCarriesFieldAndValue(): ACResult;
  abstract parseErrorNameIsParseError(): ACResult;

  // Runtime type guards — protect callers bypassing TypeScript (JSON, dynamic imports, FFI)
  abstract stringConstructorsThrowParseErrorOnNonStringRuntimeInput(): ACResult;
  abstract percentageThrowsParseErrorOnNonNumberRuntimeInput(): ACResult;
}
