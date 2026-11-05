import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements-shared-kernel';
import { ReqStyleCompileTimeNarrowingRequirement } from './req-style-compile-time-narrowing.js';

/**
 * Type helpers KindsOf / StatusesOf / RiskLevelsOf / VerificationMethodsOf / RationaleKindsOf /
 * SourceKindsOf / StatementPatternsOf narrow a const-typed Style into string literal unions
 * usable by `Requirement<S>`. These ACs are verified by compile-time assertions in
 * `test/unit/style-type-helpers.types.test.ts` (tsc --noEmit), not by runtime vitest cases.
 */
@Satisfies(
  ReqStyleCompileTimeNarrowingRequirement,
)
export abstract class StyleTypeHelpersFeature extends Feature {
  readonly id = 'STYLE-TYPE-HELPERS';
  readonly title = 'RequirementStyle — compile-time narrowing helpers (KindsOf, StatusesOf, ...)';
  readonly priority = Priority.Critical;

  abstract kindsOfNarrowsToStringLiteralUnion(): ACResult;
  abstract statusesOfNarrowsToWorkflowStates(): ACResult;
  abstract riskLevelsOfNarrowsToTaxonomyLevels(): ACResult;
  abstract verificationMethodsOfNarrows(): ACResult;
  abstract rationaleKindsOfNarrows(): ACResult;
  abstract sourceKindsOfNarrowsToKindField(): ACResult;
  abstract statementPatternsOfNarrowsToPatternField(): ACResult;
  abstract outOfVocabularyValueIsRejectedByCompiler(): ACResult;
}
