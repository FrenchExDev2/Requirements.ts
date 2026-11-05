import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

/** Tier-2 roadmap — Draft status, not yet committed. */
export abstract class ReqRoundTripEditableRequirement extends Requirement {
  readonly id = 'REQ-ROUND-TRIP-EDITABLE';
  readonly title = 'Either side of the spec↔code duality must be editable; the other regenerates';
  readonly priority = Priority.Medium;
  readonly status = 'Draft' as const;
  readonly kind = 'NonFunctional' as const;

  readonly statement = {
    pattern: 'ubiquitous' as const,
    response: 'regenerate the sibling artefact (the .ts class from a .spec.json edit, or vice versa) so that neither format is privileged as canonical and both edits round-trip idempotently.',
  };

  readonly rationale = {
    claim: 'Developers who prefer TypeScript-first authoring must not be forced through JSON, and JSON-native editors (VSCode schema, auditors) must not be forced through TypeScript; both surfaces must be first-class.',
    kind: 'principle' as const,
    evidence: [
      { kind: 'expert-opinion' as const, expert: 'user-plan-discussion-2026-04-14', recordedAt: '2026-04-14' },
      { kind: 'precedent' as const, requirement: 'REQ-SPEC-IS-SOURCE-OF-TRUTH',
        rationale: 'The Tier-1 spec-as-SOT requirement created a one-way pipeline; Tier 2 must close the loop without demoting .ts authors.' },
      { kind: 'study' as const, title: 'Projectional Editing and Structural Source Management',
        authors: 'Völter, Pech', year: 2012,
        url: 'https://www.jetbrains.com/mps/concepts/projectional-editing/' },
    ],
    assumptions: [
      'A canonical normalisation function exists that makes either direction idempotent modulo formatting.',
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const,
      describes: 'editing the .ts class regenerates a matching .spec.json on sync',
      binds: ['bidirectionalSyncTsToJson'] },
    { kind: 'unit-test' as const,
      describes: 'editing the .spec.json regenerates a matching .ts class on sync',
      binds: ['bidirectionalSyncJsonToTs'] },
    { kind: 'unit-test' as const,
      describes: 'three round-trips ts → json → ts → json → ts converge to a fixed point (idempotence)',
      binds: ['roundTripIsIdempotentAfterThreeCycles'] },
    { kind: 'unit-test' as const, describes: "TS and JSON edits converge to the same serialized spec; divergent edits on both sides produce a conflict instead of an overwrite.", binds: ["bidirectionalSyncTsToJson","bidirectionalSyncJsonToTs","roundTripIsIdempotentAfterThreeCycles","syncRefusesAmbiguousMerge","syncDetectsDivergenceBetweenSources"] },
    { kind: 'quality-gate' as const, tool: 'requirements', rule: 'sync --verify (no drift) in CI' },
  ];

  readonly verificationMethod = 'Test' as const;

  readonly source = {
    type: 'stakeholder' as const,
    role: 'principle/no-forced-source',
    date: '2026-04-14',
  };

  readonly risk = {
    level: 'Medium' as const,
    ifNotMet: 'One format becomes second-class; a portion of the audience rejects the DSL for ergonomic reasons.',
    mitigations: [
      'Ship the bidirectional sync early and keep both fixtures equally maintained in CI.',
      'Publish round-trip property tests as acceptance bar for any schema change.',
    ],
  };
}
