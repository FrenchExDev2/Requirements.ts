import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqStyleOpenClosedRequirement } from './req-style-open-closed.js';
import { ReqStyleSeparatedConcernsRequirement } from './req-style-separated-concerns.js';

/**
 * StyleValidators — the shape-check port of a RequirementStyle. Two entrypoints:
 * validateStatement (against the Style's statement patterns) and validateSpec (against the
 * full Style vocabulary + schema). Both return ValidationResult with path+message errors.
 */
@Satisfies(
  ReqStyleOpenClosedRequirement,
  ReqStyleSeparatedConcernsRequirement,
)
export abstract class StyleValidatorsFeature extends Feature {
  readonly id = 'STYLE-VALIDATORS';
  readonly title = 'RequirementStyle — validators port (validateStatement + validateSpec)';
  readonly priority = Priority.Critical;

  abstract validateStatementReturnsValidationResult(): ACResult;
  abstract validateSpecReturnsValidationResult(): ACResult;
  abstract validationErrorHasPathAndMessage(): ACResult;
  abstract validSpecReturnsOkTrueEmptyErrors(): ACResult;
}
