import { Requirement, Priority } from '@frenchexdev2/requirements-shared-kernel';

/**
 * REQ-SCAFFOLD-EXTENSIBILITY — Test scaffolding covers every TestLevel and
 * is pluggable for project-specific levels.
 */
export abstract class ReqScaffoldExtensibilityRequirement extends Requirement {
  readonly id = 'REQ-SCAFFOLD-EXTENSIBILITY';
  readonly title = 'Test scaffolding must cover every TestLevel (Unit, Functional, E2E, A11y, Visual, Performance) via a pluggable registry';
  readonly priority = Priority.High;
  readonly status = 'Approved' as const;
  readonly kind = 'NonFunctional' as const;

  readonly statement = {
    pattern: 'ubiquitous' as const,
    response: 'provide one TestScaffolder per TestLevel via a registry that projects can extend by registering custom scaffolders (e.g. load-test, security-scan) without forking the package.',
  };

  readonly rationale = {
    claim: 'Hard-coding only `unit` and `e2e` scaffolders ignores half the TestLevel enum; projects should not have to hand-author a11y / visual / perf harnesses.',
    kind: 'principle' as const,
    evidence: [
      { kind: 'precedent' as const, requirement: 'TestLevel enum',
        rationale: 'The DSL already declares 6 test levels — scaffolding must follow.' },
    ],
  };

  readonly fitCriteria = [
    { kind: 'unit-test' as const, describes: 'registry returns a scaffolder for every built-in TestLevel',
      binds: ['registryCoversEveryBuiltInTestLevel'] },
    { kind: 'unit-test' as const, describes: 'each built-in scaffolder emits @FeatureTest/@Verifies code, never describe/it',
      binds: ['scaffolderOutputUsesFeatureTestVerifiesOnly'] },
    { kind: 'unit-test' as const, describes: 'projects can register a custom scaffolder that becomes the default for its level',
      binds: ['registerScaffolderOverridesDefault'] },
    { kind: 'unit-test' as const, describes: '`planWrites` enumerates scaffold paths based on each AC\'s @Expects + registered scaffolders',
      binds: ['planWritesEnumeratesAllExpectedLevels'] },
  ];

  readonly verificationMethod = 'Test' as const;
  readonly source = { type: 'stakeholder' as const, role: 'user-conversation-scaffold-extensibility', date: '2026-04-14' };
  readonly risk = {
    level: 'Medium' as const,
    ifNotMet: 'Users hand-write a11y/visual/perf test scaffolds themselves; the DSL looks incomplete; adoption stalls for projects with strict quality gates.',
  };
}
