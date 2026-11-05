/**
 * KanbanStyle — dedicated coverage tests.
 *
 * Drives `src/styles/kanban.ts` to 100% lines + functions and exercises every
 * validator / reporter branch: Expedite/FixedDate/Intangible discipline,
 * Standard flow-driven source rule, statement patterns, reporter templating,
 * markdown ticket-card assembly, rework transitions. Dog-fooded via
 * @FeatureTest on RequirementCommandsFeature (the Feature that owns custom
 * status workflow / risk taxonomy ACs — which KanbanStyle exemplifies).
 */

import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { RequirementCommandsFeature } from '../../requirements/features/requirement-commands';
import {
  KANBAN_VOCABULARY,
  KANBAN_VALIDATORS,
  KANBAN_TEMPLATES,
  KANBAN_REPORTER,
  KanbanStyle,
} from '../../src/kanban';

// ─── Helpers ──────────────────────────────────────────────────────────────

function fullyFilled(pattern: string): Record<string, string> {
  const schema = KANBAN_VOCABULARY.statementPatterns.find(p => p.pattern === pattern)!;
  const stmt: Record<string, string> = { pattern };
  for (const slot of schema.slots) stmt[slot.name] = `val-${slot.name}`;
  return stmt;
}

@FeatureTest(RequirementCommandsFeature)
class KanbanStyleTests {
  // ═══ validateStatement — per-pattern acceptance + rejection ═══

  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  'validateStatement accepts fully-filled service-request'() {
    const r = KANBAN_VALIDATORS.validateStatement(fullyFilled('service-request'));
    expect(r.ok).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  'validateStatement accepts fully-filled fixed-date-commitment'() {
    const r = KANBAN_VALIDATORS.validateStatement(fullyFilled('fixed-date-commitment'));
    expect(r.ok).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  'validateStatement accepts fully-filled expedite-pull'() {
    const r = KANBAN_VALIDATORS.validateStatement(fullyFilled('expedite-pull'));
    expect(r.ok).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  'validateStatement accepts fully-filled intangible-investment'() {
    const r = KANBAN_VALIDATORS.validateStatement(fullyFilled('intangible-investment'));
    expect(r.ok).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  'validateStatement accepts fully-filled defect-pull'() {
    const r = KANBAN_VALIDATORS.validateStatement(fullyFilled('defect-pull'));
    expect(r.ok).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  'validateStatement accepts fully-filled sla-commitment'() {
    const r = KANBAN_VALIDATORS.validateStatement(fullyFilled('sla-commitment'));
    expect(r.ok).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  'validateStatement accepts fully-filled natural'() {
    const r = KANBAN_VALIDATORS.validateStatement(fullyFilled('natural'));
    expect(r.ok).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateStatement rejects missing required slot'() {
    const r = KANBAN_VALIDATORS.validateStatement({ pattern: 'expedite-pull', work: '', blocking: 'x', cod: 'x' });
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.path === 'statement.work')).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateStatement rejects unknown pattern'() {
    const r = KANBAN_VALIDATORS.validateStatement({ pattern: 'bogus' });
    expect(r.ok).toBe(false);
    expect(r.errors[0]!.path).toBe('statement.pattern');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateStatement rejects non-object'() {
    expect(KANBAN_VALIDATORS.validateStatement(null).ok).toBe(false);
    expect(KANBAN_VALIDATORS.validateStatement('string').ok).toBe(false);
  }

  // ═══ validateSpec — discipline branches ═══

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateSpec rejects non-object'() {
    const r = KANBAN_VALIDATORS.validateSpec(null);
    expect(r.ok).toBe(false);
    expect(r.errors[0]!.message).toMatch(/must be an object/);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateSpec rejects unknown requirementKind and unknown status'() {
    const r = KANBAN_VALIDATORS.validateSpec({
      kind: 'requirement',
      requirementKind: 'Bogus',
      status: 'Nowhere',
      statement: fullyFilled('service-request'),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.path === 'requirementKind')).toBe(true);
    expect(r.errors.some(e => e.path === 'status')).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateSpec: Expedite without expedite-pull pattern is rejected'() {
    const r = KANBAN_VALIDATORS.validateSpec({
      kind: 'requirement',
      requirementKind: 'Expedite',
      status: 'Backlog',
      statement: fullyFilled('service-request'),
    });
    expect(r.errors.some(e => e.path === 'statement.pattern' && /expedite-pull/.test(e.message))).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateSpec: Expedite with empty cod is rejected'() {
    const r = KANBAN_VALIDATORS.validateSpec({
      kind: 'requirement',
      requirementKind: 'Expedite',
      status: 'Backlog',
      statement: { pattern: 'expedite-pull', work: 'w', blocking: 'b', cod: '' },
    });
    expect(r.errors.some(e => e.path === 'statement.cod')).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateSpec: Expedite with quantified cod accepts discipline branch'() {
    const r = KANBAN_VALIDATORS.validateSpec({
      kind: 'requirement',
      requirementKind: 'Expedite',
      status: 'Backlog',
      statement: { pattern: 'expedite-pull', work: 'w', blocking: 'b', cod: '500€/day' },
    });
    expect(r.errors.some(e => e.path.startsWith('statement.cod'))).toBe(false);
    expect(r.errors.some(e => e.path === 'statement.pattern' && /expedite-pull/.test(e.message))).toBe(false);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateSpec: FixedDate without fixed-date-commitment pattern is rejected'() {
    const r = KANBAN_VALIDATORS.validateSpec({
      kind: 'requirement',
      requirementKind: 'FixedDate',
      status: 'Backlog',
      statement: fullyFilled('service-request'),
    });
    expect(r.errors.some(e => e.path === 'statement.pattern' && /fixed-date-commitment/.test(e.message))).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateSpec: FixedDate with empty deadline is rejected'() {
    const r = KANBAN_VALIDATORS.validateSpec({
      kind: 'requirement',
      requirementKind: 'FixedDate',
      status: 'Backlog',
      statement: { pattern: 'fixed-date-commitment', deadline: '', deliverable: 'd', penalty: 'p' },
    });
    expect(r.errors.some(e => e.path === 'statement.deadline')).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateSpec: FixedDate with populated deadline accepts discipline branch'() {
    const r = KANBAN_VALIDATORS.validateSpec({
      kind: 'requirement',
      requirementKind: 'FixedDate',
      status: 'Backlog',
      statement: { pattern: 'fixed-date-commitment', deadline: '2026-12-01', deliverable: 'd', penalty: 'p' },
    });
    expect(r.errors.some(e => e.path === 'statement.deadline')).toBe(false);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateSpec: Intangible without intangible-investment pattern is rejected'() {
    const r = KANBAN_VALIDATORS.validateSpec({
      kind: 'requirement',
      requirementKind: 'Intangible',
      status: 'Backlog',
      statement: fullyFilled('service-request'),
    });
    expect(r.errors.some(e => e.path === 'statement.pattern' && /intangible-investment/.test(e.message))).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateSpec: Intangible with empty threshold is rejected (Anderson rule)'() {
    const r = KANBAN_VALIDATORS.validateSpec({
      kind: 'requirement',
      requirementKind: 'Intangible',
      status: 'Backlog',
      statement: { pattern: 'intangible-investment', work: 'w', benefit: 'b', threshold: '' },
    });
    expect(r.errors.some(e => e.path === 'statement.threshold' && /Anderson/.test(e.message))).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateSpec: Intangible with explicit threshold accepts discipline branch'() {
    const r = KANBAN_VALIDATORS.validateSpec({
      kind: 'requirement',
      requirementKind: 'Intangible',
      status: 'Backlog',
      statement: { pattern: 'intangible-investment', work: 'w', benefit: 'b', threshold: 'when NPS > 70' },
    });
    expect(r.errors.some(e => e.path === 'statement.threshold')).toBe(false);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateSpec: Standard without flow-driven source is rejected'() {
    const r = KANBAN_VALIDATORS.validateSpec({
      kind: 'requirement',
      requirementKind: 'Standard',
      status: 'Backlog',
      statement: fullyFilled('service-request'),
      source: { type: 'ops-incident' },
    });
    expect(r.errors.some(e => e.path === 'source.type')).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateSpec: Standard with no source at all is rejected'() {
    const r = KANBAN_VALIDATORS.validateSpec({
      kind: 'requirement',
      requirementKind: 'Standard',
      status: 'Backlog',
      statement: fullyFilled('service-request'),
    });
    expect(r.errors.some(e => e.path === 'source.type')).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateSpec: Standard with flow-metric source accepts'() {
    const r = KANBAN_VALIDATORS.validateSpec({
      kind: 'requirement',
      requirementKind: 'Standard',
      status: 'Backlog',
      statement: fullyFilled('service-request'),
      source: { type: 'flow-metric' },
    });
    expect(r.errors.some(e => e.path === 'source.type')).toBe(false);
    expect(r.ok).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateSpec: non-requirement kind short-circuits discipline checks'() {
    const r = KANBAN_VALIDATORS.validateSpec({ kind: 'feature' });
    expect(r.ok).toBe(true);
  }

  // ═══ status workflow rework loops ═══

  @Verifies<RequirementCommandsFeature>('projectCanDefineCustomStatusWorkflow')
  'status workflow declares Testing→Development and Ready→Development rework loops'() {
    const ts = KANBAN_VOCABULARY.statusWorkflow.transitions;
    expect(ts.some(t => t.from === 'Testing' && t.to === 'Development')).toBe(true);
    expect(ts.some(t => t.from === 'Ready' && t.to === 'Development')).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('projectCanDefineCustomRiskTaxonomy')
  'riskTaxonomy cells reference declared levels'() {
    const levels = new Set(KANBAN_VOCABULARY.riskTaxonomy.levels);
    for (const cell of KANBAN_VOCABULARY.riskTaxonomy.matrix!.cells) {
      expect(levels.has(cell.level)).toBe(true);
    }
  }

  // ═══ Reporter — renderStatement ═══

  @Verifies<RequirementCommandsFeature>('requirementListShowsCoveragePerRequirement')
  'renderStatement templates each pattern'() {
    for (const p of KANBAN_VOCABULARY.statementPatterns) {
      const stmt = fullyFilled(p.pattern);
      const rendered = KANBAN_REPORTER.renderStatement(stmt);
      expect(rendered.length).toBeGreaterThan(0);
      // Every slot value must appear in the rendered output.
      for (const slot of p.slots) expect(rendered).toContain(stmt[slot.name]);
    }
  }

  @Verifies<RequirementCommandsFeature>('requirementListShowsCoveragePerRequirement')
  'renderStatement substitutes ellipsis for missing slot values'() {
    const rendered = KANBAN_REPORTER.renderStatement({ pattern: 'service-request' });
    expect(rendered).toContain('…');
  }

  @Verifies<RequirementCommandsFeature>('requirementListShowsCoveragePerRequirement')
  'renderStatement falls back to JSON.stringify for unknown pattern'() {
    const stmt = { pattern: 'unknown', foo: 'bar' };
    const rendered = KANBAN_REPORTER.renderStatement(stmt);
    expect(rendered).toBe(JSON.stringify(stmt));
  }

  @Verifies<RequirementCommandsFeature>('requirementListShowsCoveragePerRequirement')
  'renderStatement returns empty string for non-object'() {
    expect(KANBAN_REPORTER.renderStatement(null)).toBe('');
    expect(KANBAN_REPORTER.renderStatement(undefined)).toBe('');
    expect(KANBAN_REPORTER.renderStatement(42)).toBe('');
  }

  // ═══ Reporter — renderRequirement ═══

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'renderRequirement includes id, title, kind, status, priority and statement'() {
    const spec = {
      kind: 'requirement',
      id: 'REQ-1',
      title: 'Ship the thing',
      requirementKind: 'Standard',
      status: 'Selected',
      priority: 'High',
      verificationMethod: 'LeadTimeWithinSLE',
      statement: fullyFilled('service-request'),
    };
    const out = KANBAN_REPORTER.renderRequirement(spec);
    expect(out).toContain('REQ-1');
    expect(out).toContain('Ship the thing');
    expect(out).toContain('Standard');
    expect(out).toContain('Selected');
    expect(out).toContain('High');
    expect(out).toContain('LeadTimeWithinSLE');
    expect(out).toContain('val-outcome');
  }

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'renderRequirement returns empty string for non-object'() {
    expect(KANBAN_REPORTER.renderRequirement(null)).toBe('');
    expect(KANBAN_REPORTER.renderRequirement('nope')).toBe('');
  }

  // ═══ Reporter — renderMarkdown ═══

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'renderMarkdown renders ticket card with fixed-date deadline and penalty prominently'() {
    const spec = {
      kind: 'requirement',
      id: 'REQ-FD',
      title: 'Regulator deadline',
      requirementKind: 'FixedDate',
      status: 'Analysis',
      priority: 'High',
      verificationMethod: 'SlaMet',
      statement: { pattern: 'fixed-date-commitment', deadline: '2026-06-30', deliverable: 'report', penalty: 'fine' },
      fitCriteria: [
        { kind: 'unit-test', description: 'schema validates', status: 'passed' },
        { kind: 'metric', description: 'filed on time', status: 'pending' },
        { kind: 'orphan' }, // exercises description ?? kind fallback
        { }, // exercises '(unnamed criterion)' branch
      ],
      risk: { level: 'DelayHarmFixedDate' },
      statusHistory: [
        { to: 'Backlog', at: '2026-01-01' },
        { state: 'Selected' }, // exercises e.state fallback, missing at
        { }, // exercises '?' fallback
      ],
    };
    const md = KANBAN_REPORTER.renderMarkdown(spec);
    expect(md).toContain('# [FixedDate] REQ-FD — Regulator deadline');
    expect(md).toContain('**Due**: 2026-06-30');
    expect(md).toContain('**Penalty if missed**: fine');
    expect(md).toContain('## Statement');
    expect(md).toContain('## Done when');
    expect(md).toContain('- [x] schema validates');
    expect(md).toContain('- [ ] filed on time');
    expect(md).toContain('- [ ] orphan');
    expect(md).toContain('- [ ] (unnamed criterion)');
    expect(md).toContain('**Delay profile**: DelayHarmFixedDate');
    expect(md).toContain('_history_:');
    expect(md).toContain('Backlog@2026-01-01');
    expect(md).toContain('Selected');
    expect(md).toContain('?');
  }

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'renderMarkdown renders fixed-date without penalty'() {
    const md = KANBAN_REPORTER.renderMarkdown({
      kind: 'requirement', id: 'R', title: 't', requirementKind: 'FixedDate',
      status: 'Backlog', priority: 'Medium', verificationMethod: 'SlaMet',
      statement: { pattern: 'fixed-date-commitment', deadline: '2026-06-30' },
    });
    expect(md).toContain('**Due**: 2026-06-30');
    expect(md).not.toContain('**Penalty if missed**');
  }

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'renderMarkdown renders sla-commitment p85'() {
    const md = KANBAN_REPORTER.renderMarkdown({
      kind: 'requirement', id: 'R', title: 't', requirementKind: 'Standard',
      status: 'Backlog', priority: 'Medium', verificationMethod: 'LeadTimeWithinSLE',
      statement: { pattern: 'sla-commitment', service: 'svc', p85: '5 days', cos: 'Standard' },
    });
    expect(md).toContain('**SLE (p85)**: 5 days');
  }

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'renderMarkdown renders expedite-pull cod and blocking'() {
    const md = KANBAN_REPORTER.renderMarkdown({
      kind: 'requirement', id: 'R', title: 't', requirementKind: 'Expedite',
      status: 'Backlog', priority: 'Critical', verificationMethod: 'BlockerCleared',
      statement: { pattern: 'expedite-pull', work: 'w', blocking: 'flow-A', cod: '1000€/day' },
    });
    expect(md).toContain('**Cost of delay**: 1000€/day');
    expect(md).toContain('**Blocking**: flow-A');
  }

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'renderMarkdown renders expedite-pull with cod but no blocking'() {
    const md = KANBAN_REPORTER.renderMarkdown({
      kind: 'requirement', id: 'R', title: 't', requirementKind: 'Expedite',
      status: 'Backlog', priority: 'Critical', verificationMethod: 'BlockerCleared',
      statement: { pattern: 'expedite-pull', work: 'w', cod: 'urgent' },
    });
    expect(md).toContain('**Cost of delay**: urgent');
    expect(md).not.toContain('**Blocking**');
  }

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'renderMarkdown skips optional sections when fitCriteria, history and risk are empty'() {
    const md = KANBAN_REPORTER.renderMarkdown({
      kind: 'requirement', id: 'R', title: 't', requirementKind: 'Standard',
      status: 'Backlog', priority: 'Medium', verificationMethod: 'LeadTimeWithinSLE',
      statement: fullyFilled('service-request'),
      fitCriteria: [],
      statusHistory: [],
    });
    expect(md).not.toContain('## Done when');
    expect(md).not.toContain('_history_');
    expect(md).not.toContain('**Delay profile**');
  }

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'renderMarkdown handles missing arrays via non-array branch'() {
    const md = KANBAN_REPORTER.renderMarkdown({
      kind: 'requirement', id: 'R', title: 't', requirementKind: 'Standard',
      status: 'Backlog', priority: 'Medium', verificationMethod: 'LeadTimeWithinSLE',
      statement: fullyFilled('service-request'),
      // statusHistory + fitCriteria absent → fallback to []
    });
    expect(md).toContain('# [Standard] R — t');
  }

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'renderMarkdown returns empty string for non-object'() {
    expect(KANBAN_REPORTER.renderMarkdown(null)).toBe('');
    expect(KANBAN_REPORTER.renderMarkdown(undefined)).toBe('');
    expect(KANBAN_REPORTER.renderMarkdown(7)).toBe('');
  }

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'renderMarkdown handles statement criterion status met variant'() {
    const md = KANBAN_REPORTER.renderMarkdown({
      kind: 'requirement', id: 'R', title: 't', requirementKind: 'Standard',
      status: 'Backlog', priority: 'Medium', verificationMethod: 'LeadTimeWithinSLE',
      statement: fullyFilled('service-request'),
      fitCriteria: [{ description: 'served', status: 'met' }],
    });
    expect(md).toContain('- [x] served');
  }

  // ═══ Templates ═══

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  'findTemplate returns each declared template by id'() {
    for (const t of KANBAN_TEMPLATES.templates) {
      expect(KANBAN_TEMPLATES.findTemplate(t.id)?.id).toBe(t.id);
    }
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  'findTemplate returns undefined for unknown id'() {
    expect(KANBAN_TEMPLATES.findTemplate('nope-xyz')).toBeUndefined();
  }

  // ═══ Diff/sync smoke: KanbanStyle bundle wires all parts ═══

  @Verifies<RequirementCommandsFeature>('requirementSyncReusesDiffCore')
  'KanbanStyle bundle exposes id, version, vocabulary, validators, templates, reporter'() {
    expect(KanbanStyle.id).toMatch(/kanban/);
    expect(KanbanStyle.version.length).toBeGreaterThan(0);
    expect(KanbanStyle.vocabulary).toBe(KANBAN_VOCABULARY);
    expect(KanbanStyle.validators).toBe(KANBAN_VALIDATORS);
    expect(KanbanStyle.templates).toBe(KANBAN_TEMPLATES);
    expect(KanbanStyle.reporter).toBe(KANBAN_REPORTER);
    expect(KanbanStyle.fitCriterionAdapters).toEqual([]);
  }

  // ═══ from-feature AC anchor ═══

  @Verifies<RequirementCommandsFeature>('fromFeatureFlagPreFillsFromExistingFeature')
  'sourceKinds expose required slots usable for pre-fill wizard'() {
    for (const sk of KANBAN_VOCABULARY.sourceKinds) {
      expect(sk.slots.some(s => s.required)).toBe(true);
    }
  }

  // ═══ loop AC anchor ═══

  @Verifies<RequirementCommandsFeature>('requirementNewLoopsChildFeaturesUntilEnd')
  'requirementKinds include every Class of Service needed by the wizard loop'() {
    expect(KANBAN_VOCABULARY.requirementKinds).toContain('Standard');
    expect(KANBAN_VOCABULARY.requirementKinds).toContain('Expedite');
    expect(KANBAN_VOCABULARY.requirementKinds).toContain('FixedDate');
    expect(KANBAN_VOCABULARY.requirementKinds).toContain('Intangible');
    expect(KANBAN_VOCABULARY.requirementKinds).toContain('Defect');
    expect(KANBAN_VOCABULARY.requirementKinds).toContain('LifeCycleReset');
  }
}

void KanbanStyleTests;
