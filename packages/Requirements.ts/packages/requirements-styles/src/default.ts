/**
 * DefaultStyle — the 29148 + Volere + EARS preset.
 *
 * 90% of projects use this as-is. The other 10% (legal, safety-critical,
 * domain-specific) fork the relevant sub-interface and drop a custom Style.
 *
 * This module contains only data + pure validators — no I/O, no side effects.
 */

import type {
  RequirementStyle,
  StyleVocabulary,
  StyleValidators,
  StyleTemplates,
  RequirementReporter,
  ValidationResult,
  RequirementTemplate,
} from '@frenchexdev2/requirements-core';

// ── Vocabulary ──────────────────────────────────────────────────────────────

export const DEFAULT_VOCABULARY = {
  requirementKinds: ['Functional', 'NonFunctional', 'Constraint', 'Compliance', 'UserStory'],

  statusWorkflow: {
    states: ['Draft', 'Approved', 'Implemented', 'Verified', 'Deprecated'],
    initial: 'Draft',
    transitions: [
      { from: 'Draft',       to: 'Approved' },
      { from: 'Approved',    to: 'Implemented' },
      { from: 'Implemented', to: 'Verified' },
      { from: 'Verified',    to: 'Deprecated' },
      { from: 'Approved',    to: 'Deprecated' },
      { from: 'Draft',       to: 'Deprecated' },
    ],
    terminal: ['Deprecated'],
  },

  riskTaxonomy: {
    levels: ['Critical', 'High', 'Medium', 'Low'],
  },

  verificationMethods: ['Test', 'Inspection', 'Analysis', 'Demonstration'],

  rationaleKinds: [
    'evidence-based',
    'principle',
    'value-driven',
    'regulatory-compliance',
    'risk-mitigation',
    'precedent',
  ],

  sourceKinds: [
    { kind: 'stakeholder',      label: 'Stakeholder',       slots: [
      { name: 'role', type: 'string',  required: true,  hint: 'e.g. product-team, ops, legal' },
      { name: 'date', type: 'iso-date', required: true },
    ]},
    { kind: 'regulation',       label: 'Regulation',         slots: [
      { name: 'jurisdiction', type: 'string', required: true, hint: 'EU, FR, US, …' },
      { name: 'act',          type: 'string', required: true, hint: 'GDPR, HIPAA, …' },
      { name: 'article',      type: 'string', required: false },
      { name: 'paragraph',    type: 'string', required: false },
    ]},
    { kind: 'standard',         label: 'Standard',           slots: [
      { name: 'org', type: 'string', required: true, hint: 'ISO, IEEE, W3C, NIST' },
      { name: 'id',  type: 'string', required: true, hint: 'e.g. 29148:2018' },
      { name: 'section', type: 'string', required: false },
    ]},
    { kind: 'contract',         label: 'Contract / SLA',     slots: [
      { name: 'doc',    type: 'string', required: true },
      { name: 'clause', type: 'string', required: false },
    ]},
    { kind: 'risk',             label: 'Risk register',      slots: [
      { name: 'registerEntry', type: 'string', required: true },
      { name: 'severity',      type: 'string', required: true },
    ]},
    { kind: 'business-goal',    label: 'Business goal / OKR', slots: [
      { name: 'okrId',  type: 'string', required: true },
      { name: 'period', type: 'string', required: true, hint: '2026-Q1' },
    ]},
    { kind: 'incident',         label: 'Incident / postmortem', slots: [
      { name: 'incidentId',    type: 'string',   required: true },
      { name: 'date',          type: 'iso-date', required: true },
      { name: 'postmortemUrl', type: 'url',      required: false },
    ]},
    { kind: 'domain-knowledge', label: 'Domain knowledge',   slots: [
      { name: 'reference', type: 'string', required: true },
    ]},
  ],

  // EARS (Mavin et al., Rolls-Royce, IEEE RE'09). Five canonical patterns + natural fallback.
  statementPatterns: [
    { pattern: 'ubiquitous',   label: 'Ubiquitous',   template: 'The system shall {response}.',
      slots: [ { name: 'response', required: true, hint: 'what the system does' } ] },
    { pattern: 'event-driven', label: 'Event-driven', template: 'When {trigger}, the system shall {response}.',
      slots: [
        { name: 'trigger',  required: true, hint: 'the triggering event' },
        { name: 'response', required: true, hint: 'what the system does in response' },
      ] },
    { pattern: 'state-driven', label: 'State-driven', template: 'While {state}, the system shall {response}.',
      slots: [
        { name: 'state',    required: true },
        { name: 'response', required: true },
      ] },
    { pattern: 'optional',     label: 'Optional feature', template: 'Where {feature}, the system shall {response}.',
      slots: [
        { name: 'feature',  required: true },
        { name: 'response', required: true },
      ] },
    { pattern: 'unwanted',     label: 'Unwanted behaviour', template: 'If {trigger}, then the system shall {response}.',
      slots: [
        { name: 'trigger',  required: true },
        { name: 'response', required: true },
      ] },
    { pattern: 'natural',      label: 'Natural (fallback — generates warning)', template: '{text}',
      slots: [ { name: 'text', required: true } ] },
  ],
} as const satisfies StyleVocabulary;

