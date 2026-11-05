/**
 * LeanStyle — the ontology for Lean requirements engineering.
 *
 * Lineage:
 *   Toyota Production System      (Taiichi Ohno, Shigeo Shingo)
 *   Lean Thinking                 (Womack & Jones, 1996)
 *   Lean Software Development     (Mary & Tom Poppendieck, 2003)
 *   The Lean Startup              (Eric Ries, 2011)
 *   Toyota Kata                   (Mike Rother, 2009)
 *   A3 Thinking                   (Durward K. Sobek II, Art Smalley)
 *
 * Core stance: a requirement is a hypothesis about value; it must be tied to a
 * directly observed waste or an articulated customer pull. "Go and see" (genchi
 * genbutsu) is the rule — any waste-elimination requirement must cite a gemba
 * walk or a VSM, never armchair analysis. The status workflow is PDCA, not
 * gate-heavy approval. Risk is Impact × Effort (ICE-style), not likelihood ×
 * severity — Lean prioritises do-first cells, not worst-case bookkeeping.
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

export const LEAN_VOCABULARY: StyleVocabulary = {
  requirementKinds: [
    'ValueAdding',
    'NonValueAddingButNecessary',
    'Waste-Elimination',
    'Flow-Improvement',
    'Quality-BuiltIn',
    'Customer-Pull',
    'Standardization',
    'Kaizen-Experiment',
    'Respect-for-People',
  ],

  // PDCA / A3 cycle — plan, do, check, act. Rework loops reflect the fact that
  // learning invalidates both the countermeasure and (sometimes) the target itself.
  statusWorkflow: {
    states: [
      'ProblemStated',
      'CurrentStateMapped',
      'TargetStateDefined',
      'CountermeasureProposed',
      'Experimenting',
      'Validated',
      'Standardized',
      'Deprecated',
    ],
    initial: 'ProblemStated',
    transitions: [
      { from: 'ProblemStated',          to: 'CurrentStateMapped' },
      { from: 'CurrentStateMapped',     to: 'TargetStateDefined' },
      { from: 'TargetStateDefined',     to: 'CountermeasureProposed' },
      { from: 'CountermeasureProposed', to: 'Experimenting' },
      { from: 'Experimenting',          to: 'Validated' },
      { from: 'Validated',              to: 'Standardized' },
      { from: 'Standardized',           to: 'Deprecated' },
      // Rework — experiment failed, rethink the countermeasure
      { from: 'Experimenting',          to: 'CountermeasureProposed' },
      // Rework — validation showed the target itself was wrong
      { from: 'Validated',              to: 'TargetStateDefined' },
      // Superseded standard work
      { from: 'Standardized',           to: 'ProblemStated' },
    ],
    terminal: ['Deprecated'],
  },

  // Impact × Effort (ICE-style). Likelihood is unused in Lean prioritisation —
  // we do not play probabilities, we go see and act on what is in front of us.
  riskTaxonomy: {
    levels: [
      'HighImpactLowEffort',   // just-do-it — the do-first quadrant
      'HighImpactHighEffort',  // strategic kaizen / hoshin project
      'LowImpactLowEffort',    // fill-in / 5S-class work
      'LowImpactHighEffort',   // avoid — classic muda
    ],
    matrix: {
      axes: {
        likelihood: ['Low', 'Medium', 'High'], // re-purposed as "effort"
        impact:     ['High', 'Medium', 'Low'],
      },
      cells: [
        { likelihood: 'Low',    impact: 'High',   level: 'HighImpactLowEffort'  },
        { likelihood: 'Low',    impact: 'Medium', level: 'HighImpactLowEffort'  },
        { likelihood: 'Low',    impact: 'Low',    level: 'LowImpactLowEffort'   },
        { likelihood: 'Medium', impact: 'High',   level: 'HighImpactHighEffort' },
        { likelihood: 'Medium', impact: 'Medium', level: 'HighImpactHighEffort' },
        { likelihood: 'Medium', impact: 'Low',    level: 'LowImpactLowEffort'   },
        { likelihood: 'High',   impact: 'High',   level: 'HighImpactHighEffort' },
        { likelihood: 'High',   impact: 'Medium', level: 'LowImpactHighEffort'  },
        { likelihood: 'High',   impact: 'Low',    level: 'LowImpactHighEffort'  },
      ],
    },
  },

  verificationMethods: [
    'GembaWalk',        // go see
    'A3Review',         // peer review of the A3 report
    'FiveWhys',         // root-cause walk
    'PDCA',             // plan-do-check-act experiment cycle
    'VSM',              // value-stream mapping before/after
    'Kaizen',           // kaizen-event outcome
    'StandardWork',     // compliance with standard work
    'TaktTimeCheck',    // cycle-time vs takt measurement
  ],

  rationaleKinds: [
    'waste-observed',
    'customer-complaint',
    'takt-time-deviation',
    'defect-metric',
    'flow-impediment',
    'standard-work-gap',
    'kata-learning',
    'hoshin-alignment',
  ],

  sourceKinds: [
    { kind: 'gemba-walk', label: 'Gemba walk — go see', slots: [
      { name: 'location', type: 'string',   required: true,  hint: 'shop floor / cell / queue / service desk' },
      { name: 'date',     type: 'iso-date', required: true },
      { name: 'observer', type: 'string',   required: true },
    ]},
    { kind: 'customer-feedback', label: 'Customer feedback', slots: [
      { name: 'source',  type: 'string',   required: true,  hint: 'NPS, support ticket, interview, …' },
      { name: 'channel', type: 'string',   required: true },
      { name: 'date',    type: 'iso-date', required: true },
    ]},
    { kind: 'process-measurement', label: 'Process measurement', slots: [
      { name: 'metric',   type: 'string', required: true, hint: 'cycle time, defect rate, WIP, …' },
      { name: 'baseline', type: 'number', required: true },
      { name: 'target',   type: 'number', required: true },
      { name: 'unit',     type: 'string', required: true, hint: 's, %, units/h, …' },
    ]},
    { kind: 'a3-analysis', label: 'A3 problem-solving report', slots: [
      { name: 'a3Id',  type: 'string',   required: true },
      { name: 'owner', type: 'string',   required: true },
      { name: 'date',  type: 'iso-date', required: true },
    ]},
    { kind: 'kaizen-event', label: 'Kaizen event', slots: [
      { name: 'eventId', type: 'string',   required: true },
      { name: 'team',    type: 'string',   required: true },
      { name: 'date',    type: 'iso-date', required: true },
    ]},
    // TIMWOODS — transport, inventory, motion, waiting, overproduction,
    // over-processing, defects, unused talent. The eight classical wastes.
    { kind: 'vsm', label: 'Value-stream map', slots: [
      { name: 'streamName',     type: 'string',   required: true },
      { name: 'mappedAt',       type: 'iso-date', required: true },
      { name: 'wasteCategory',  type: 'string',   required: true, hint: 'transport | inventory | motion | waiting | overproduction | over-processing | defects | unused-talent' },
    ]},
    { kind: 'hoshin-plan', label: 'Hoshin Kanri breakthrough plan', slots: [
      { name: 'year',         type: 'string', required: true },
      { name: 'breakthrough', type: 'string', required: true },
    ]},
    { kind: 'kata-coaching', label: 'Improvement / Coaching Kata session', slots: [
      { name: 'coach',   type: 'string',   required: true },
      { name: 'learner', type: 'string',   required: true },
      { name: 'date',    type: 'iso-date', required: true },
    ]},
  ],

  // Lean statement forms — A3 framing, not EARS. The contract is: every
  // statement makes an explicit current→target→gap or hypothesis→outcome shape.
  statementPatterns: [
    { pattern: 'problem-statement',
      label: 'A3 problem statement',
      template: 'Problem: {problem}. Current: {currentState}. Target: {targetState}. Gap: {gap}.',
      slots: [
        { name: 'problem',      required: true },
        { name: 'currentState', required: true, hint: 'measured, not guessed' },
        { name: 'targetState',  required: true, hint: 'measurable target condition' },
        { name: 'gap',          required: true, hint: 'the delta — what must close' },
      ] },

    { pattern: 'countermeasure',
      label: 'Countermeasure (PDCA Plan)',
      template: 'To address {problem}, we will {action} by {date}, measured by {metric} reaching {target}.',
      slots: [
        { name: 'problem', required: true },
        { name: 'action',  required: true },
        { name: 'date',    required: true },
        { name: 'metric',  required: true },
        { name: 'target',  required: true },
      ] },

    { pattern: 'standard-work',
      label: 'Standard work definition',
      template: 'Standard work for {operation}: {steps}. Takt: {taktTime}. Quality checkpoint: {checkpoint}.',
      slots: [
        { name: 'operation',  required: true },
        { name: 'steps',      required: true },
        { name: 'taktTime',   required: true },
        { name: 'checkpoint', required: false },
      ] },

    { pattern: 'value-proposition',
      label: 'Customer value proposition',
      template: 'For {customer} who needs {need}, we provide {value}, unlike {alternatives}.',
      slots: [
        { name: 'customer',     required: true },
        { name: 'need',         required: true },
        { name: 'value',        required: true },
        { name: 'alternatives', required: true },
      ] },

    { pattern: 'kaizen-hypothesis',
      label: 'Kaizen / Lean Startup hypothesis',
      template: 'If we {change}, then {expectedOutcome}, because {reasoning}. We will know within {validationWindow} by observing {metric}.',
      slots: [
        { name: 'change',            required: true },
        { name: 'expectedOutcome',   required: true },
        { name: 'reasoning',         required: true },
        { name: 'validationWindow',  required: true, hint: 'time-box for the experiment — build-measure-learn' },
        { name: 'metric',            required: true, hint: 'the actionable metric (Ries)' },
      ] },

    { pattern: 'natural', label: 'Natural language (fallback — generates warning)',
      template: '{text}', slots: [ { name: 'text', required: true } ] },
  ],
};

// ── Validators ──────────────────────────────────────────────────────────────

function ok(): ValidationResult { return { ok: true, errors: [] }; }

export const LEAN_VALIDATORS: StyleValidators = {
  validateStatement(statement: unknown): ValidationResult {
    if (!statement || typeof statement !== 'object') return { ok: false, errors: [{ path: 'statement', message: 'must be an object' }] };
    const s = statement as Record<string, unknown>;
    const schema = LEAN_VOCABULARY.statementPatterns.find(p => p.pattern === s.pattern);
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
      if (!LEAN_VOCABULARY.requirementKinds.includes(s.requirementKind as string)) {
        errors.push({ path: 'requirementKind', message: `expected one of ${LEAN_VOCABULARY.requirementKinds.join(', ')}` });
      }
      if (!LEAN_VOCABULARY.statusWorkflow.states.includes(s.status as string)) {
        errors.push({ path: 'status', message: 'status must be a LeanStyle state' });
      }

      const statement = s.statement as Record<string, unknown> | undefined;

      // Kaizen-Experiment requirements — PDCA hypothesis form, verified via PDCA
      if (s.requirementKind === 'Kaizen-Experiment') {
        if (statement?.pattern !== 'kaizen-hypothesis') {
          errors.push({ path: 'statement.pattern', message: 'Kaizen-Experiment requirements must use the kaizen-hypothesis pattern' });
        }
        const vm = s.verificationMethod as string | undefined;
        if (vm !== 'PDCA') {
          errors.push({ path: 'verificationMethod', message: 'Kaizen-Experiment requirements must be verified by PDCA (got ' + String(vm) + ')' });
        }
      }

      // Standardization requirements — standard-work statement form
      if (s.requirementKind === 'Standardization') {
        if (statement?.pattern !== 'standard-work') {
          errors.push({ path: 'statement.pattern', message: 'Standardization requirements must use the standard-work pattern' });
        }
      }

      // Problem statements must carry a measurable gap — no gap, no problem.
      if (statement?.pattern === 'problem-statement') {
        const gap = statement.gap as string | undefined;
        if (typeof gap !== 'string' || gap.length === 0) {
          errors.push({ path: 'statement.gap', message: 'problem-statement requires a non-empty gap (the measurable delta current→target)' });
        }
      }

      // Genchi genbutsu — waste claims require direct observation (gemba or VSM).
      if (s.requirementKind === 'Waste-Elimination') {
        const source = s.source as Record<string, unknown> | undefined;
        const t = source?.type as string | undefined;
        if (t !== 'gemba-walk' && t !== 'vsm') {
          errors.push({ path: 'source.type', message: 'Waste-Elimination requirements must cite a gemba-walk or vsm source (genchi genbutsu — go see)' });
        }
      }

      const stmt = this.validateStatement(s.statement);
      if (!stmt.ok) errors.push(...stmt.errors);
    }

    return errors.length === 0 ? ok() : { ok: false, errors };
  },
};

// ── Templates ───────────────────────────────────────────────────────────────

const LEAN_TEMPLATE_LIST: readonly RequirementTemplate[] = [
  {
    id: 'a3-problem',
    label: 'A3 problem statement',
    description: 'Frame a problem in the A3 shape: current → target → gap. The starting point of any PDCA cycle.',
    skeleton: {
      kind: 'ValueAdding',
      statementPattern: 'problem-statement',
      priority: 'Medium',
      defaultFitCriterionKinds: ['metric'],
      rationaleKind: 'waste-observed',
      verificationMethod: 'A3Review',
    },
  },
  {
    id: 'kaizen-experiment',
    label: 'Kaizen experiment (PDCA hypothesis)',
    description: 'A time-boxed hypothesis with a leading metric — build-measure-learn on the shop floor.',
    skeleton: {
      kind: 'Kaizen-Experiment',
      statementPattern: 'kaizen-hypothesis',
      priority: 'High',
      defaultFitCriterionKinds: ['metric'],
      rationaleKind: 'kata-learning',
      verificationMethod: 'PDCA',
    },
  },
  {
    id: 'standard-work-definition',
    label: 'Standard work definition',
    description: 'Codify the current best-known way to do the work — takt, sequence, and quality checkpoint.',
    skeleton: {
      kind: 'Standardization',
      statementPattern: 'standard-work',
      priority: 'High',
      defaultFitCriterionKinds: ['inspection'],
      rationaleKind: 'standard-work-gap',
      verificationMethod: 'StandardWork',
    },
  },
  {
    id: 'waste-elimination',
    label: 'Waste elimination (TIMWOODS)',
    description: 'Eliminate an observed waste — requires a gemba walk or VSM as source.',
    skeleton: {
      kind: 'Waste-Elimination',
      statementPattern: 'problem-statement',
      priority: 'High',
      defaultFitCriterionKinds: ['metric'],
      rationaleKind: 'waste-observed',
      verificationMethod: 'GembaWalk',
    },
  },
  {
    id: 'customer-value-increment',
    label: 'Customer value increment (pull)',
    description: 'A small increment pulled by an articulated customer need — value-proposition form.',
    skeleton: {
      kind: 'Customer-Pull',
      statementPattern: 'value-proposition',
      priority: 'High',
      defaultFitCriterionKinds: ['demonstration', 'metric'],
      rationaleKind: 'customer-complaint',
      verificationMethod: 'GembaWalk',
    },
  },
];

export const LEAN_TEMPLATES: StyleTemplates = {
  templates: LEAN_TEMPLATE_LIST,
  findTemplate(id: string) {
    return LEAN_TEMPLATE_LIST.find(t => t.id === id);
  },
};

// ── Reporter — A3-style one-page Markdown ───────────────────────────────────

export const LEAN_REPORTER: RequirementReporter = {
  renderStatement(statement: unknown): string {
    if (!statement || typeof statement !== 'object') return '';
    const s = statement as Record<string, string>;
    const schema = LEAN_VOCABULARY.statementPatterns.find(p => p.pattern === s.pattern);
    if (!schema) return JSON.stringify(statement);
    let out = schema.template;
    for (const slot of schema.slots) out = out.replace(`{${slot.name}}`, s[slot.name] ?? '…');
    return out;
  },

  renderRequirement(spec: unknown): string {
    if (!spec || typeof spec !== 'object') return '';
    const s = spec as Record<string, unknown>;
    const lines: string[] = [];
    lines.push(`${s.id}  ${s.title}`);
    lines.push(`  Kind: ${s.requirementKind}    Status: ${s.status}    Priority: ${s.priority}`);
    const risk = s.risk as Record<string, unknown> | undefined;
    if (risk?.level) lines.push(`  Impact/Effort: ${String(risk.level)}`);
    lines.push(`  Verification: ${s.verificationMethod}`);
    lines.push(`  Statement: ${this.renderStatement(s.statement)}`);
    return lines.join('\n');
  },

  // A3-style one-page Markdown — header, context, problem, fit criteria, verification.
  renderMarkdown(spec: unknown): string {
    if (!spec || typeof spec !== 'object') return '';
    const s = spec as Record<string, unknown>;
    const risk = s.risk as Record<string, unknown> | undefined;
    const source = s.source as Record<string, unknown> | undefined;
    const fitCriteria = Array.isArray(s.fitCriteria) ? s.fitCriteria as Record<string, unknown>[] : [];
    const lines: string[] = [];
    lines.push(`# A3 — ${s.id}: ${s.title}`);
    lines.push('');
    lines.push('## Context');
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('|---|---|');
    lines.push(`| Kind | ${s.requirementKind} |`);
    lines.push(`| Status (PDCA) | ${s.status} |`);
    lines.push(`| Impact × Effort | ${risk?.level ?? '—'} |`);
    lines.push(`| Source | ${source?.type ?? '—'} (${Object.entries(source ?? {}).filter(([k]) => k !== 'type').map(([k,v]) => `${k}=${String(v)}`).join(', ')}) |`);
    lines.push(`| Verification | ${s.verificationMethod} |`);
    lines.push('');
    lines.push('## Problem statement');
    lines.push('');
    lines.push(`> ${this.renderStatement(s.statement)}`);
    lines.push('');
    lines.push('## Fit criteria');
    lines.push('');
    if (fitCriteria.length === 0) {
      lines.push('- [ ] _(none defined)_');
    } else {
      for (const fc of fitCriteria) {
        const label = (fc.description ?? fc.id ?? fc.kind ?? 'criterion') as string;
        lines.push(`- [ ] ${label}`);
      }
    }
    lines.push('');
    lines.push(`**Verification method**: ${s.verificationMethod}`);
    return lines.join('\n');
  },
};

// ── The Lean Style ──────────────────────────────────────────────────────────

export const LeanStyle: RequirementStyle = {
  id: '@frenchexdev2/requirements/styles/lean',
  version: '1.0.0',
  vocabulary: LEAN_VOCABULARY,
  validators: LEAN_VALIDATORS,
  templates: LEAN_TEMPLATES,
  reporter: LEAN_REPORTER,
  fitCriterionAdapters: [],
};

export type LeanStyleType = typeof LeanStyle;
