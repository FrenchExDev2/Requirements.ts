import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

/**
 * REQ-STYLE-SEPARATED-CONCERNS — RequirementStyle bundles 5 orthogonal sub-interfaces, one per concern.
 *
 * StyleVocabulary (data), StyleValidators (shape checks), StyleTemplates (skeletons for `new`),
 * RequirementReporter (rendering), fitCriterionAdapters (external evaluators) live on separate
 * interfaces so a project overrides only what it needs. SOLID S + I: each sub-interface has a
 * single responsibility; projects implement small surfaces, not a monolith.
 */
export abstract class ReqStyleSeparatedConcernsRequirement extends Requirement {
  readonly id = 'REQ-STYLE-SEPARATED-CONCERNS';
  readonly title = 'RequirementStyle decomposes into 5 orthogonal sub-interfaces (SOLID S+I)';
  readonly priority = Priority.Critical;
  readonly status = 'Approved' as const;
  readonly kind = 'NonFunctional' as const;

  readonly statement = {
    pattern: 'ubiquitous' as const,
    response: 'no minimal-viable RequirementStyle implementation requires more than one sub-interface: a project can extend DefaultStyle and override only validators, or only reporter, without reimplementing the other four concerns.',
  };

  readonly rationale = {
    claim: 'Interface Segregation Principle: a monolithic Style interface forces every custom preset to rewrite everything, defeating the open/closed promise of REQ-STYLE-OPEN-CLOSED. Small, focused sub-interfaces keep override cost proportional to the concern being customised.',
    kind: 'principle' as const,
    evidence: [
      { kind: 'precedent' as const, requirement: 'REQ-STYLE-OPEN-CLOSED',
        rationale: 'Open/closed becomes theoretical if the only way to override a concern is to reimplement the four others — SEPARATED-CONCERNS is what makes OPEN-CLOSED operationally honest.' },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const,
      describes: 'a custom Style extending DefaultStyle with only its own validators still exposes DefaultStyle vocabulary, templates and reporter unchanged',
      binds: ['customStyleCanOverrideSingleSubInterface'] },
    { kind: 'unit-test' as const, describes: "The five style concerns are documented and composed from independently exported interfaces without cross-concern type references.", binds: ["styleConcernsHaveIndependentPublicInterfaces"] },
  ];

  readonly verificationMethod = 'Test' as const;

  readonly source = {
    type: 'stakeholder' as const,
    role: 'principle/single-responsibility',
    date: '2026-04-23',
  };

  readonly risk = {
    level: 'Critical' as const,
    ifNotMet: 'Every custom preset becomes a full reimplementation; maintenance surface explodes and the open/closed contract of REQ-STYLE-OPEN-CLOSED becomes theoretical.',
  };
}
