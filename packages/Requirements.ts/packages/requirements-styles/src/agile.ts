/**
 * AgileStyle — the ontology for Agile software development.
 *
 * Rooted in the Agile Manifesto (Beck et al. 2001), the Scrum Guide
 * (Sutherland & Schwaber), User Stories Applied (Cohn), the INVEST criteria
 * (Wake), Given-When-Then (Dan North / Gherkin), Definition of Ready &
 * Definition of Done, Story Points, SAFe (Epics & Enablers) and XP (Beck).
 *
 * Use this Style when the deliverable is a Product Backlog: user-value first,
 * short feedback loops, iterative discovery, explicit debt and spike work.
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

export const AGILE_VOCABULARY: StyleVocabulary = {
  requirementKinds: [
    'UserStory',
    'Epic',
    'Enabler',
    'Spike',
    'TechnicalDebt',
    'Bug',
    'NonFunctional',
    'Research',
  ],

  // Scrum/Kanban board columns. Rework loops cover refinement blockers
  // and review-to-dev bounce-backs that every real team experiences.
  statusWorkflow: {
    states: [
      'Backlog',
      'Refined',
      'Ready',
      'InProgress',
      'InReview',
      'Done',
      'Released',
      'Archived',
    ],
    initial: 'Backlog',
    transitions: [
      { from: 'Backlog',    to: 'Refined' },
      { from: 'Refined',    to: 'Ready' },
      { from: 'Ready',      to: 'InProgress' },
      { from: 'InProgress', to: 'InReview' },
      { from: 'InReview',   to: 'Done' },
      { from: 'Done',       to: 'Released' },
      { from: 'Released',   to: 'Archived' },
      // Rework: review sends work back to dev
      { from: 'InReview',   to: 'InProgress' },
      // Refinement blocker: a Ready story re-opens for clarification
      { from: 'Ready',      to: 'Refined' },
    ],
    terminal: ['Archived'],
  },

  // Agile prioritization / severity — plain-English levels every PO understands.
  riskTaxonomy: {
    levels: ['Showstopper', 'High', 'Medium', 'Low', 'Trivial'],
    matrix: {
      axes: {
        likelihood: ['Certain', 'Likely', 'Possible', 'Unlikely'],
        impact:     ['Critical', 'Major', 'Minor', 'Cosmetic'],
      },
      cells: [
        { likelihood: 'Certain',  impact: 'Critical', level: 'Showstopper' },
        { likelihood: 'Certain',  impact: 'Major',    level: 'High' },
        { likelihood: 'Likely',   impact: 'Critical', level: 'High' },
        { likelihood: 'Likely',   impact: 'Major',    level: 'Medium' },
        { likelihood: 'Possible', impact: 'Critical', level: 'Medium' },
        { likelihood: 'Possible', impact: 'Major',    level: 'Medium' },
        { likelihood: 'Possible', impact: 'Minor',    level: 'Low' },
        { likelihood: 'Unlikely', impact: 'Major',    level: 'Low' },
        { likelihood: 'Unlikely', impact: 'Minor',    level: 'Trivial' },
        { likelihood: 'Unlikely', impact: 'Cosmetic', level: 'Trivial' },
      ],
    },
  },

  verificationMethods: [
    'AcceptanceTest',       // Gherkin / Cucumber / Playwright AC
    'DefinitionOfDone',     // team-level DoD checklist
    'DemoToPO',             // sprint review demonstration
    'UserValidation',       // real user walks through the feature
    'PairReview',           // XP pair programming / code review
    'TDD',                  // red-green-refactor
    'BDD',                  // behaviour-driven scenarios
    'ExploratoryTesting',   // session-based testing for spikes / bugs
  ],

  rationaleKinds: [
    'user-value',
    'technical-enabler',
    'debt-paydown',
    'bug-fix',
    'spike-learning',
    'business-goal',
    'team-health',
    'customer-feedback',
  ],

  sourceKinds: [
    { kind: 'product-owner', label: 'Product Owner', slots: [
      { name: 'name', type: 'string',   required: true },
      { name: 'date', type: 'iso-date', required: true },
    ]},
    { kind: 'user-interview', label: 'User interview', slots: [
      { name: 'interviewee',       type: 'string',   required: true },
      { name: 'date',              type: 'iso-date', required: true },
      { name: 'session-notes-url', type: 'url',      required: false },
    ]},
    { kind: 'market-research', label: 'Market research', slots: [
      { name: 'study', type: 'string', required: true },
      { name: 'firm',  type: 'string', required: true },
      { name: 'year',  type: 'number', required: true },
    ]},
    { kind: 'sprint-retrospective', label: 'Sprint retrospective', slots: [
      { name: 'sprintId',    type: 'string',   required: true },
      { name: 'date',        type: 'iso-date', required: true },
      { name: 'action-item', type: 'string',   required: true },
    ]},
    { kind: 'customer-support', label: 'Customer support ticket', slots: [
      { name: 'ticketId', type: 'string',   required: true },
      { name: 'channel',  type: 'string',   required: true, hint: 'email / chat / phone / zendesk' },
      { name: 'date',     type: 'iso-date', required: true },
    ]},
    { kind: 'backlog-grooming', label: 'Backlog grooming session', slots: [
      { name: 'date',        type: 'iso-date', required: true },
      { name: 'facilitator', type: 'string',   required: true },
    ]},
    { kind: 'technical-debt-register', label: 'Technical debt register', slots: [
      { name: 'debtId', type: 'string', required: true },
      { name: 'owner',  type: 'string', required: true },
    ]},
    { kind: 'product-kpi', label: 'Product KPI / OKR', slots: [
      { name: 'metric',       type: 'string', required: true },
      { name: 'target',       type: 'string', required: true },
      { name: 'currentValue', type: 'string', required: true },
    ]},
  ],

  // Agile has its own grammar. Not EARS — Connextra + Gherkin + SAFe.
  statementPatterns: [
    { pattern: 'user-story',
      label: 'User story (Connextra)',
      template: 'As a {role}, I want {capability}, so that {benefit}.',
      slots: [
        { name: 'role',       required: true, hint: 'e.g. returning customer' },
        { name: 'capability', required: true, hint: 'what they want to do' },
        { name: 'benefit',    required: true, hint: 'why they want it — the INVEST "V"' },
      ] },
    { pattern: 'given-when-then',
      label: 'Acceptance scenario (Gherkin / BDD)',
      template: 'Given {precondition}, when {trigger}, then {outcome}.',
      slots: [
        { name: 'precondition', required: true },
        { name: 'trigger',      required: true },
        { name: 'outcome',      required: true },
      ] },
    { pattern: 'epic',
      label: 'Epic (SAFe)',
      template: 'Epic: {epic}. Business outcome: {outcome}. Measured by {kpi}.',
      slots: [
        { name: 'epic',    required: true },
        { name: 'outcome', required: true },
        { name: 'kpi',     required: true, hint: 'measurable success signal' },
      ] },
    { pattern: 'enabler',
      label: 'Enabler (SAFe technical enabler)',
      template: 'Technical enabler: {capability}. Required by {userStories}. Risk mitigation: {riskMitigated}.',
      slots: [
        { name: 'capability',    required: true },
        { name: 'userStories',   required: true, hint: 'IDs of stories this enables' },
        { name: 'riskMitigated', required: true },
      ] },
    { pattern: 'spike',
      label: 'Spike (XP timeboxed investigation)',
      template: 'Spike: investigate {question}. Timebox: {timebox}. Deliverable: {deliverable}.',
      slots: [
        { name: 'question',    required: true },
        { name: 'timebox',     required: true, hint: 'e.g. 2 days, 1 sprint' },
        { name: 'deliverable', required: true, hint: 'decision memo / prototype / ADR' },
      ] },
    { pattern: 'bug',
      label: 'Bug report',
      template: 'Bug: {summary}. Expected: {expected}. Actual: {actual}. Repro: {repro}.',
      slots: [
        { name: 'summary',  required: true },
        { name: 'expected', required: true },
        { name: 'actual',   required: true },
        { name: 'repro',    required: true, hint: 'minimal reproducible steps' },
      ] },
    { pattern: 'natural',
      label: 'Natural language (fallback — generates warning)',
      template: '{text}',
      slots: [ { name: 'text', required: true } ] },
  ],
};

// ── Validators ──────────────────────────────────────────────────────────────

function ok(): ValidationResult { return { ok: true, errors: [] }; }

export const AGILE_VALIDATORS: StyleValidators = {
  validateStatement(statement: unknown): ValidationResult {
    if (!statement || typeof statement !== 'object') {
      return { ok: false, errors: [{ path: 'statement', message: 'must be an object' }] };
    }
    const s = statement as Record<string, unknown>;
    const schema = AGILE_VOCABULARY.statementPatterns.find(p => p.pattern === s.pattern);
    if (!schema) {
      return { ok: false, errors: [{ path: 'statement.pattern', message: `unknown pattern '${String(s.pattern)}'` }] };
    }
    const errors = schema.slots
      .filter(slot => slot.required && (typeof s[slot.name] !== 'string' || (s[slot.name] as string).length === 0))
      .map(slot => ({ path: `statement.${slot.name}`, message: `required slot missing for pattern '${schema.pattern}'` }));
    return errors.length === 0 ? ok() : { ok: false, errors };
  },

  validateSpec(spec: unknown): ValidationResult {
    if (!spec || typeof spec !== 'object') {
      return { ok: false, errors: [{ path: '', message: 'spec must be an object' }] };
    }
    const s = spec as Record<string, unknown>;
    const errors: { path: string; message: string }[] = [];

    if (s.kind === 'requirement') {
      if (!AGILE_VOCABULARY.requirementKinds.includes(s.requirementKind as string)) {
        errors.push({ path: 'requirementKind', message: `expected one of ${AGILE_VOCABULARY.requirementKinds.join(', ')}` });
      }
      if (!AGILE_VOCABULARY.statusWorkflow.states.includes(s.status as string)) {
        errors.push({ path: 'status', message: 'status must be an AgileStyle state' });
      }

      const statement = s.statement as Record<string, unknown> | undefined;
      const pattern = statement?.pattern as string | undefined;

      // RULE 1: UserStory kind must be expressed as user-story or given-when-then.
      if (s.requirementKind === 'UserStory') {
        if (pattern !== 'user-story' && pattern !== 'given-when-then') {
          errors.push({ path: 'statement.pattern', message: "UserStory kind requires 'user-story' or 'given-when-then' pattern" });
        }
      }

      // RULE 2: Epic requires the epic pattern with a non-empty kpi (no measurement → no epic).
      if (s.requirementKind === 'Epic') {
        if (pattern !== 'epic') {
          errors.push({ path: 'statement.pattern', message: "Epic kind requires 'epic' pattern" });
        } else {
          const kpi = statement?.kpi as string | undefined;
          if (!kpi || kpi.length === 0) {
            errors.push({ path: 'statement.kpi', message: 'Epic requires a non-empty kpi (measurable outcome)' });
          }
        }
      }

      // RULE 3: Spike requires a timebox — an open-ended spike is not a spike.
      if (s.requirementKind === 'Spike') {
        if (pattern !== 'spike') {
          errors.push({ path: 'statement.pattern', message: "Spike kind requires 'spike' pattern" });
        } else if (!statement?.timebox) {
          // Empty strings are already falsy — one branch is enough.
          errors.push({ path: 'statement.timebox', message: 'Spike requires a non-empty timebox' });
        }
      }

      // RULE 4: Bug requires reproducible steps — "works on my machine" is not a bug report.
      if (s.requirementKind === 'Bug') {
        if (pattern !== 'bug') {
          errors.push({ path: 'statement.pattern', message: "Bug kind requires 'bug' pattern" });
        } else if (!statement?.repro) {
          errors.push({ path: 'statement.repro', message: 'Bug requires non-empty repro steps' });
        }
      }

      // RULE 5: INVEST "Valuable" — a user-story without benefit is a feature spec, not a story.
      if (pattern === 'user-story') {
        const benefit = statement?.benefit as string | undefined;
        if (!benefit || benefit.length === 0) {
          errors.push({ path: 'statement.benefit', message: 'INVEST: user-story must carry a non-empty benefit slot (the "V" in INVEST)' });
        }
      }

      const stmt = this.validateStatement(s.statement);
      if (!stmt.ok) errors.push(...stmt.errors);
    }

    return errors.length === 0 ? ok() : { ok: false, errors };
  },
};

// ── Templates ───────────────────────────────────────────────────────────────

const AGILE_TEMPLATE_LIST: readonly RequirementTemplate[] = [
  {
    id: 'user-story-standard',
    label: 'User story — Connextra "As a … I want … so that …"',
    description: 'The default backlog item. INVEST-compliant user story with acceptance test.',
    skeleton: {
      kind: 'UserStory',
      statementPattern: 'user-story',
      priority: 'Medium',
      defaultFitCriterionKinds: ['unit-test', 'demonstration'],
      rationaleKind: 'user-value',
      verificationMethod: 'AcceptanceTest',
    },
  },
  {
    id: 'given-when-then-ac',
    label: 'Acceptance scenario — Given / When / Then',
    description: 'A single executable BDD scenario attached to a user story.',
    skeleton: {
      kind: 'UserStory',
      statementPattern: 'given-when-then',
      priority: 'Medium',
      defaultFitCriterionKinds: ['unit-test'],
      rationaleKind: 'user-value',
      verificationMethod: 'BDD',
    },
  },
  {
    id: 'epic-scaffold',
    label: 'Epic — SAFe outcome-driven',
    description: 'A multi-sprint epic with a measurable business outcome.',
    skeleton: {
      kind: 'Epic',
      statementPattern: 'epic',
      priority: 'High',
      defaultFitCriterionKinds: ['metric', 'demonstration'],
      rationaleKind: 'business-goal',
      verificationMethod: 'DemoToPO',
    },
  },
  {
    id: 'enabler-technical',
    label: 'Enabler — technical work unblocking user stories',
    description: 'Infrastructure / architecture work that enables downstream value.',
    skeleton: {
      kind: 'Enabler',
      statementPattern: 'enabler',
      priority: 'Medium',
      defaultFitCriterionKinds: ['unit-test'],
      rationaleKind: 'technical-enabler',
      verificationMethod: 'PairReview',
    },
  },
  {
    id: 'spike-timeboxed',
    label: 'Spike — XP timeboxed investigation',
    description: 'A bounded research item producing a decision memo, prototype, or ADR.',
    skeleton: {
      kind: 'Spike',
      statementPattern: 'spike',
      priority: 'Medium',
      defaultFitCriterionKinds: ['demonstration'],
      rationaleKind: 'spike-learning',
      verificationMethod: 'ExploratoryTesting',
    },
  },
  {
    id: 'bug-report',
    label: 'Bug report — summary / expected / actual / repro',
    description: 'Reproducible defect with acceptance test covering the fix.',
    skeleton: {
      kind: 'Bug',
      statementPattern: 'bug',
      priority: 'High',
      defaultFitCriterionKinds: ['unit-test'],
      rationaleKind: 'bug-fix',
      verificationMethod: 'AcceptanceTest',
    },
  },
];

export const AGILE_TEMPLATES: StyleTemplates = {
  templates: AGILE_TEMPLATE_LIST,
  findTemplate(id: string) {
    return AGILE_TEMPLATE_LIST.find(t => t.id === id);
  },
};

// ── Reporter — "story card" Markdown output ─────────────────────────────────

export const AGILE_REPORTER: RequirementReporter = {
  renderStatement(statement: unknown): string {
    if (!statement || typeof statement !== 'object') return '';
    const s = statement as Record<string, string>;
    const schema = AGILE_VOCABULARY.statementPatterns.find(p => p.pattern === s.pattern);
    if (!schema) return JSON.stringify(statement);
    let out = schema.template;
    for (const slot of schema.slots) out = out.replace(`{${slot.name}}`, s[slot.name] ?? '…');
    return out;
  },

  renderRequirement(spec: unknown): string {
    if (!spec || typeof spec !== 'object') return '';
    const s = spec as Record<string, unknown>;
    const risk = s.risk as Record<string, unknown> | undefined;
    const lines: string[] = [];
    lines.push(`${s.id}  ${s.title}`);
    lines.push(`  Kind: ${s.requirementKind}    Status: ${s.status}    Priority: ${s.priority}    Risk: ${String(risk?.level ?? '—')}`);
    lines.push(`  Verification: ${s.verificationMethod}`);
    lines.push(`  Story: ${this.renderStatement(s.statement)}`);
    return lines.join('\n');
  },

  // Story-card layout: header, blockquoted story, AC checkboxes, context footer.
  renderMarkdown(spec: unknown): string {
    if (!spec || typeof spec !== 'object') return '';
    const s = spec as Record<string, unknown>;
    const risk = s.risk as Record<string, unknown> | undefined;
    const source = s.source as Record<string, unknown> | undefined;
    const fits = Array.isArray(s.fitCriteria) ? s.fitCriteria as readonly Record<string, unknown>[] : [];
    const acs = fits.filter(fc => fc.kind === 'unit-test' || fc.kind === 'demonstration');

    const lines: string[] = [];
    lines.push(`# ${s.id} — ${s.title}`);
    lines.push('');
    lines.push(`> ${this.renderStatement(s.statement)}`);
    lines.push('');
    lines.push('## Acceptance criteria');
    lines.push('');
    if (acs.length === 0) {
      lines.push('- [ ] _(no acceptance criteria defined yet)_');
    } else {
      for (const ac of acs) {
        const desc = String(ac.description ?? ac.id ?? 'criterion');
        lines.push(`- [ ] ${desc}`);
      }
    }
    lines.push('');
    lines.push('---');
    const sourceType = source?.type ?? '—';
    lines.push(`**Source**: ${String(sourceType)} · **Priority**: ${String(s.priority)} · **Status**: ${String(s.status)} · **Risk**: ${String(risk?.level ?? '—')}`);
    return lines.join('\n');
  },
};

// ── The Agile Style ─────────────────────────────────────────────────────────

export const AgileStyle: RequirementStyle = {
  id: '@frenchexdev2/requirements/styles/agile',
  version: '1.0.0',
  vocabulary: AGILE_VOCABULARY,
  validators: AGILE_VALIDATORS,
  templates: AGILE_TEMPLATES,
  reporter: AGILE_REPORTER,
  fitCriterionAdapters: [],
};

export type AgileStyleType = typeof AgileStyle;
