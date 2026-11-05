import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

/** Tier-2 roadmap — C8. Orthogonal toggling of Features / ACs. */
export abstract class ReqOrthogonalTogglingRequirement extends Requirement {
  readonly id = 'REQ-ORTHOGONAL-TOGGLING';
  readonly title = 'Features and ACs can be toggled via an orthogonal ToggleProvider port (environment, rollout %, time, tier)';
  readonly priority = Priority.High;
  readonly status = 'Draft' as const;
  readonly kind = 'NonFunctional' as const;

  readonly statement = {
    pattern: 'event-driven' as const,
    trigger: 'a ToggleProvider is configured and a Feature or AC carries a `@Toggle(gate)` decorator',
    response: 'classify the gated AC as `NotApplicable` in the compliance report when the gate resolves to off, rather than as `Uncovered`, and exclude it from `compliance --strict` failures.',
  };

  readonly rationale = {
    claim: 'Continuous-delivery organisations ship behind rollout gates; a traceability DSL that conflates "intentionally off in this env" with "missing test" is unusable in production pipelines.',
    kind: 'value-driven' as const,
    evidence: [
      { kind: 'precedent' as const, requirement: 'launchdarkly/growthbook/unleash',
        rationale: 'Feature-flag platforms prove the shape of the ToggleProvider port; we adopt it as an orthogonal port rather than reinventing.' },
      { kind: 'study' as const, title: 'Feature Toggles (aka Feature Flags)',
        authors: 'Pete Hodgson (Fowler)', year: 2017,
        url: 'https://martinfowler.com/articles/feature-toggles.html' },
      { kind: 'expert-opinion' as const, expert: 'user-plan-discussion-2026-04-14', recordedAt: '2026-04-14' },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const,
      describes: 'ToggleProvider port is implemented and injectable via the CLI shell',
      binds: ['toggleProviderPortIsImplemented'] },
    { kind: 'unit-test' as const,
      describes: '@Toggle decorator gates AC execution by gate name',
      binds: ['toggleDecoratorGatesAcByGateName', 'enabledWhenDecoratorAcceptsPredicate'] },
    { kind: 'inspection' as const,
      checklist: [
        'an example adapter for LaunchDarkly or GrowthBook ships in examples/',
        'no hard-coded `process.env` checks leak into src/ (separation of policy and mechanism)',
        'ReleaseStage enum is defined independently of status workflow',
      ],
      reviewers: ['maintainer'] },
    { kind: 'quality-gate' as const,
      tool: 'eslint', rule: 'no-process-env in src/' },
    { kind: 'unit-test' as const,
      describes: 'rollout percentages gated by a deterministic seeded RNG for testability',
      binds: ['rolloutPercentageGatedByRng'] },
  ];

  readonly verificationMethod = 'Test' as const;

  readonly source = {
    type: 'stakeholder' as const,
    role: 'principle/production-grade-toggle',
    date: '2026-04-14',
  };

  readonly risk = {
    level: 'High' as const,
    ifNotMet: 'Absence blocks adoption by continuous-delivery organisations; they fork the DSL or bolt on home-grown toggling, fragmenting the ecosystem.',
    mitigations: [
      'Ship a stub ToggleProvider (all-on) as default so adoption does not require a toggle backend.',
      'Keep the port minimal — a single `isEnabled(gate, ctx)` method — so adapters stay tiny.',
    ],
  };
}
