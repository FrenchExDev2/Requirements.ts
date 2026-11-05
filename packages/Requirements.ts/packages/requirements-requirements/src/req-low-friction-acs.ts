import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

/** Tier-2 roadmap. */
export abstract class ReqLowFrictionAcsRequirement extends Requirement {
  readonly id = 'REQ-LOW-FRICTION-ACS';
  readonly title = 'The wizard must suggest AC names to reduce cognitive load during bootstrapping';
  readonly priority = Priority.Low;
  readonly status = 'Draft' as const;
  readonly kind = 'UserStory' as const;

  readonly statement = {
    pattern: 'event-driven' as const,
    trigger: 'a user enters a Feature title in `requirement new` or `feature new`',
    response: 'propose 3-5 AC names inferred deterministically from the existing corpus of Features in the repository, which the user can Tab-accept, edit, or ignore.',
  };

  readonly rationale = {
    claim: 'AC naming is the step where users most often abandon the wizard — they stare at an empty prompt. Suggestions convert paralysis into a choice.',
    kind: 'evidence-based' as const,
    evidence: [
      { kind: 'expert-opinion' as const, expert: 'user-plan-discussion-2026-04-14', recordedAt: '2026-04-14' },
      { kind: 'study' as const, title: 'Recognition-primed Decision Making',
        authors: 'Klein, G.', year: 1993,
        url: 'https://doi.org/10.1037/10138-012' },
      { kind: 'precedent' as const, requirement: 'github-copilot/tabnine',
        rationale: 'Tab-accept autocomplete is the dominant pattern for converting blank-page paralysis into edits; this requirement asks for the deterministic, offline version.' },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const,
      describes: 'suggester returns ≥ 3 plausible AC names for a known domain',
      binds: ['acSuggesterReturnsPlausibleNames'] },
    { kind: 'unit-test' as const,
      describes: 'suggester works with zero LLM call — n-gram + verb patterns only (determinism + offline)',
      binds: ['acSuggesterIsDeterministicAndOffline'] },
    { kind: 'unit-test' as const,
      describes: 'suggester returns an empty list on empty corpus without throwing',
      binds: ['acSuggesterDegradesGracefullyOnEmptyCorpus'] },
    { kind: 'inspection' as const,
      checklist: [
        'suggestions do not leak AC names from packages outside the current repo',
        'suggestions ranked by a documented, reproducible score',
      ],
      reviewers: ['maintainer'] },
  ];

  readonly verificationMethod = 'Test' as const;

  readonly source = {
    type: 'stakeholder' as const,
    role: 'principle/reduce-cognitive-load',
    date: '2026-04-14',
  };

  readonly risk = {
    level: 'Low' as const,
    ifNotMet: 'Wizard abandonment rate stays high at the AC-naming step; new users write one Feature and never come back.',
    mitigations: [
      'Make the suggester strictly optional (Tab to accept, Esc to ignore); never block the wizard on suggester output.',
    ],
  };
}
