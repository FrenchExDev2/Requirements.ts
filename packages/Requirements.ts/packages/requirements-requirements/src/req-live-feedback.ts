import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

/** Tier-2 roadmap. */
export abstract class ReqLiveFeedbackRequirement extends Requirement {
  readonly id = 'REQ-LIVE-FEEDBACK';
  readonly title = 'Spec changes must surface validation + coverage diagnostics live, without manual command runs';
  readonly priority = Priority.Medium;
  readonly status = 'Draft' as const;
  readonly kind = 'NonFunctional' as const;

  readonly statement = {
    pattern: 'event-driven' as const,
    trigger: 'a .spec.json or Feature .ts file changes on disk while `requirements watch` runs',
    response: 'revalidate the affected spec, recompute compliance deltas, and print a one-line summary within 500 ms of the save.',
  };

  readonly rationale = {
    claim: 'Inner-loop speed drives DSL adoption; manual `compliance` runs get skipped; live feedback keeps the DSL honest without requiring user discipline.',
    kind: 'evidence-based' as const,
    evidence: [
      { kind: 'precedent' as const, requirement: 'vitest-watch + tsc-watch',
        rationale: 'Watch-mode is the bar for DX in every modern TypeScript toolchain.' },
      { kind: 'metric' as const, name: 'industry-baseline-watch-latency',
        value: '200-500ms (vitest-watch median)', date: '2026-04-14',
        sourceUrl: 'https://vitest.dev/guide/cli.html#watch' },
      { kind: 'study' as const, title: 'Programmer Attention During Development',
        authors: 'Parnin, Rugaber', year: 2011 },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const,
      describes: 'watch detects a .spec.json save and revalidates within 500 ms',
      binds: ['watchDetectsSpecChange'] },
    { kind: 'unit-test' as const,
      describes: 'watch debounces a burst of rapid saves into a single revalidation',
      binds: ['watchDetectsRapidSuccessionAndDebounces'] },
    { kind: 'metric' as const, name: 'watch-latency-p95',
      query: 'watch.revalidate.latency.p95',
      operator: '<' as const, threshold: 500, window: 'last 100 events' },
    { kind: 'inspection' as const,
      checklist: [
        'on Windows, saves from VSCode trigger exactly one revalidation (not two)',
        'Ctrl-C cleanly tears down all fs watchers',
      ],
      reviewers: ['maintainer'] },
  ];

  readonly verificationMethod = 'Test' as const;

  readonly source = {
    type: 'stakeholder' as const,
    role: 'principle/fast-feedback',
    date: '2026-04-14',
  };

  readonly risk = {
    level: 'Medium' as const,
    ifNotMet: 'Users skip compliance runs; specs drift; broken specs ship to CI; the DSL gets blamed for the drift rather than the absence of live feedback.',
    mitigations: [
      'Keep watch-mode deliberately simple (no daemon, no IPC) so Ctrl-C is the full teardown story.',
    ],
  };
}