// ── Validators (pure) ───────────────────────────────────────────────────────

function ok(): ValidationResult { return { ok: true, errors: [] }; }
function err(path: string, message: string): ValidationResult {
  return { ok: false, errors: [{ path, message }] };
}

export const DEFAULT_VALIDATORS: StyleValidators = {
  validateStatement(statement: unknown): ValidationResult {
    if (!statement || typeof statement !== 'object') return err('statement', 'must be an object');
    const s = statement as Record<string, unknown>;
    const patterns = DEFAULT_VOCABULARY.statementPatterns;
    const schema = patterns.find(p => p.pattern === s.pattern);
    if (!schema) return err('statement.pattern', `unknown pattern '${String(s.pattern)}' — expected one of ${patterns.map(p => p.pattern).join(', ')}`);
    for (const slot of schema.slots) {
      if (slot.required && (typeof s[slot.name] !== 'string' || (s[slot.name] as string).length === 0)) {
        return err(`statement.${slot.name}`, `required slot missing for pattern '${schema.pattern}'`);
      }
    }
    return ok();
  },

  validateSpec(spec: unknown): ValidationResult {
    if (!spec || typeof spec !== 'object') return err('', 'spec must be an object');
    const s = spec as Record<string, unknown>;
    const errors: { path: string; message: string }[] = [];

    if (typeof s.id !== 'string')           errors.push({ path: 'id', message: 'required string' });
    if (typeof s.title !== 'string')        errors.push({ path: 'title', message: 'required string' });
    if (typeof s.priority !== 'string')     errors.push({ path: 'priority', message: 'required string' });

    if (s.kind === 'requirement') {
      if (!(DEFAULT_VOCABULARY.requirementKinds as readonly string[]).includes(s.requirementKind as string)) {
        errors.push({ path: 'requirementKind', message: `expected one of ${DEFAULT_VOCABULARY.requirementKinds.join(', ')}` });
      }
      if (!(DEFAULT_VOCABULARY.statusWorkflow.states as readonly string[]).includes(s.status as string)) {
        errors.push({ path: 'status', message: `expected one of ${DEFAULT_VOCABULARY.statusWorkflow.states.join(', ')}` });
      }
      const stmtCheck = this.validateStatement(s.statement);
      if (!stmtCheck.ok) errors.push(...stmtCheck.errors);
    }

    return errors.length === 0 ? ok() : { ok: false, errors };
  },
};

// ── Templates ───────────────────────────────────────────────────────────────

