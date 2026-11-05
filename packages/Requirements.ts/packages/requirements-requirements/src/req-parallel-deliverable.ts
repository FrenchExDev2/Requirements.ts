import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

export abstract class ReqParallelDeliverableRequirement extends Requirement {
  readonly id = 'REQ-PARALLEL-DELIVERABLE';
  readonly title = 'Work partitions into ≥ 4 conflict-free parallel streams against frozen contracts';
  readonly priority = Priority.Medium;
  readonly status = 'Approved' as const;
  readonly kind = 'NonFunctional' as const;

  readonly statement = {
    pattern: 'ubiquitous' as const,
    response: 'partition the implementation into ≥ 4 parallel workstreams sharing only frozen Phase 0 interface types, with zero file overlap.',
  };

  readonly rationale = {
    claim: 'A monolithic plan that takes one agent a week is worse than a partitioned plan that takes 5 agents a day; parallelism is the multiplier.',
    kind: 'evidence-based' as const,
    evidence: [
      { kind: 'expert-opinion' as const, expert: 'user-plan-discussion-2026-04-14', recordedAt: '2026-04-14' },
    ],
  };

  readonly fitCriteria = [
    { kind: 'inspection' as const, checklist: ['Phase 0 PR merges before any Phase 1 stream opens',
                                                'each Phase 1 PR touches only files in its declared deliverable list',
                                                'no two Phase 1 streams import from each other'],
      reviewers: ['maintainer'] },
  ];

  readonly verificationMethod = 'Inspection' as const;
  readonly source = { type: 'stakeholder' as const, role: 'user', date: '2026-04-14' };
  readonly risk = { level: 'Medium' as const, ifNotMet: 'Work serialises; agents collide on shared files; merge conflicts balloon.' };
}
