import { Requirement, Priority } from '@frenchexdev2/requirements-core';
import type { DefaultStyleType } from '@frenchexdev2/requirements-styles';

/**
 * The ScenariiPlayer may delegate AC implementation to an AI via a pluggable
 * adapter port. The port is cleanly isolated from the rest of the player so
 * that `--no-ai` runs (deterministic stubs) remain the default, and so that
 * the Claude API implementation can be swapped for mock / other providers
 * under tests.
 */
export abstract class ReqAiAsImplementerAdapterRequirement extends Requirement<DefaultStyleType> {
  readonly id = 'REQ-AI-AS-IMPLEMENTER-ADAPTER';
  readonly title = 'AI implementation of ACs is a pluggable adapter with prompt caching and deterministic stub fallback';
  readonly priority = Priority.Medium;
  readonly status = 'Draft' as const;
  readonly kind = 'Functional' as const;

  readonly statement = {
    pattern: 'optional' as const,
    feature: 'When the player is invoked with `--ai`,',
    response: 'the PerAcFsm shall delegate AC implementation to an AiAdapter port; without `--ai`, it shall emit deterministic throw stubs and the project shall compile and its scaffolded tests fail with a clear "not yet implemented" message.',
  };

  readonly rationale = {
    claim: 'The player must be demonstrable without network access; AI assistance is a productivity boost, never a prerequisite.',
    kind: 'principle' as const,
    evidence: [
      { kind: 'expert-opinion' as const, expert: 'user-architecture-note-2026-04-14', recordedAt: '2026-04-14' },
      { kind: 'precedent' as const, requirement: 'REQ-PARALLEL-DELIVERABLE',
        rationale: 'Adapter boundaries are the project-wide answer for "swap impl, keep tests".' },
    ],
  };

  readonly fitCriteria = [
    { kind: 'inspection' as const,
      checklist: ['AiAdapter port type is defined in src/cli/scenario/ports.ts.',
                  'Claude API adapter lives in a separate file and implements prompt caching per the claude-api skill.',
                  'No direct `fetch` or `@anthropic-ai/sdk` import outside the adapter file.'],
      reviewers: ['maintainer'] },
    { kind: 'unit-test' as const,
      describes: 'the stub adapter returns a deterministic throw-stub AC body and never touches the network.',
      binds: ['stubAdapterReturnsDeterministicThrowStub', 'stubAdapterPerformsNoNetworkIo'] },
    { kind: 'quality-gate' as const, tool: 'rg',
      rule: '`rg "anthropic|fetch\\(" src/cli/scenario/ -g "!**/adapters/claude-*.ts"` must return zero matches.' },
    { kind: 'narrative' as const, text: 'Prompt caching is on by default when the Claude adapter is active.' },
  ];

  readonly verificationMethod = 'Inspection' as const;

  readonly source = { type: 'stakeholder' as const, role: 'maintainer', date: '2026-04-14' };

  readonly risk = {
    level: 'Medium' as const,
    ifNotMet: 'Player becomes coupled to a specific LLM vendor and un-runnable offline; tests break without an API key.',
  };
}