const DEFAULT_TEMPLATE_LIST: readonly RequirementTemplate[] = [
  {
    id: 'ears-ubiquitous',
    label: 'EARS Ubiquitous — "The system shall …"',
    description: 'For always-active functional requirements.',
    skeleton: {
      kind: 'Functional',
      statementPattern: 'ubiquitous',
      priority: 'Medium',
      defaultFitCriterionKinds: ['unit-test'],
      rationaleKind: 'principle',
      verificationMethod: 'Test',
    },
  },
  {
    id: 'ears-event-driven',
    label: 'EARS Event-driven — "When X, the system shall …"',
    description: 'For behaviours triggered by discrete events.',
    skeleton: {
      kind: 'Functional',
      statementPattern: 'event-driven',
      priority: 'High',
      defaultFitCriterionKinds: ['unit-test', 'demonstration'],
      rationaleKind: 'evidence-based',
      verificationMethod: 'Test',
    },
  },
  {
    id: 'compliance-regulation',
    label: 'Compliance — regulation',
    description: 'For requirements mandated by law / sectoral regulation.',
    skeleton: {
      kind: 'Compliance',
      statementPattern: 'ubiquitous',
      priority: 'Critical',
      defaultFitCriterionKinds: ['inspection', 'quality-gate'],
      rationaleKind: 'regulatory-compliance',
      verificationMethod: 'Inspection',
    },
  },
  {
    id: 'non-functional-performance',
    label: 'Non-functional — performance metric',
    description: 'Latency / throughput / availability SLO.',
    skeleton: {
      kind: 'NonFunctional',
      statementPattern: 'state-driven',
      priority: 'High',
      defaultFitCriterionKinds: ['metric'],
      rationaleKind: 'evidence-based',
      verificationMethod: 'Analysis',
    },
  },
];

export const DEFAULT_TEMPLATES: StyleTemplates = {
  templates: DEFAULT_TEMPLATE_LIST,
  findTemplate(id: string): RequirementTemplate | undefined {
    return DEFAULT_TEMPLATE_LIST.find(t => t.id === id);
  },
};

// ── Reporter (minimal — renders EARS patterns using the template) ──────────

export const DEFAULT_REPORTER: RequirementReporter = {
  renderStatement(statement: unknown): string {
    if (!statement || typeof statement !== 'object') return '';
    const s = statement as Record<string, string>;
    const schema = DEFAULT_VOCABULARY.statementPatterns.find(p => p.pattern === s.pattern);
    if (!schema) return JSON.stringify(statement);
    let out: string = schema.template;
    for (const slot of schema.slots) out = out.replace(`{${slot.name}}`, s[slot.name] ?? '…');
    return out;
  },

  renderRequirement(spec: unknown): string {
    if (!spec || typeof spec !== 'object') return '';
    const s = spec as Record<string, unknown>;
    const lines: string[] = [];
    lines.push(`${s.id}  ${s.title}`);
    lines.push(`  priority: ${s.priority}  status: ${s.status}  kind: ${s.requirementKind}`);
    lines.push(`  statement: ${this.renderStatement(s.statement)}`);
    return lines.join('\n');
  },

  renderMarkdown(spec: unknown): string {
    if (!spec || typeof spec !== 'object') return '';
    const s = spec as Record<string, unknown>;
    const lines: string[] = [];
    lines.push(`# ${s.id} — ${s.title}`);
    lines.push('');
    lines.push(`**Kind**: ${s.requirementKind} · **Priority**: ${s.priority} · **Status**: ${s.status}`);
    lines.push('');
    lines.push(`> ${this.renderStatement(s.statement)}`);
    return lines.join('\n');
  },
};

// ── The style itself ────────────────────────────────────────────────────────

export const DefaultStyle = {
  id: '@frenchexdev2/requirements/styles/default',
  version: '1.0.0',
  vocabulary: DEFAULT_VOCABULARY,
  validators: DEFAULT_VALIDATORS,
  templates: DEFAULT_TEMPLATES,
  reporter: DEFAULT_REPORTER,
  fitCriterionAdapters: [],        // Stream E plugs unit-test + coverage-threshold adapters here
} as const satisfies RequirementStyle;

export type DefaultStyleType = typeof DefaultStyle;
