/**
 * Shared FixtureStyle for Style-contract tests.
 *
 * Declared `as const satisfies RequirementStyle` so:
 *   - the type parameters of KindsOf<typeof FixtureStyle>, StatusesOf<...>, etc.
 *     narrow to string-literal unions (compile-time narrowing contract)
 *   - the five Style ports are realistic enough for runtime ACs to assert
 *     the *contract shape* without dragging in a full preset.
 *
 * This file is NOT picked up by vitest (no `.test.ts` suffix) — it is a
 * test-only helper imported by style-*.test.ts files.
 */

import type { RequirementStyle } from '@frenchexdev2/requirements-core';

export const FixtureStyle = {
  id: 'test/fixture',
  version: '0.0.0',

  vocabulary: {
    requirementKinds: ['Functional', 'NonFunctional'],
    statusWorkflow: {
      states: ['Draft', 'Approved', 'Archived'],
      initial: 'Draft',
      transitions: [
        { from: 'Draft', to: 'Approved' },
        { from: 'Approved', to: 'Archived' },
      ],
      terminal: ['Archived'],
    },
    riskTaxonomy: {
      levels: ['Low', 'Medium', 'High', 'Critical'],
    },
    verificationMethods: ['Test', 'Inspection', 'Analysis', 'Demonstration'],
    rationaleKinds: ['principle', 'evidence-based'],
    sourceKinds: [
      {
        kind: 'stakeholder',
        label: 'Stakeholder',
        slots: [
          { name: 'role', type: 'string', required: true },
          { name: 'date', type: 'iso-date', required: true },
        ],
      },
    ],
    statementPatterns: [
      {
        pattern: 'ubiquitous',
        label: 'Ubiquitous',
        slots: [{ name: 'response', required: true }],
        template: 'The system shall {response}.',
      },
      {
        pattern: 'event-driven',
        label: 'Event-driven',
        slots: [
          { name: 'trigger', required: true },
          { name: 'response', required: true },
        ],
        template: 'When {trigger}, the system shall {response}.',
      },
    ],
  },

  validators: {
    validateStatement(statement: unknown) {
      if (typeof statement !== 'object' || statement === null) {
        return { ok: false, errors: [{ path: '', message: 'statement must be an object' }] };
      }
      const s = statement as { pattern?: unknown; response?: unknown; trigger?: unknown };
      if (typeof s.pattern !== 'string') {
        return { ok: false, errors: [{ path: 'pattern', message: 'pattern is required' }] };
      }
      if (s.pattern === 'ubiquitous' && typeof s.response !== 'string') {
        return { ok: false, errors: [{ path: 'response', message: 'response is required' }] };
      }
      if (s.pattern === 'event-driven' && (typeof s.trigger !== 'string' || typeof s.response !== 'string')) {
        return { ok: false, errors: [{ path: 'trigger|response', message: 'both are required' }] };
      }
      if (s.pattern !== 'ubiquitous' && s.pattern !== 'event-driven') {
        return { ok: false, errors: [{ path: 'pattern', message: `unknown pattern: ${s.pattern}` }] };
      }
      return { ok: true, errors: [] };
    },
    validateSpec(spec: unknown) {
      if (typeof spec !== 'object' || spec === null) {
        return { ok: false, errors: [{ path: '', message: 'spec must be an object' }] };
      }
      const s = spec as Record<string, unknown>;
      if (typeof s.id !== 'string' || typeof s.title !== 'string') {
        return { ok: false, errors: [{ path: 'id|title', message: 'id and title are required' }] };
      }
      return { ok: true, errors: [] };
    },
  },

  templates: {
    templates: [
      {
        id: 'basic-functional',
        label: 'Basic Functional',
        description: 'A minimal functional requirement skeleton.',
        skeleton: {
          kind: 'Functional',
          statementPattern: 'ubiquitous',
          priority: 'Medium',
          verificationMethod: 'Test',
          rationaleKind: 'principle',
        },
      },
    ],
    findTemplate(id: string) {
      return this.templates.find((t) => t.id === id);
    },
  },

  reporter: {
    renderStatement(statement: unknown) {
      if (typeof statement !== 'object' || statement === null) return '';
      const s = statement as { pattern?: string; response?: string; trigger?: string };
      if (s.pattern === 'ubiquitous') return `The system shall ${s.response ?? '…'}.`;
      if (s.pattern === 'event-driven') return `When ${s.trigger ?? '…'}, the system shall ${s.response ?? '…'}.`;
      return JSON.stringify(statement);
    },
    renderRequirement(spec: unknown) {
      if (typeof spec !== 'object' || spec === null) return '';
      const s = spec as { id?: string; title?: string };
      return `[${s.id ?? '?'}] ${s.title ?? ''}`;
    },
    renderMarkdown(spec: unknown) {
      if (typeof spec !== 'object' || spec === null) return '';
      const s = spec as { id?: string; title?: string };
      return `# ${s.title ?? ''}\n\n**ID:** ${s.id ?? '?'}\n`;
    },
  },

  fitCriterionAdapters: [],
} as const satisfies RequirementStyle;

export type FixtureStyleType = typeof FixtureStyle;
