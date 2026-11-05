import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

/** Tier-2 roadmap — C7. Immutable version + content-hash on every spec node. */
export abstract class ReqVersionedTraceabilityRequirement extends Requirement {
  readonly id = 'REQ-VERSIONED-TRACEABILITY';
  readonly title = 'Every Requirement / Feature / AC carries an immutable version + content hash so bindings pin a specific revision';
  readonly priority = Priority.High;
  readonly status = 'Draft' as const;
  readonly kind = 'NonFunctional' as const;

  readonly statement = {
    pattern: 'ubiquitous' as const,
    response: 'compute a `VersionInfo` (monotonic integer + deterministic content-hash + since-date) for every Requirement, Feature, and AC, and fail `compliance --strict` when a Feature pins a prior version of a Requirement whose current version differs.',
  };

  readonly rationale = {
    claim: 'Without immutable version pins on the traceability graph, regulated customers cannot prove that a specific release shipped against a specific revision of the Requirement — an audit trail built on mutable state is not an audit trail.',
    kind: 'regulatory-compliance' as const,
    evidence: [
      { kind: 'study' as const, title: 'IEC 61508 — Functional safety of electrical/electronic/programmable electronic safety-related systems',
        authors: 'IEC', year: 2010 },
      { kind: 'study' as const, title: '21 CFR Part 11 — Electronic Records; Electronic Signatures',
        authors: 'US FDA', year: 1997,
        url: 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfcfr/CFRSearch.cfm?CFRPart=11' },
      { kind: 'precedent' as const, requirement: 'git-commit-hash',
        rationale: 'Content-addressed storage is the accepted industrial pattern for immutable audit trails.' },
      { kind: 'expert-opinion' as const, expert: 'user-plan-discussion-2026-04-14', recordedAt: '2026-04-14' },
    ],
    assumptions: [
      'The content-hash function normalises formatting so cosmetic edits do not bump versions.',
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const,
      describes: 'versionInfo computed deterministically from spec content',
      binds: ['versionInfoComputesContentHashDeterministically', 'versionInfoComputesMonotonicInteger'] },
    { kind: 'unit-test' as const,
      describes: 'compliance --strict detects a Feature pinning a stale Requirement version',
      binds: ['complianceStrictFailsOnUnpinnedReqDrift', 'diffCoreDetectsVersionPinMismatch'] },
    { kind: 'unit-test' as const, describes: "Every bump appends a history entry; hashes exclude history and schema version; supersedes preserves identity links across semantic changes.", binds: ["historyEntryLogsEveryVersionBump","contentHashExcludesHistoryAndSchemaVersion","supersedesLinkChainsSemanticHistory"] },
    { kind: 'metric' as const,
      name: 'mean-time-to-detect-version-regression',
      query: 'requirements.version.regression.mttd',
      operator: '<=' as const, threshold: 60, window: 'per CI run' },
    { kind: 'quality-gate' as const, tool: 'requirements', rule: 'compliance --strict version-drift check' },
  ];

  readonly verificationMethod = 'Test' as const;

  readonly source = {
    type: 'standard' as const,
    org: 'IEC/FDA',
    id: 'IEC-61508 + 21-CFR-11',
    section: 'audit trail + electronic records',
  };

  readonly risk = {
    level: 'Critical' as const,
    ifNotMet: 'Regulated customers (pharma / safety / finance) reject the DSL outright because the traceability artefact does not carry immutable version semantics.',
    mitigations: [
      'Ship version-info as a pure additive field; tolerate unpinned @Satisfies as warnings to avoid breaking existing corpora.',
      'Document the content-hash normalisation algorithm so auditors can replay it.',
    ],
  };
}
