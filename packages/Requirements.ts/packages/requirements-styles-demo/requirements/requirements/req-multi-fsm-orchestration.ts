import { Requirement, Priority } from '@frenchexdev2/requirements-core';
import type { DefaultStyleType } from '@frenchexdev2/requirements-styles';

/**
 * Three coordinated typed-FSMs (ProjectLifecycle / PerFeature / PerAc) shall
 * drive scenario playback with full determinism and replay-ability. FSMs must
 * share no mutable state; cross-FSM coupling is events only.
 */
export abstract class ReqMultiFsmOrchestrationRequirement extends Requirement<DefaultStyleType> {
  readonly id = 'REQ-MULTI-FSM-ORCHESTRATION';
  readonly title = 'Three coordinated typed-FSMs shall drive scenario playback with full determinism';
  readonly priority = Priority.High;
  readonly status = 'Draft' as const;
  readonly kind = 'NonFunctional' as const;

  readonly statement = {
    pattern: 'ubiquitous' as const,
    response: 'orchestrate scenario playback with three coordinated FSMs (ProjectLifecycle, PerFeature, PerAc) whose composition is declared via @FiniteStateMachine decorators and whose only coupling is typed events.',
  };

  readonly rationale = {
    claim: 'A monolithic playback loop is untestable; three small FSMs with a clean event contract are individually unit-testable and replayable from a recorded event log.',
    kind: 'principle' as const,
    evidence: [
      { kind: 'precedent' as const, requirement: 'REQ-DISCOVERABLE-TRACEABILITY',
        rationale: 'typed-fsm is already the package-wide answer for orchestration state.' },
      { kind: 'expert-opinion' as const, expert: 'user-design-discussion-2026-04-14', recordedAt: '2026-04-14' },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const,
      describes: 'every declared transition of the 3 FSMs is exercised by at least one unit test.',
      binds: ['everyProjectLifecycleTransitionIsTested', 'everyPerFeatureTransitionIsTested', 'everyPerAcTransitionIsTested'] },
    { kind: 'inspection' as const,
      checklist: ['No file in src/cli/scenario/ imports mutable state from another FSM module.',
                  'Cross-FSM coupling flows through typed events only.',
                  'Each FSM declares its @FiniteStateMachine descriptor (states, events, transitions).'],
      reviewers: ['maintainer'] },
    { kind: 'metric' as const, name: 'scenario-determinism', query: 'diff of artifacts across two identical --seed runs',
      operator: "=" as const, threshold: 0, window: 'per-scenario' },
    { kind: 'quality-gate' as const, tool: 'rg',
      rule: '`rg "new Date\\(\\)|Math.random\\(\\)" src/cli/scenario/` must return zero non-test matches (determinism).' },
  ];

  readonly verificationMethod = 'Test' as const;

  readonly source = { type: 'stakeholder' as const, role: 'maintainer', date: '2026-04-14' };

  readonly risk = {
    level: 'High' as const,
    ifNotMet: 'Non-deterministic playback breaks golden-master tests; demos drift; state is uninspectable.',
  };
}
