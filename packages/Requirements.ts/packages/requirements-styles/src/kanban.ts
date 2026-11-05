/**
 * KanbanStyle — flow-driven requirements ontology.
 *
 * Lineage: David J. Anderson *Kanban* (2010), Goldratt (Theory of Constraints),
 * Deming (flow principles), Little's Law (WIP = Throughput × LeadTime), Classes of
 * Service (Anderson), Cumulative Flow Diagrams, Service Level Expectations (SLEs).
 *
 * Central artifact: the Class of Service. Work is pulled, not pushed; the unit of
 * decision is the cost-of-delay curve, not the story-point estimate. Policies are
 * explicit; change is evolutionary.
 *
 * Pure data + pure functions — no I/O.
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

export const KANBAN_VOCABULARY: StyleVocabulary = {
  // Anderson's Classes of Service (+ two common extensions: Defect, LifeCycleReset)
  requirementKinds: [
    'Standard',          // FIFO / cost-of-delay curve
    'Expedite',          // drop everything, one in flight max
    'FixedDate',         // hard deadline, penalty if missed
    'Intangible',        // no immediate cost of delay, but matters long-term
    'LifeCycleReset',    // work that resets a cadence / refresh cycle
    'Defect',            // production defect pulled back into flow
  ],

  // Flow-oriented columns. WIP limits are a separate operational concern, not modelled here.
  // Rework loops encode escaped-defect reality: Testing → Development, Ready → Development.
  statusWorkflow: {
    states: [
      'Backlog',
      'Selected',
      'Analysis',
      'Development',
      'Testing',
      'Ready',
      'Deployed',
      'Observed',
      'Archived',
    ],
    initial: 'Backlog',
    transitions: [
      { from: 'Backlog',     to: 'Selected' },
      { from: 'Selected',    to: 'Analysis' },
      { from: 'Analysis',    to: 'Development' },
      { from: 'Development', to: 'Testing' },
      { from: 'Testing',     to: 'Ready' },
      { from: 'Ready',       to: 'Deployed' },
      { from: 'Deployed',    to: 'Observed' },
      { from: 'Observed',    to: 'Archived' },
      // Rework loops
      { from: 'Testing',     to: 'Development' },
      { from: 'Ready',       to: 'Development' },  // escaped defect caught pre-deploy
      // Pull-back to backlog from early columns
      { from: 'Selected',    to: 'Backlog' },
      { from: 'Analysis',    to: 'Backlog' },
    ],
    terminal: ['Archived'],
  },

  // In Kanban, "risk" encodes the cost-of-delay curve shape, not a SIL level.
  riskTaxonomy: {
    levels: [
      'DelayHarmUrgent',      // steep curve — expedite territory
      'DelayHarmFixedDate',   // step-function at the deadline
      'DelayHarmLinear',      // standard cost-of-delay
      'DelayHarmIntangible',  // flat short-term, rising long-term
      'DelayHarmMinimal',     // near-zero cost of delay
    ],
    matrix: {
      axes: {
        likelihood: ['Imminent', 'Soon', 'Eventual', 'Unlikely'],
        impact:     ['Severe', 'Moderate', 'Mild', 'None'],
      },
      cells: [
        { likelihood: 'Imminent', impact: 'Severe',   level: 'DelayHarmUrgent' },
        { likelihood: 'Imminent', impact: 'Moderate', level: 'DelayHarmLinear' },
        { likelihood: 'Soon',     impact: 'Severe',   level: 'DelayHarmFixedDate' },
        { likelihood: 'Soon',     impact: 'Moderate', level: 'DelayHarmLinear' },
        { likelihood: 'Eventual', impact: 'Moderate', level: 'DelayHarmIntangible' },
        { likelihood: 'Eventual', impact: 'Mild',     level: 'DelayHarmIntangible' },
        { likelihood: 'Unlikely', impact: 'Mild',     level: 'DelayHarmMinimal' },
        { likelihood: 'Unlikely', impact: 'None',     level: 'DelayHarmMinimal' },
      ],
    },
  },

  // Verification in Kanban = flow-based evidence, not a test report alone.
  verificationMethods: [
    'LeadTimeWithinSLE',       // p85 lead time ≤ SLE
    'DeployedToProduction',    // reached Deployed column
    'ObservedInProduction',    // post-deploy telemetry confirms behaviour
    'BlockerCleared',          // expedite: the blocker is gone
    'SlaMet',                  // customer SLA target hit
    'FlowMetricGreen',         // WIP / age / throughput within policy
    'CumulativeFlowHealthy',   // CFD bands are parallel, no growing queues
  ],

  rationaleKinds: [
    'cost-of-delay',
    'sla-commitment',
    'blocking-other-work',
    'customer-commitment',
    'technical-dependency',
    'flow-impediment',
    'cumulative-flow-signal',
    'lead-time-trend',
  ],

  sourceKinds: [
    { kind: 'flow-metric', label: 'Flow metric', slots: [
      { name: 'metric', type: 'string',   required: true, hint: 'leadTime / throughput / wip / age' },
      { name: 'value',  type: 'number',   required: true },
      { name: 'window', type: 'string',   required: true, hint: 'e.g. last 30 days' },
    ]},
    { kind: 'cumulative-flow-diagram', label: 'Cumulative Flow Diagram', slots: [
      { name: 'date',         type: 'iso-date', required: true },
      { name: 'capturedUrl',  type: 'url',      required: false },
      { name: 'anomaly',      type: 'string',   required: false, hint: 'e.g. Development band widening' },
    ]},
    { kind: 'lead-time-distribution', label: 'Lead-time distribution', slots: [
      { name: 'percentile', type: 'string',   required: true, hint: 'p50 / p85 / p95' },
      { name: 'value',      type: 'number',   required: true, hint: 'days' },
      { name: 'capturedAt', type: 'iso-date', required: true },
    ]},
    { kind: 'customer-sla', label: 'Customer SLA', slots: [
      { name: 'customer', type: 'string',   required: true },
      { name: 'sla',      type: 'string',   required: true, hint: 'e.g. 95% ≤ 5 business days' },
      { name: 'agreedAt', type: 'iso-date', required: true },
    ]},
    { kind: 'blocked-ticket-report', label: 'Blocked ticket report', slots: [
      { name: 'blockedTicketId', type: 'string',   required: true },
      { name: 'blockingReason',  type: 'string',   required: true },
      { name: 'date',            type: 'iso-date', required: true },
    ]},
    { kind: 'service-request', label: 'Service request', slots: [
      { name: 'requester', type: 'string',   required: true },
      { name: 'channel',   type: 'string',   required: true, hint: 'e.g. intake board, email, incident' },
      { name: 'date',      type: 'iso-date', required: true },
    ]},
    { kind: 'operational-review', label: 'Operational review', slots: [
      { name: 'date',        type: 'iso-date', required: true },
      { name: 'facilitator', type: 'string',   required: true },
    ]},
    { kind: 'ops-incident', label: 'Ops incident', slots: [
      { name: 'incidentId', type: 'string',   required: true },
      { name: 'severity',   type: 'string',   required: true, hint: 'SEV1 / SEV2 / SEV3' },
      { name: 'date',       type: 'iso-date', required: true },
    ]},
  ],

  // Statement patterns mirror Anderson's Classes of Service + SLA definition.
  statementPatterns: [
    { pattern: 'service-request',
      label: 'Service request (Standard)',
      template: 'Deliverable: {outcome}. Customer: {customer}. Done when: {doneWhen}. Class of service: {cos}.',
      slots: [
        { name: 'outcome',  required: true },
        { name: 'customer', required: true },
        { name: 'doneWhen', required: true },
        { name: 'cos',      required: true, hint: 'Standard / Expedite / FixedDate / Intangible' },
      ] },

    { pattern: 'fixed-date-commitment',
      label: 'Fixed-date commitment',
      template: 'By {deadline}, the system shall {deliverable}. Penalty if missed: {penalty}.',
      slots: [
        { name: 'deadline',    required: true, hint: 'ISO date or event' },
        { name: 'deliverable', required: true },
        { name: 'penalty',     required: true, hint: 'contractual / reputational / regulatory' },
      ] },

    { pattern: 'expedite-pull',
      label: 'Expedite pull (one in flight)',
      template: 'Expedite pull: {work}. Blocking: {blocking}. Cost of delay: {cod}.',
      slots: [
        { name: 'work',     required: true },
        { name: 'blocking', required: true, hint: 'what other flow this is blocking' },
        { name: 'cod',      required: true, hint: 'quantified cost of delay — €/day, SLA breach, …' },
      ] },

    { pattern: 'intangible-investment',
      label: 'Intangible investment (with promotion threshold)',
      template: 'Intangible work: {work}. Long-term benefit: {benefit}. Threshold for surfacing as Standard: {threshold}.',
      slots: [
        { name: 'work',      required: true },
        { name: 'benefit',   required: true },
        { name: 'threshold', required: true, hint: 'Anderson: intangibles must carry a promotion rule' },
      ] },

    { pattern: 'defect-pull',
      label: 'Defect pull (lifecycle reset)',
      template: 'Defect in {area}: {symptom}. Detected by {detection}. Reset lifecycle: {reset}.',
      slots: [
        { name: 'area',      required: true },
        { name: 'symptom',   required: true },
        { name: 'detection', required: true, hint: 'monitoring / customer / internal' },
        { name: 'reset',     required: true, hint: 'which columns the work re-enters' },
      ] },

    { pattern: 'sla-commitment',
      label: 'SLA / Service Level Expectation',
      template: 'Service: {service}. Lead-time SLE: {p85} at 85th percentile. Class of service: {cos}.',
      slots: [
        { name: 'service', required: true },
        { name: 'p85',     required: true, hint: 'e.g. 5 business days' },
        { name: 'cos',     required: true },
      ] },

    { pattern: 'natural',
      label: 'Natural language (fallback — generates warning)',
      template: '{text}',
      slots: [ { name: 'text', required: true } ] },
  ],
};

// ── Validators ──────────────────────────────────────────────────────────────

function ok(): ValidationResult { return { ok: true, errors: [] }; }

export const KANBAN_VALIDATORS: StyleValidators = {
  validateStatement(statement: unknown): ValidationResult {
    if (!statement || typeof statement !== 'object') return { ok: false, errors: [{ path: 'statement', message: 'must be an object' }] };
    const s = statement as Record<string, unknown>;
    const schema = KANBAN_VOCABULARY.statementPatterns.find(p => p.pattern === s.pattern);
    if (!schema) return { ok: false, errors: [{ path: 'statement.pattern', message: `unknown pattern '${String(s.pattern)}'` }] };
    const errors = schema.slots
      .filter(slot => slot.required && (typeof s[slot.name] !== 'string' || (s[slot.name] as string).length === 0))
      .map(slot => ({ path: `statement.${slot.name}`, message: `required slot missing for pattern '${schema.pattern}'` }));
    return errors.length === 0 ? ok() : { ok: false, errors };
  },

  validateSpec(spec: unknown): ValidationResult {
    if (!spec || typeof spec !== 'object') return { ok: false, errors: [{ path: '', message: 'spec must be an object' }] };
    const s = spec as Record<string, unknown>;
    const errors: { path: string; message: string }[] = [];

    if (s.kind === 'requirement') {
      if (!KANBAN_VOCABULARY.requirementKinds.includes(s.requirementKind as string)) {
        errors.push({ path: 'requirementKind', message: `expected one of ${KANBAN_VOCABULARY.requirementKinds.join(', ')}` });
      }
      if (!KANBAN_VOCABULARY.statusWorkflow.states.includes(s.status as string)) {
        errors.push({ path: 'status', message: 'status must be a KanbanStyle column' });
      }

      const statement = s.statement as Record<string, unknown> | undefined;

      // DISCIPLINE: Expedite class requires expedite-pull pattern with a quantified Cost of Delay.
      if (s.requirementKind === 'Expedite') {
        if (statement?.pattern !== 'expedite-pull') {
          errors.push({ path: 'statement.pattern', message: "Expedite kind requires statement.pattern 'expedite-pull'" });
        } else if (typeof statement.cod !== 'string' || (statement.cod as string).length === 0) {
          errors.push({ path: 'statement.cod', message: 'Expedite kind requires a non-empty cost-of-delay (cod) slot' });
        }
      }

      // DISCIPLINE: FixedDate class requires fixed-date-commitment with non-empty deadline.
      if (s.requirementKind === 'FixedDate') {
        if (statement?.pattern !== 'fixed-date-commitment') {
          errors.push({ path: 'statement.pattern', message: "FixedDate kind requires statement.pattern 'fixed-date-commitment'" });
        } else if (typeof statement.deadline !== 'string' || (statement.deadline as string).length === 0) {
          errors.push({ path: 'statement.deadline', message: 'FixedDate kind requires a non-empty deadline slot' });
        }
      }

      // DISCIPLINE (Anderson): Intangibles must carry an explicit promotion threshold.
      if (s.requirementKind === 'Intangible') {
        if (statement?.pattern !== 'intangible-investment') {
          errors.push({ path: 'statement.pattern', message: "Intangible kind requires statement.pattern 'intangible-investment'" });
        } else if (typeof statement.threshold !== 'string' || (statement.threshold as string).length === 0) {
          errors.push({ path: 'statement.threshold', message: 'Intangible kind requires an explicit promotion threshold (Anderson rule)' });
        }
      }

      // FLOW DISCIPLINE: Standard work should be decided from flow evidence, not opinion.
      // Emitted as an error to enforce; downgrade to warning at a higher layer if desired.
      if (s.requirementKind === 'Standard') {
        const source = s.source as Record<string, unknown> | undefined;
        const t = source?.type as string | undefined;
        const flowSources = ['flow-metric', 'cumulative-flow-diagram', 'lead-time-distribution', 'customer-sla'];
        if (!t || !flowSources.includes(t)) {
          errors.push({ path: 'source.type', message: `Standard kind should cite a flow-driven source (${flowSources.join(', ')})` });
        }
      }

      const stmt = this.validateStatement(s.statement);
      if (!stmt.ok) errors.push(...stmt.errors);
    }

    return errors.length === 0 ? ok() : { ok: false, errors };
  },
};

// ── Templates ───────────────────────────────────────────────────────────────

const KANBAN_TEMPLATE_LIST: readonly RequirementTemplate[] = [
  {
    id: 'service-request-standard',
    label: 'Service request (Standard class)',
    description: 'FIFO / cost-of-delay work pulled from the intake board.',
    skeleton: {
      kind: 'Standard',
      statementPattern: 'service-request',
      priority: 'Medium',
      defaultFitCriterionKinds: ['unit-test'],
      rationaleKind: 'cost-of-delay',
      verificationMethod: 'LeadTimeWithinSLE',
    },
  },
  {
    id: 'expedite-pull',
    label: 'Expedite pull (one-in-flight)',
    description: 'Drop-everything work — usually unblocks a customer / incident.',
    skeleton: {
      kind: 'Expedite',
      statementPattern: 'expedite-pull',
      priority: 'Critical',
      defaultFitCriterionKinds: ['demonstration'],
      rationaleKind: 'blocking-other-work',
      verificationMethod: 'BlockerCleared',
    },
  },
  {
    id: 'fixed-date-delivery',
    label: 'Fixed-date delivery',
    description: 'Hard deadline with a quantified penalty if missed.',
    skeleton: {
      kind: 'FixedDate',
      statementPattern: 'fixed-date-commitment',
      priority: 'High',
      defaultFitCriterionKinds: ['quality-gate'],
      rationaleKind: 'customer-commitment',
      verificationMethod: 'SlaMet',
    },
  },
  {
    id: 'intangible-improvement',
    label: 'Intangible improvement (with promotion threshold)',
    description: 'Flat short-term cost of delay; promotion rule makes it explicit.',
    skeleton: {
      kind: 'Intangible',
      statementPattern: 'intangible-investment',
      priority: 'Low',
      defaultFitCriterionKinds: ['metric'],
      rationaleKind: 'lead-time-trend',
      verificationMethod: 'FlowMetricGreen',
    },
  },
  {
    id: 'defect-reset',
    label: 'Defect pull (lifecycle reset)',
    description: 'Production defect pulled back into flow; re-enters earlier columns.',
    skeleton: {
      kind: 'Defect',
      statementPattern: 'defect-pull',
      priority: 'High',
      defaultFitCriterionKinds: ['unit-test', 'demonstration'],
      rationaleKind: 'flow-impediment',
      verificationMethod: 'DeployedToProduction',
    },
  },
  {
    id: 'sla-definition',
    label: 'SLA / SLE definition',
    description: 'Service-level expectation at the 85th percentile of lead time.',
    skeleton: {
      kind: 'Standard',
      statementPattern: 'sla-commitment',
      priority: 'High',
      defaultFitCriterionKinds: ['metric'],
      rationaleKind: 'sla-commitment',
      verificationMethod: 'LeadTimeWithinSLE',
    },
  },
];

export const KANBAN_TEMPLATES: StyleTemplates = {
  templates: KANBAN_TEMPLATE_LIST,
  findTemplate(id: string) {
    return KANBAN_TEMPLATE_LIST.find(t => t.id === id);
  },
};

// ── Reporter — Kanban ticket-card Markdown ──────────────────────────────────

export const KANBAN_REPORTER: RequirementReporter = {
  renderStatement(statement: unknown): string {
    if (!statement || typeof statement !== 'object') return '';
    const s = statement as Record<string, string>;
    const schema = KANBAN_VOCABULARY.statementPatterns.find(p => p.pattern === s.pattern);
    if (!schema) return JSON.stringify(statement);
    let out = schema.template;
    for (const slot of schema.slots) out = out.replace(`{${slot.name}}`, s[slot.name] ?? '…');
    return out;
  },

  renderRequirement(spec: unknown): string {
    if (!spec || typeof spec !== 'object') return '';
    const s = spec as Record<string, unknown>;
    const lines: string[] = [];
    lines.push(`[${s.requirementKind}] ${s.id}  ${s.title}`);
    lines.push(`  column: ${s.status}    priority: ${s.priority}`);
    lines.push(`  verification: ${s.verificationMethod}`);
    lines.push(`  statement: ${this.renderStatement(s.statement)}`);
    return lines.join('\n');
  },

  renderMarkdown(spec: unknown): string {
    if (!spec || typeof spec !== 'object') return '';
    const s = spec as Record<string, unknown>;
    const statement = s.statement as Record<string, unknown> | undefined;
    const risk = s.risk as Record<string, unknown> | undefined;
    const history = Array.isArray(s.statusHistory) ? s.statusHistory as readonly unknown[] : [];
    const fitCriteria = Array.isArray(s.fitCriteria) ? s.fitCriteria as readonly Record<string, unknown>[] : [];

    const lines: string[] = [];

    // Ticket-card header: class-of-service badge + title
    lines.push(`# [${String(s.requirementKind)}] ${s.id} — ${s.title}`);
    lines.push('');
    lines.push(`\`${String(s.status)}\` · priority: ${String(s.priority)} · verification: ${String(s.verificationMethod)}`);
    lines.push('');

    // SLE / due-date prominently (depends on class of service)
    if (statement?.pattern === 'fixed-date-commitment' && statement.deadline) {
      lines.push(`**Due**: ${String(statement.deadline)}`);
      if (statement.penalty) lines.push(`**Penalty if missed**: ${String(statement.penalty)}`);
      lines.push('');
    } else if (statement?.pattern === 'sla-commitment' && statement.p85) {
      lines.push(`**SLE (p85)**: ${String(statement.p85)}`);
      lines.push('');
    } else if (statement?.pattern === 'expedite-pull' && statement.cod) {
      lines.push(`**Cost of delay**: ${String(statement.cod)}`);
      if (statement.blocking) lines.push(`**Blocking**: ${String(statement.blocking)}`);
      lines.push('');
    }

    // Statement
    lines.push('## Statement');
    lines.push('');
    lines.push(`> ${this.renderStatement(s.statement)}`);
    lines.push('');

    // Done criteria — rendered as a checkbox list
    if (fitCriteria.length > 0) {
      lines.push('## Done when');
      lines.push('');
      for (const fc of fitCriteria) {
        const label = String(fc.description ?? fc.kind ?? '(unnamed criterion)');
        const done = fc.status === 'passed' || fc.status === 'met';
        lines.push(`- [${done ? 'x' : ' '}] ${label}`);
      }
      lines.push('');
    }

    if (risk?.level) {
      lines.push(`**Delay profile**: ${String(risk.level)}`);
      lines.push('');
    }

    // Compact history timeline at the bottom
    if (history.length > 0) {
      lines.push('---');
      lines.push('');
      const crumbs = history
        .map(h => {
          const e = h as Record<string, unknown>;
          return `${String(e.to ?? e.state ?? '?')}${e.at ? `@${String(e.at)}` : ''}`;
        })
        .join(' → ');
      lines.push(`_history_: ${crumbs}`);
    }

    return lines.join('\n');
  },
};

// ── The Kanban Style ────────────────────────────────────────────────────────

export const KanbanStyle: RequirementStyle = {
  id: '@frenchexdev2/requirements/styles/kanban',
  version: '1.0.0',
  vocabulary: KANBAN_VOCABULARY,
  validators: KANBAN_VALIDATORS,
  templates: KANBAN_TEMPLATES,
  reporter: KANBAN_REPORTER,
  fitCriterionAdapters: [],
};

export type KanbanStyleType = typeof KanbanStyle;
