import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

/**
 * REQ-STYLE-COMPILE-TIME-NARROWING — A const-typed Style narrows Requirement fields at compile time.
 *
 * The type helpers `KindsOf<S>`, `StatusesOf<S>`, `RiskLevelsOf<S>`, `VerificationMethodsOf<S>`,
 * `RationaleKindsOf<S>`, `SourceKindsOf<S>`, `StatementPatternsOf<S>` exported from style.ts
 * are the compile-time exits of the vocabulary: `req.kind` must be a string literal union pulled
 * from the declared Style, not just `string`. Validation errors surface at `tsc --noEmit`,
 * never only at runtime.
 */
export abstract class ReqStyleCompileTimeNarrowingRequirement extends Requirement {
  readonly id = 'REQ-STYLE-COMPILE-TIME-NARROWING';
  readonly title = 'A const-typed Style narrows Requirement fields at compile time';
  readonly priority = Priority.Critical;
  readonly status = 'Approved' as const;
  readonly kind = 'NonFunctional' as const;

  readonly statement = {
    pattern: 'event-driven' as const,
    trigger: 'a project declares a RequirementStyle as const and parameterises Requirement over it',
    response: 'TypeScript rejects at compile time any value assigned to `kind`, `status`, `risk.level`, `verificationMethod`, `rationale.kind`, `source.type` or `statement.pattern` that falls outside the Style vocabulary.',
  };

  readonly rationale = {
    claim: 'A DSL that validates its ontology only at runtime is not a typed DSL — it is a schema checker dressed as types. The Style abstraction must carry compile-time contracts through KindsOf<S> and friends or the `<S extends RequirementStyle>` generic is cargo-culted.',
    kind: 'principle' as const,
    evidence: [
      { kind: 'precedent' as const, requirement: 'REQ-DSL-COMPLETE',
        rationale: 'REQ-DSL-COMPLETE states the class IS the spec; compile-time narrowing is the only way that claim holds without a runtime validator.' },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const,
      describes: 'KindsOf<typeof DefaultStyle> narrows to the literal union of declared requirement kinds',
      binds: ['kindsOfNarrowsToStringLiteralUnion'] },
    { kind: 'unit-test' as const,
      describes: 'StatusesOf<typeof DefaultStyle> narrows to the statusWorkflow states',
      binds: ['statusesOfNarrowsToWorkflowStates'] },
    { kind: 'unit-test' as const,
      describes: 'assigning an out-of-vocabulary literal to req.kind fails tsc --noEmit',
      binds: ['outOfVocabularyValueIsRejectedByCompiler'] },
    { kind: 'unit-test' as const, describes: "Public style helper types narrow every Requirement field through a user-defined RequirementStyle, with rejected out-of-vocabulary compile cases.", binds: ["kindsOfNarrowsToStringLiteralUnion","statusesOfNarrowsToWorkflowStates","riskLevelsOfNarrowsToTaxonomyLevels","verificationMethodsOfNarrows","rationaleKindsOfNarrows","sourceKindsOfNarrowsToKindField","statementPatternsOfNarrowsToPatternField","outOfVocabularyValueIsRejectedByCompiler"] },
  ];

  readonly verificationMethod = 'Test' as const;

  readonly source = {
    type: 'stakeholder' as const,
    role: 'principle/types-as-contracts',
    date: '2026-04-23',
  };

  readonly risk = {
    level: 'Critical' as const,
    ifNotMet: 'Ontology errors escape compilation and resurface at runtime — a regression compared to native `as const` unions. The DSL loses its claim to be a typed DSL and collapses to a schema checker.',
  };
}
