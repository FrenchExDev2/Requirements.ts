import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

/** Tier-2 roadmap. */
export abstract class ReqRefactorSafeRequirement extends Requirement {
  readonly id = 'REQ-REFACTOR-SAFE';
  readonly title = 'Identifier renames must propagate atomically across all linked artefacts';
  readonly priority = Priority.Medium;
  readonly status = 'Draft' as const;
  readonly kind = 'NonFunctional' as const;

  readonly statement = {
    pattern: 'event-driven' as const,
    trigger: 'a user runs `requirements feature rename <old> <new>` or `requirements requirement rename <old> <new>`',
    response: 'rename the class, the file, the spec.json, every `@Verifies<OldFeature>()` call-site, and every `@Satisfies(Old)` reference atomically in a single commit-ready diff, or refuse if any site would be ambiguous.',
  };

  readonly rationale = {
    claim: 'Renaming a Feature or AC today is scary because references live in N test files and M Requirement classes; a codemod removes the fear, keeps vocabulary coherent, and lowers the cost of naming mistakes.',
    kind: 'evidence-based' as const,
    evidence: [
      { kind: 'expert-opinion' as const, expert: 'user-plan-discussion-2026-04-14', recordedAt: '2026-04-14' },
      { kind: 'precedent' as const, requirement: 'ts-morph/jscodeshift',
        rationale: 'Every mature TS/JS project eventually ships a codemod layer precisely because cross-file rename is the class of refactor that gets skipped without tooling.' },
      { kind: 'study' as const, title: 'A Study of Rename Refactorings',
        authors: 'Liu, Feldthaus, Møller', year: 2012,
        url: 'https://pages.cs.wisc.edu/~remzi/Classes/736/Spring2012/Papers/rename.pdf' },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const,
      describes: 'feature rename updates class name, file name, spec.json, and every @Verifies<T> site',
      binds: ['featureRenameUpdatesAllReferences'] },
    { kind: 'unit-test' as const,
      describes: 'feature rename refuses when target id exists and --force not passed',
      binds: ['featureRenameRefusesConflict'] },
    { kind: 'unit-test' as const,
      describes: 'requirement rename propagates into every @Satisfies(...) arg list',
      binds: ['requirementRenameUpdatesSatisfiesArgs'] },
    { kind: 'unit-test' as const, describes: "A rename with syntactic or semantic type errors is refused before filesystem writes.", binds: ["renameRefusesWhenResultingCodeDoesNotTypeCheck"] },
    { kind: 'unit-test' as const, describes: "One executable rename scenario updates at least thirty Verifies call sites in the same planned diff. No historical production recording is asserted.", binds: ["endToEndRenameFlowsAcrossThirtyVerifiesSites"] },
  ];

  readonly verificationMethod = 'Test' as const;

  readonly source = {
    type: 'stakeholder' as const,
    role: 'principle/refactor-safety',
    date: '2026-04-14',
  };

  readonly risk = {
    level: 'Medium' as const,
    ifNotMet: 'Users avoid renames; names rot; vocabulary drifts across generations of contributors; the DSL accumulates frozen mistakes.',
    mitigations: [
      'Ship with a dry-run-first default so no user is ever surprised by a rename blast radius.',
      'Require rename to produce a tsc-clean output or abort.',
    ],
  };
}
