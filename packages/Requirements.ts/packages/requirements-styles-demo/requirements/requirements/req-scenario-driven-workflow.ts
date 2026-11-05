import { Requirement, Priority } from '@frenchexdev2/requirements-core';
import type { DefaultStyleType } from '@frenchexdev2/requirements-styles';

/**
 * A single declarative scenario file shall drive the end-to-end generation of
 * a typed Requirements project. Replay of the same scenario twice must yield
 * byte-identical artifacts — the scenario IS the single source of truth for
 * "what this demo/bootstrap produces".
 */
export abstract class ReqScenarioDrivenWorkflowRequirement extends Requirement<DefaultStyleType> {
  readonly id = 'REQ-SCENARIO-DRIVEN-WORKFLOW';
  readonly title = 'A single declarative scenario file shall drive the end-to-end generation of a typed Requirements project';
  readonly priority = Priority.High;
  readonly status = 'Draft' as const;
  readonly kind = 'Functional' as const;

  readonly statement = {
    pattern: 'event-driven' as const,
    trigger: 'When `requirements scenario play <file>` is invoked,',
    response: 'the player shall load, validate, and replay the scenario non-interactively — producing requirements/, features/, scaffolded tests, and (optionally) AC implementations, with no manual file editing.',
  };

  readonly rationale = {
    claim: 'Demonstrations, onboarding workshops, and regression runs all need the same input → output pipeline; a scenario file freezes that pipeline into a reviewable artifact.',
    kind: 'evidence-based' as const,
    evidence: [
      { kind: 'expert-opinion' as const, expert: 'user-plan-discussion-2026-04-14', recordedAt: '2026-04-14' },
      { kind: 'precedent' as const, requirement: 'REQ-BOOTSTRAP-ZERO-FRICTION',
        rationale: 'Scenarii generalise the zero-friction wizard to a replayable batch form.' },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const,
      describes: 'scenario play produces a valid four-tier project (Requirements, Features, ACs, scaffolded tests).',
      binds: ['scenarioPlayProducesFourTierProject', 'scenarioPlayRunsComplianceStrictAtEnd'] },
    { kind: 'demonstration' as const,
      scenario: 'A fresh temp dir + `sis-iec61511-fired-heater.json` yields a compiling project passing `compliance --strict`.' },
    { kind: 'quality-gate' as const, tool: 'ajv', rule: 'Every scenario file validates against scenario.schema.json before any side effect.' },
    { kind: 'inspection' as const,
      checklist: ['Scenario forward references (satisfiedByFeatureIds, satisfies) are cross-validated.',
                  'Replay is byte-deterministic under a fixed --seed.'],
      reviewers: ['maintainer'] },
    { kind: 'narrative' as const, text: 'The scenario file and its produced artifacts together form a reproducible demo capsule.' },
  ];

  readonly verificationMethod = 'Test' as const;

  readonly source = { type: 'stakeholder' as const, role: 'user', date: '2026-04-14' };

  readonly risk = {
    level: 'High' as const,
    ifNotMet: 'Demos and onboarding remain hand-driven; reproducibility collapses; regressions escape.',
  };
}
