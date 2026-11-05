import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

export abstract class ReqBootstrapZeroFrictionRequirement extends Requirement {
  readonly id = 'REQ-BOOTSTRAP-ZERO-FRICTION';
  readonly title = 'One command bootstraps a Feature end-to-end';
  readonly priority = Priority.High;
  readonly status = 'Approved' as const;
  readonly kind = 'UserStory' as const;

  readonly statement = {
    pattern: 'ubiquitous' as const,
    response: 'let a user create a Feature class, its spec.json, and the scaffolded test stubs by running one interactive command, with no manual file editing.',
  };

  readonly rationale = {
    claim: 'Manual creation of Feature files is the friction that prevents adoption of the DSL.',
    kind: 'evidence-based' as const,
    evidence: [
      { kind: 'expert-opinion' as const, expert: 'user-conversation-2026-04-14', recordedAt: '2026-04-14' },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const,
      describes: 'wizard walks id/title/priority/AC-loop and produces a valid FeatureSpec',
      binds: ['wizardCollectsIdTitlePriority', 'wizardLoopsAcsUntilEnd'] },
    { kind: 'demonstration' as const,
      scenario: 'End-to-end wizard run in a temp dir yields a compilable Feature file + passing tests.' },
  ];

  readonly verificationMethod = 'Test' as const;

  readonly source = { type: 'stakeholder' as const, role: 'user', date: '2026-04-14' };

  readonly risk = {
    level: 'High' as const,
    ifNotMet: 'The DSL stays niche: adoption capped at authors willing to hand-craft every Feature file.',
  };
}
