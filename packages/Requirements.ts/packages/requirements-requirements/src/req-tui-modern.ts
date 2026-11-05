import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

export abstract class ReqTuiModernRequirement extends Requirement {
  readonly id = 'REQ-TUI-MODERN';
  readonly title = 'The CLI must use a modern TUI library — arrow-key navigation, colored output, spinners';
  readonly priority = Priority.Medium;
  readonly status = 'Approved' as const;
  readonly kind = 'NonFunctional' as const;

  readonly statement = {
    pattern: 'ubiquitous' as const,
    response: 'use @clack/prompts for all interactive prompts, routed through the Prompt port, with arrow-key navigation, colored output, spinners, and grouped multi-step flows.',
  };

  readonly rationale = {
    claim: 'A tool with dated UX will not be adopted by developers used to Astro/Nuxt-grade CLIs; aesthetics signal care.',
    kind: 'value-driven' as const,
    evidence: [
      { kind: 'precedent' as const, requirement: 'astro/nuxt/create-t3-app',
        rationale: 'Modern scaffolders universally adopted clack — sets the 2026 bar for DX.' },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const, describes: "Interactive inputs use the Prompt adapter; CLI and wizard cores do not import readline or the concrete prompt library.", binds: ["promptsStayBehindTheirPort"] },
    { kind: 'demonstration' as const, scenario: 'Screen recording of `feature new` wizard end-to-end.' },
  ];

  readonly verificationMethod = 'Inspection' as const;
  readonly source = { type: 'stakeholder' as const, role: 'user', date: '2026-04-14' };
  readonly risk = { level: 'Medium' as const, ifNotMet: 'Wizard feels dated; users default to hand-editing and the --replay flow never lands.' };
}
