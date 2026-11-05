import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

export abstract class ReqSpecIsSourceOfTruthRequirement extends Requirement {
  readonly id = 'REQ-SPEC-IS-SOURCE-OF-TRUTH';
  readonly title = 'The spec.json is the canonical source of truth; generation is idempotent and sync-able';
  readonly priority = Priority.Critical;
  readonly status = 'Approved' as const;
  readonly kind = 'NonFunctional' as const;

  readonly statement = {
    pattern: 'event-driven' as const,
    trigger: 'the user runs `feature new` or `feature sync`',
    response: 'compute a SyncPlan comparing the in-memory spec against on-disk files, render a colored diff, and apply only the changes the user confirms.',
  };

  readonly rationale = {
    claim: 'Generators that blind-overwrite hand-edited derived code are dangerous; spec-driven diff/preview/apply is the only sustainable pattern.',
    kind: 'principle' as const,
    evidence: [
      { kind: 'precedent' as const, requirement: 'terraform/kubernetes',
        rationale: 'Industry-standard idempotent-apply pattern: plan → preview → apply.' },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const, describes: 'diffSpecToDisk classifies entries as create|unchanged|modified',
      binds: ['diffClassifiesEachTargetAsCreateUnchangedModified'] },
    { kind: 'unit-test' as const, describes: 'preview renders diff without any fs writes',
      binds: ['previewShowsDiffBeforeAnyWrite'] },
    { kind: 'unit-test' as const, describes: '--dry-run exits 0 after rendering, writes nothing',
      binds: ['dryRunFlagForcesPreviewCancel'] },
  ];

  readonly verificationMethod = 'Test' as const;
  readonly source = { type: 'stakeholder' as const, role: 'principle/idempotent-generation', date: '2026-04-14' };
  readonly risk = { level: 'Critical' as const, ifNotMet: 'Hand-edited code silently overwritten on sync; data loss events erode trust in the DSL.' };
}
