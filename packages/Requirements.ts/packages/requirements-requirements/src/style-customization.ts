import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqStyleOpenClosedRequirement } from './req-style-open-closed.js';
import { ReqStyleSeparatedConcernsRequirement } from './req-style-separated-concerns.js';

@Satisfies(ReqStyleOpenClosedRequirement, ReqStyleSeparatedConcernsRequirement)
export abstract class StyleCustomizationFeature extends Feature {
  readonly id = 'STYLE-CUSTOMIZATION';
  readonly title = 'Project-defined vocabularies, registry configuration and independent Style concerns';
  readonly priority = Priority.Critical;
  abstract customStyleNarrowsRequirementFieldsToItsOwnVocabulary(): ACResult;
  abstract configResolutionLoadsDeclaredStyleFromRegistry(): ACResult;
  abstract customStyleCanOverrideSingleSubInterface(): ACResult;
}
