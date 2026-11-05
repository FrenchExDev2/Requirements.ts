import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

/**
 * REQ-STYLE-OPEN-CLOSED — Projects must declare their own ontology without forking requirements-core.
 *
 * The `Requirement<S>` base class depends on the `RequirementStyle` abstraction, never on a concrete
 * preset. A project that ships a legal-DSL, a safety-critical DSL, or a domain-specific vocabulary
 * brings its own Style and wires it through requirements.config.json — no source edit in requirements-core.
 */
export abstract class ReqStyleOpenClosedRequirement extends Requirement {
  readonly id = 'REQ-STYLE-OPEN-CLOSED';
  readonly title = 'Projects declare their own Style ontology without forking requirements-core';
  readonly priority = Priority.Critical;
  readonly status = 'Approved' as const;
  readonly kind = 'Functional' as const;

  readonly statement = {
    pattern: 'ubiquitous' as const,
    response: 'let every project declare a const-typed RequirementStyle (vocabulary + validators + templates + reporter + adapters) and wire it through requirements.config.json so Requirement<S> narrows against the project ontology without any edit to requirements-core.',
  };

  readonly rationale = {
    claim: 'A DSL that hard-codes its ontology is a schema, not a DSL; the whole point of the Style abstraction is open/closed by ontology injection, produced by a source generator (cf. principle/dsl-open-closed).',
    kind: 'principle' as const,
    evidence: [
      { kind: 'precedent' as const, requirement: 'REQ-VOCAB-INDUSTRY-ALIGNED',
        rationale: 'ISO/IEC/IEEE 29148 and SysML explicitly allow project-specific requirements vocabularies; the Style abstraction is the machine-readable concretion of that allowance.' },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const,
      describes: 'Requirement<CustomStyle> accepts kinds, statuses and risk levels that DefaultStyle does not',
      binds: ['customStyleNarrowsRequirementFieldsToItsOwnVocabulary'] },
    { kind: 'unit-test' as const,
      describes: 'requirements.config.json resolution picks the declared Style through StyleRegistry',
      binds: ['configResolutionLoadsDeclaredStyleFromRegistry'] },
    { kind: 'unit-test' as const, describes: "RequirementStyle is an exported interface; Requirement is parameterized by that interface, and core sources do not import the default-style package.", binds: ["styleUsesInterfacesAndInjectedVocabulary"] },
  ];

  readonly verificationMethod = 'Test' as const;

  readonly source = {
    type: 'stakeholder' as const,
    role: 'principle/dsl-open-closed',
    date: '2026-04-23',
  };

  readonly risk = {
    level: 'Critical' as const,
    ifNotMet: 'The DSL becomes a rigid schema; legal-DSL, safety-critical or domain projects must fork requirements-core, which kills reusability and makes the monorepo promise a lie.',
  };
}
