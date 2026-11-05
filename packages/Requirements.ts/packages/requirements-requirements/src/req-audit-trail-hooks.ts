import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

/** Tier-2 roadmap — C9. Hook-only: prepare schema for 21 CFR Part 11 integration. */
export abstract class ReqAuditTrailHooksRequirement extends Requirement {
  readonly id = 'REQ-AUDIT-TRAIL-HOOKS';
  readonly title = 'HistoryEntry extended with Reviewed / ApprovedBy / SignedOff change kinds + optional signature field (implementation deferred to Tier 3)';
  readonly priority = Priority.Medium;
  readonly status = 'Draft' as const;
  readonly kind = 'Constraint' as const;

  readonly statement = {
    pattern: 'ubiquitous' as const,
    response: 'support review / approval / sign-off semantics on history entries as typed no-op decorators and an optional `signature` field, so 21 CFR Part 11 Part E integration can be added later without a schema migration.',
  };

  readonly rationale = {
    claim: 'Schema migrations are disproportionately expensive for traceability artefacts because every downstream consumer (auditors, regulators, other repos) re-reads the corpus. Reserving the hooks now is cheap; reserving them later is a breaking change.',
    kind: 'regulatory-compliance' as const,
    evidence: [
      { kind: 'study' as const, title: '21 CFR Part 11 Part E — Electronic Signatures',
        authors: 'US FDA', year: 1997,
        url: 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfcfr/CFRSearch.cfm?CFRPart=11' },
      { kind: 'precedent' as const, requirement: 'REQ-VERSIONED-TRACEABILITY',
        rationale: 'Versioning establishes the immutable-history substrate; audit-trail hooks layer signed review/approval on top.' },
      { kind: 'expert-opinion' as const, expert: 'user-plan-discussion-2026-04-14', recordedAt: '2026-04-14' },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const,
      describes: 'ChangeKind discriminated union includes Reviewed, ApprovedBy, SignedOff',
      binds: ['changeKindUnionIncludesReviewedAndApprovedBy'] },
    { kind: 'unit-test' as const,
      describes: 'HistoryEntry.signature is optional and typed as Ed25519 or RSA-SHA256 discriminated union',
      binds: ['historyEntryCarriesOptionalSignature', 'signatureShapeIsEd25519OrRsaSha256'] },
    { kind: 'unit-test' as const, describes: "Review/sign-off decorators register metadata without execution effects; appending history leaves all previous entries unchanged.", binds: ["reviewedDecoratorExistsAsNoOp","signedOffDecoratorExistsAsNoOp","historyAppendIsImmutable"] },
    { kind: 'unit-test' as const,
      describes: '@Reviewed / @SignedOff decorators exist as typed no-ops',
      binds: ['reviewedDecoratorExistsAsNoOp', 'signedOffDecoratorExistsAsNoOp'] },
  ];

  readonly verificationMethod = 'Inspection' as const;

  readonly source = {
    type: 'standard' as const,
    org: 'US FDA',
    id: '21-CFR-11',
    section: 'Part E — Electronic Signatures',
  };

  readonly risk = {
    level: 'Medium' as const,
    ifNotMet: 'Absence of hooks means a breaking schema migration later when a regulated customer wants signed sign-off; a migration cascades through every corpus on disk.',
    mitigations: [
      'Land only the hooks (types + no-op decorators), no crypto or verification logic — Tier 3 owns the signature implementation.',
    ],
  };
}
