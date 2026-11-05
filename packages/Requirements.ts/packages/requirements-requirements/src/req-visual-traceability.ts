import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

/** Tier-2 roadmap. */
export abstract class ReqVisualTraceabilityRequirement extends Requirement {
  readonly id = 'REQ-VISUAL-TRACEABILITY';
  readonly title = 'The traceability chain must be viewable as a diagram, not just textual gap reports';
  readonly priority = Priority.Medium;
  readonly status = 'Draft' as const;
  readonly kind = 'NonFunctional' as const;

  readonly statement = {
    pattern: 'event-driven' as const,
    trigger: 'a user runs `requirements trace graph --format mermaid`',
    response: 'emit a Mermaid diagram showing Requirement → Feature → AC → Test with coverage state per node and disabled-feature styling.',
  };

  readonly rationale = {
    claim: 'Stakeholders outside engineering read diagrams, not prose gap reports; visible traceability is a stakeholder-communication tool, not just a compliance artefact.',
    kind: 'value-driven' as const,
    evidence: [
      { kind: 'expert-opinion' as const, expert: 'user-plan-discussion-2026-04-14', recordedAt: '2026-04-14' },
      { kind: 'precedent' as const, requirement: 'SysML-BDD/IBD',
        rationale: 'SysML has always rendered traceability as diagrams because text-only matrices do not scale beyond ~20 rows.' },
      { kind: 'study' as const, title: 'Software Requirements Visualisation: A Systematic Mapping Study',
        authors: 'Abad, Ruhe', year: 2016 },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const,
      describes: 'trace graph emits valid mermaid syntax for a small corpus',
      binds: ['traceGraphEmitsMermaidFlowchart'] },
    { kind: 'unit-test' as const,
      describes: 'disabled features render with distinct styling in mermaid output',
      binds: ['traceGraphHighlightsDisabledFeatures'] },
    { kind: 'unit-test' as const,
      describes: 'covered vs uncovered ACs carry distinct node classes',
      binds: ['traceGraphDistinguishesCoveredFromUncoveredAcs'] },
    { kind: 'inspection' as const,
      checklist: [
        'rendered diagram is legible for a 5-feature project',
        'disabled features appear with distinct styling',
        'node click-targets include the REQ/FEAT id so markdown readers can anchor-link',
      ],
      reviewers: ['maintainer'] },
    { kind: 'demonstration' as const,
      scenario: 'Rendered mermaid diagram of the @frenchexdev2/requirements self-feature graph embedded in README.' },
  ];

  readonly verificationMethod = 'Test' as const;

  readonly source = {
    type: 'stakeholder' as const,
    role: 'principle/visual-communication',
    date: '2026-04-14',
  };

  readonly risk = {
    level: 'Medium' as const,
    ifNotMet: 'Traceability stays an engineering-internal artefact; product/design stakeholders do not engage; requirements-ownership drifts back to engineering alone.',
    mitigations: [
      'Publish the generated diagram in the package README so stakeholders see it even without running the CLI.',
      'Keep the mermaid backend pluggable so Graphviz/PlantUML can be added later.',
    ],
  };
}
