import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

export abstract class ReqVocabIndustryAlignedRequirement extends Requirement {
  readonly id = 'REQ-VOCAB-INDUSTRY-ALIGNED';
  readonly title = 'Traceability verbs must match SysML / ISO-29148 / BDD vocabulary';
  readonly priority = Priority.Medium;
  readonly status = 'Approved' as const;
  readonly kind = 'NonFunctional' as const;

  readonly statement = {
    pattern: 'ubiquitous' as const,
    response: 'name traceability-link verbs in alignment with SysML, INCOSE, ISO/IEC/IEEE 29148, and BDD practice: `satisfies`, `verifies`, `refines`, `specifies`; reports use the inverse forms `satisfiedBy`, `verifiedBy`, `refinedBy`, `specifiedBy`.',
  };

  readonly rationale = {
    claim: 'A project-specific DSL that invents its own vocabulary forces every new contributor to learn translations; standards alignment buys instant industry recognition.',
    kind: 'regulatory-compliance' as const,
    evidence: [
      { kind: 'study' as const, title: 'SysML specification 1.7', authors: 'OMG', year: 2022, url: 'https://www.omg.org/spec/SysML/' },
      { kind: 'study' as const, title: 'ISO/IEC/IEEE 29148:2018', authors: 'ISO/IEC/IEEE', year: 2018 },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const, describes: '@Satisfies + @Refines populate bidirectional link registries',
      binds: ['satisfiesDecoratorRegistersBidirectionalLink', 'refinesDecoratorRegistersParentChildLink'] },
    { kind: 'unit-test' as const, describes: "The shipped glossary defines canonical forward/inverse verbs with attributed sources; the runtime inverse index resolves satisfying Features.", binds: ["documentsCanonicalTraceabilityAndInverseLinks"] },
  ];

  readonly verificationMethod = 'Inspection' as const;
  readonly source = { type: 'standard' as const, org: 'OMG + ISO/IEC/IEEE', id: 'SysML 1.7 + 29148:2018' };
  readonly risk = { level: 'Medium' as const, ifNotMet: 'DSL invents jargon; onboarding cost rises, SysML/INCOSE practitioners reject it as ad-hoc.' };
}
