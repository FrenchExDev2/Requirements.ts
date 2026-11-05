import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqStyleOpenClosedRequirement } from './req-style-open-closed.js';
import { ReqStyleSeparatedConcernsRequirement } from './req-style-separated-concerns.js';

/**
 * StyleTemplates — the skeleton port consumed by `requirement new --template <id>`. A Style
 * exposes a templates list and a findTemplate(id) lookup; template skeletons pre-fill the
 * wizard with vocabulary-aligned defaults.
 */
@Satisfies(
  ReqStyleOpenClosedRequirement,
  ReqStyleSeparatedConcernsRequirement,
)
export abstract class StyleTemplatesFeature extends Feature {
  readonly id = 'STYLE-TEMPLATES';
  readonly title = 'RequirementStyle — templates port (requirement new skeletons)';
  readonly priority = Priority.Critical;

  abstract templatesListIsDefined(): ACResult;
  abstract findTemplateReturnsMatchingId(): ACResult;
  abstract findTemplateReturnsUndefinedOnMiss(): ACResult;
  abstract templateSkeletonKindIsInVocabulary(): ACResult;
}
