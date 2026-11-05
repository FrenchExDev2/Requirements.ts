import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

export abstract class ReqDogFoodRequirement extends Requirement {
  readonly id = 'REQ-DOG-FOOD';
  readonly title = 'The DSL must be tested with itself — @FeatureTest/@Verifies only, never describe/it';
  readonly priority = Priority.Critical;
  readonly status = 'Approved' as const;
  readonly kind = 'Constraint' as const;

  readonly statement = {
    pattern: 'ubiquitous' as const,
    response: 'use @FeatureTest and @Verifies for every test of every new command, against a Feature class under requirements/features/, and every Feature class must declare @Satisfies listing the Requirements it helps meet.',
  };

  readonly rationale = {
    claim: 'A DSL whose authors do not dog-food it has no credibility; this is already a non-negotiable project rule recorded in user memory.',
    kind: 'principle' as const,
    evidence: [
      { kind: 'precedent' as const, requirement: 'feedback_no_describe_it',
        rationale: 'User memory rule, absolute across all packages.' },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const, describes: "AST inspection rejects direct, aliased, namespaced, skipped and parameterized framework registrations throughout the declared test corpus.", binds: ["inspectsAliasedTestRegistration"] },
    { kind: 'unit-test' as const, describes: 'every Feature class must be linked to ≥ 1 Requirement via @Satisfies; compliance --strict fails on any orphan',
      binds: ['satisfiesDecoratorRegistersBidirectionalLink', 'complianceStrictFailsOnFeatureWithoutSatisfies'] },
    { kind: 'unit-test' as const, describes: "Qualification requires complete per-file lines, branches, functions and statements coverage, including executable CLI and scripts, at 100 percent.", binds: ["requiresCompleteCoverage"] },
  ];

  readonly verificationMethod = 'Test' as const;
  readonly source = { type: 'stakeholder' as const, role: 'project-rule', date: '2026-04-14' };
  readonly risk = { level: 'Critical' as const, ifNotMet: 'Package preaches a DSL it does not use; credibility collapses; users reject.' };
}
