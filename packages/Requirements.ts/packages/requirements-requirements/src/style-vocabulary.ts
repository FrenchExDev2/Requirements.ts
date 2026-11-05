import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqStyleOpenClosedRequirement } from './req-style-open-closed.js';
import { ReqVocabIndustryAlignedRequirement } from './req-vocab-industry-aligned.js';

/**
 * StyleVocabulary — the data contract of a RequirementStyle: the 7 lists a project declares
 * (requirementKinds, statusWorkflow, riskTaxonomy, verificationMethods, rationaleKinds,
 * sourceKinds, statementPatterns) plus their internal shape constraints.
 */
@Satisfies(
  ReqStyleOpenClosedRequirement,
  ReqVocabIndustryAlignedRequirement,
)
export abstract class StyleVocabularyFeature extends Feature {
  readonly id = 'STYLE-VOCABULARY';
  readonly title = 'RequirementStyle — vocabulary data contract (7 lists + internal shape)';
  readonly priority = Priority.Critical;

  abstract vocabularyExposesAllSevenLists(): ACResult;
  abstract statusWorkflowHasInitialAndTerminal(): ACResult;
  abstract statusWorkflowTransitionsClosedOverStates(): ACResult;
  abstract riskTaxonomyLevelsNonEmpty(): ACResult;
  abstract sourceKindSchemaSlotsHaveType(): ACResult;
  abstract statementPatternHasTemplate(): ACResult;
}
