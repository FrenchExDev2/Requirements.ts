import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

/**
 * REQ-DSL-COMPLETE — The DSL must track Requirements, not just Features.
 *
 * The class IS the spec. Every field below is typed against DefaultStyle.
 * No field here comes from prose comments — everything is machine-readable.
 */
export abstract class ReqDslCompleteRequirement extends Requirement {
  readonly id = 'REQ-DSL-COMPLETE';
  readonly title = 'The DSL must track Requirements, not just Features';
  readonly priority = Priority.Critical;
  readonly status = 'Approved' as const;
  readonly kind = 'Functional' as const;

  readonly statement = {
    pattern: 'ubiquitous' as const,
    response: 'let users define Requirement instances and link Features to them via @Satisfies so traceability spans the full Requirement → Feature → AC → Test chain.',
  };

  readonly rationale = {
    claim: 'A package named "requirements" that does not track Requirements is a misnamed lie; this is the keystone that makes the rest coherent.',
    kind: 'principle' as const,
    evidence: [
      { kind: 'precedent' as const, requirement: 'REQ-VOCAB-INDUSTRY-ALIGNED',
        rationale: 'ISO/IEC/IEEE 29148 and SysML both root traceability at the Requirement tier.' },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const,
      describes: 'satisfiesDecoratorRegistersBidirectionalLink populates both feature.satisfies() and requirement.satisfiedBy()',
      binds: ['satisfiesDecoratorRegistersBidirectionalLink'] },
    { kind: 'unit-test' as const,
      describes: 'requirementNewWizardCollectsAllFields produces a RequirementSpec passing the style validator',
      binds: ['requirementNewWizardCollectsAllFields'] },
    { kind: 'unit-test' as const, describes: "The shipped README and glossary describe the four-tier chain, attribute Requirement terminology to 29148, and the inverse relationship is executable.", binds: ["documentsCanonicalTraceabilityAndInverseLinks"] },
  ];

  readonly verificationMethod = 'Test' as const;

  readonly source = {
    type: 'stakeholder' as const,
    role: 'principle/package-name-truthfulness',
    date: '2026-04-14',
  };

  readonly risk = {
    level: 'Critical' as const,
    ifNotMet: 'The package misrepresents itself; users rationally reject it as an over-promising DSL.',
  };

  readonly tracedTo = [{ system: 'url' as const, href: 'plan: sparkling-booping-moonbeam.md', label: 'design plan' }];
}
