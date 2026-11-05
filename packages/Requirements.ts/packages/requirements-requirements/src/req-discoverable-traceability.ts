import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

/** Tier-2 roadmap. */
export abstract class ReqDiscoverableTraceabilityRequirement extends Requirement {
  readonly id = 'REQ-DISCOVERABLE-TRACEABILITY';
  readonly title = 'Users must explore the REQ → FEAT → AC → TEST graph interactively, not only via CLI reports';
  readonly priority = Priority.Low;
  readonly status = 'Draft' as const;
  readonly kind = 'NonFunctional' as const;

  readonly statement = {
    pattern: 'event-driven' as const,
    trigger: 'a user runs `requirements explore`',
    response: 'open a full-TTY keyboard-navigable browser over the traceability graph with live drill-down from any node into its incoming and outgoing links.',
  };

  readonly rationale = {
    claim: 'Textual compliance reports are optimal for CI but hostile for onboarding or exploratory analysis; an interactive TUI (lazygit-style) fills the discovery gap at near-zero UX cost.',
    kind: 'value-driven' as const,
    evidence: [
      { kind: 'precedent' as const, requirement: 'lazygit/lazydocker/k9s',
        rationale: 'TUI-first tools proved demand for interactive navigation in CLI-native workflows.' },
      { kind: 'expert-opinion' as const, expert: 'user-plan-discussion-2026-04-14', recordedAt: '2026-04-14' },
      { kind: 'study' as const, title: 'On the Navigation of Software Artifact Graphs',
        authors: 'Maletic, Marcus', year: 2001 },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const, describes: "An executable navigation scenario follows Requirement to Feature to AC to test. No historical screen recording is asserted.", binds: ["endToEndNavigatesReqToFeatToAcToTest"] },
    { kind: 'unit-test' as const,
      describes: 'explore TUI builds a correct graph from a small corpus',
      binds: ['traceExplorerBuildsGraph'] },
    { kind: 'unit-test' as const,
      describes: 'explore TUI handles arrow-key navigation without runtime errors on empty nodes',
      binds: ['traceExplorerHandlesArrowKeyNavigation'] },
    { kind: 'inspection' as const,
      checklist: [
        'keybindings match lazygit conventions (h/j/k/l + arrows)',
        '? opens a help overlay listing every binding',
      ],
      reviewers: ['maintainer'] },
  ];

  readonly verificationMethod = 'Demonstration' as const;

  readonly source = {
    type: 'stakeholder' as const,
    role: 'principle/discoverable-navigation',
    date: '2026-04-14',
  };

  readonly risk = {
    level: 'Low' as const,
    ifNotMet: 'Onboarding velocity suffers; new contributors resort to grep; documentation carries weight it should not.',
    mitigations: [
      'Provide a fallback `trace graph` command that emits the same data as static mermaid, so the feature degrades gracefully.',
    ],
  };
}
