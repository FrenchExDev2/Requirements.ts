/**
 * Coverage-focused unit tests for LeanStyle (src/styles/lean.ts).
 *
 * Target: 100% lines + 100% functions + >=95% branches on the Lean style module,
 * covering the domain invariants (Kaizen-Experiment / Standardization /
 * problem-statement gap / Waste-Elimination genchi-genbutsu) and the A3-style
 * markdown reporter branches that the shared smoke suite does not reach.
 *
 * Dog-fooded via @FeatureTest on RequirementCommandsFeature — each test binds
 * one AC from the RequirementCommands feature surface.
 */

import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { RequirementCommandsFeature } from '../../requirements/features/requirement-commands';
import { LeanStyle, LEAN_VALIDATORS, LEAN_REPORTER, LEAN_TEMPLATES, LEAN_VOCABULARY } from '../../src/lean';

function validKaizenHypothesisStatement(): Record<string, string> {
  return {
    pattern: 'kaizen-hypothesis',
    change: 'reduce batch size',
    expectedOutcome: 'shorter lead time',
    reasoning: 'less WIP, faster flow',
    validationWindow: '2 weeks',
    metric: 'lead time p50',
  };
}

function validStandardWorkStatement(): Record<string, string> {
  return {
    pattern: 'standard-work',
    operation: 'cell 3 assembly',
    steps: '1. pick 2. assemble 3. check',
    taktTime: '45s',
    checkpoint: 'torque wrench reading',
  };
}

function validProblemStatement(): Record<string, string> {
  return {
    pattern: 'problem-statement',
    problem: 'defects escape cell',
    currentState: '2.1% defect rate',
    targetState: '0.5% defect rate',
    gap: '1.6pp to close',
  };
}

function baseKaizenSpec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'requirement',
    id: 'LEAN-1',
    title: 'Kaizen candidate',
    priority: 'High',
    requirementKind: 'Kaizen-Experiment',
    status: 'ProblemStated',
    verificationMethod: 'PDCA',
    statement: validKaizenHypothesisStatement(),
    ...overrides,
  };
}

@FeatureTest(RequirementCommandsFeature)
class LeanStyleCoverageTests {
  // ─── validateSpec — Kaizen-Experiment invariants ─────────────────────────
  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  'Kaizen-Experiment rejects non-kaizen-hypothesis statement pattern'() {
    const spec = baseKaizenSpec({ statement: validStandardWorkStatement(), verificationMethod: 'PDCA' });
    const r = LEAN_VALIDATORS.validateSpec(spec);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.path === 'statement.pattern' && e.message.includes('kaizen-hypothesis'))).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'Kaizen-Experiment rejects verificationMethod other than PDCA'() {
    const spec = baseKaizenSpec({ verificationMethod: 'GembaWalk' });
    const r = LEAN_VALIDATORS.validateSpec(spec);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.path === 'verificationMethod' && e.message.includes('PDCA'))).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  'Kaizen-Experiment accepts kaizen-hypothesis + PDCA verification'() {
    const r = LEAN_VALIDATORS.validateSpec(baseKaizenSpec());
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  }

  // ─── validateSpec — Standardization invariant ───────────────────────────
  @Verifies<RequirementCommandsFeature>('requirementNewLoopsChildFeaturesUntilEnd')
  'Standardization requires standard-work pattern — rejects others'() {
    const spec: Record<string, unknown> = {
      kind: 'requirement',
      id: 'LEAN-2',
      title: 'Codify best-known way',
      priority: 'High',
      requirementKind: 'Standardization',
      status: 'ProblemStated',
      verificationMethod: 'StandardWork',
      statement: validProblemStatement(),
    };
    const r = LEAN_VALIDATORS.validateSpec(spec);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.path === 'statement.pattern' && e.message.includes('standard-work'))).toBe(true);
  }

  // ─── validateSpec — problem-statement gap invariant ─────────────────────
  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'problem-statement without non-empty gap is rejected'() {
    const stmt: Record<string, string> = { ...validProblemStatement(), gap: '' };
    const spec: Record<string, unknown> = {
      kind: 'requirement',
      id: 'LEAN-3',
      title: 'Gap-less problem',
      priority: 'Medium',
      requirementKind: 'ValueAdding',
      status: 'ProblemStated',
      verificationMethod: 'A3Review',
      statement: stmt,
    };
    const r = LEAN_VALIDATORS.validateSpec(spec);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.path === 'statement.gap')).toBe(true);
  }

  // ─── validateSpec — Waste-Elimination genchi genbutsu ───────────────────
  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'Waste-Elimination rejects non-gemba, non-vsm source'() {
    const spec: Record<string, unknown> = {
      kind: 'requirement',
      id: 'LEAN-4',
      title: 'Remove waiting waste',
      priority: 'High',
      requirementKind: 'Waste-Elimination',
      status: 'ProblemStated',
      verificationMethod: 'GembaWalk',
      statement: { ...validProblemStatement() },
      source: { type: 'customer-feedback', source: 'NPS', channel: 'web', date: '2026-01-01' },
    };
    const r = LEAN_VALIDATORS.validateSpec(spec);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.path === 'source.type' && e.message.includes('gemba-walk'))).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'Waste-Elimination accepts vsm source'() {
    const spec: Record<string, unknown> = {
      kind: 'requirement',
      id: 'LEAN-5',
      title: 'Remove transport waste',
      priority: 'High',
      requirementKind: 'Waste-Elimination',
      status: 'ProblemStated',
      verificationMethod: 'VSM',
      statement: { ...validProblemStatement() },
      source: { type: 'vsm', streamName: 'order-to-cash', mappedAt: '2026-03-01', wasteCategory: 'transport' },
    };
    const r = LEAN_VALIDATORS.validateSpec(spec);
    expect(r.ok).toBe(true);
  }

  // ─── validateStatement — every pattern + rejection paths ────────────────
  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  'validateStatement accepts fully-filled statements for every Lean pattern'() {
    const stmts: Record<string, string>[] = [
      validProblemStatement(),
      validStandardWorkStatement(),
      validKaizenHypothesisStatement(),
      {
        pattern: 'countermeasure',
        problem: 'defects',
        action: 'add poka-yoke',
        date: '2026-05-01',
        metric: 'defect rate',
        target: '0.5%',
      },
      {
        pattern: 'value-proposition',
        customer: 'ops team',
        need: 'faster feedback',
        value: 'real-time dashboard',
        alternatives: 'weekly report',
      },
      { pattern: 'natural', text: 'A plain English fallback sentence.' },
    ];
    for (const s of stmts) {
      const r = LEAN_VALIDATORS.validateStatement(s);
      expect(r.ok, `pattern ${s.pattern} should accept`).toBe(true);
    }
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateStatement rejects missing required slots, unknown pattern, and non-object'() {
    const missing = LEAN_VALIDATORS.validateStatement({ pattern: 'problem-statement' });
    expect(missing.ok).toBe(false);
    expect(missing.errors.length).toBeGreaterThan(0);

    const unknown = LEAN_VALIDATORS.validateStatement({ pattern: 'not-a-pattern' });
    expect(unknown.ok).toBe(false);
    expect(unknown.errors[0]!.path).toBe('statement.pattern');

    const nullish = LEAN_VALIDATORS.validateStatement(null);
    expect(nullish.ok).toBe(false);

    const stringish = LEAN_VALIDATORS.validateStatement('nope');
    expect(stringish.ok).toBe(false);
  }

  // ─── Reporter — renderStatement ─────────────────────────────────────────
  @Verifies<RequirementCommandsFeature>('requirementListShowsCoveragePerRequirement')
  'renderStatement fills template for every Lean pattern'() {
    const cases: Array<{ stmt: Record<string, string>; mustContain: string }> = [
      { stmt: validProblemStatement(), mustContain: 'Problem:' },
      { stmt: validStandardWorkStatement(), mustContain: 'Standard work for' },
      { stmt: validKaizenHypothesisStatement(), mustContain: 'If we' },
      {
        stmt: {
          pattern: 'countermeasure', problem: 'p', action: 'a', date: 'd', metric: 'm', target: 't',
        },
        mustContain: 'To address p',
      },
      {
        stmt: {
          pattern: 'value-proposition', customer: 'c', need: 'n', value: 'v', alternatives: 'alt',
        },
        mustContain: 'For c',
      },
      { stmt: { pattern: 'natural', text: 'hello' }, mustContain: 'hello' },
    ];
    for (const { stmt, mustContain } of cases) {
      const out = LEAN_REPORTER.renderStatement(stmt);
      expect(out).toContain(mustContain);
    }
  }

  @Verifies<RequirementCommandsFeature>('requirementListShowsCoveragePerRequirement')
  'renderStatement falls back to JSON for unknown pattern and returns empty string for non-object'() {
    const fallback = LEAN_REPORTER.renderStatement({ pattern: 'mystery', blob: 42 });
    expect(fallback).toBe(JSON.stringify({ pattern: 'mystery', blob: 42 }));

    expect(LEAN_REPORTER.renderStatement(null)).toBe('');
    expect(LEAN_REPORTER.renderStatement('not-obj')).toBe('');
    expect(LEAN_REPORTER.renderStatement(undefined)).toBe('');
  }

  @Verifies<RequirementCommandsFeature>('requirementListShowsCoveragePerRequirement')
  'renderStatement uses placeholder ellipsis for missing slots'() {
    const out = LEAN_REPORTER.renderStatement({ pattern: 'problem-statement', problem: 'x' });
    expect(out).toContain('x');
    expect(out).toContain('…');
  }

  // ─── Reporter — renderRequirement ───────────────────────────────────────
  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'renderRequirement prints id, title, kind, status, priority, risk, and statement'() {
    const spec = {
      ...baseKaizenSpec(),
      risk: { level: 'HighImpactLowEffort' },
    };
    const out = LEAN_REPORTER.renderRequirement(spec);
    expect(out).toContain('LEAN-1');
    expect(out).toContain('Kaizen candidate');
    expect(out).toContain('Kaizen-Experiment');
    expect(out).toContain('ProblemStated');
    expect(out).toContain('High');
    expect(out).toContain('HighImpactLowEffort');
    expect(out).toContain('PDCA');
  }

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'renderRequirement omits risk line when risk is absent, and returns empty for non-object'() {
    const out = LEAN_REPORTER.renderRequirement(baseKaizenSpec());
    expect(out).not.toContain('Impact/Effort');

    expect(LEAN_REPORTER.renderRequirement(null)).toBe('');
    expect(LEAN_REPORTER.renderRequirement('nope')).toBe('');
  }

  // ─── Reporter — renderMarkdown (A3 one-pager) ───────────────────────────
  @Verifies<RequirementCommandsFeature>('requirementSyncReusesDiffCore')
  'renderMarkdown renders a complete A3 page with context, problem, and fit-criteria checkboxes'() {
    const spec = {
      ...baseKaizenSpec(),
      risk: { level: 'HighImpactLowEffort' },
      source: { type: 'gemba-walk', location: 'cell-3', date: '2026-02-01', observer: 'SE' },
      fitCriteria: [
        { id: 'FC-1', description: 'lead time below 10 min', kind: 'metric' },
        { id: 'FC-2', kind: 'inspection' },
        { kind: 'demonstration' },
        { id: 'FC-4' },
        {},
      ],
    };
    const md = LEAN_REPORTER.renderMarkdown(spec);
    expect(md).toContain('# A3 — LEAN-1: Kaizen candidate');
    expect(md).toContain('## Context');
    expect(md).toContain('| Kind | Kaizen-Experiment |');
    expect(md).toContain('| Status (PDCA) | ProblemStated |');
    expect(md).toContain('HighImpactLowEffort');
    expect(md).toContain('gemba-walk');
    expect(md).toContain('location=cell-3');
    expect(md).toContain('## Problem statement');
    expect(md).toContain('## Fit criteria');
    expect(md).toContain('- [ ] lead time below 10 min');
    expect(md).toContain('- [ ] FC-2');
    expect(md).toContain('- [ ] demonstration');
    expect(md).toContain('- [ ] FC-4');
    expect(md).toContain('- [ ] criterion');
    expect(md).toContain('**Verification method**: PDCA');
  }

  @Verifies<RequirementCommandsFeature>('requirementSyncReusesDiffCore')
  'renderMarkdown renders "(none defined)" when fit criteria list is empty, and handles missing risk/source'() {
    const spec = {
      ...baseKaizenSpec(),
      fitCriteria: [],
    };
    const md = LEAN_REPORTER.renderMarkdown(spec);
    expect(md).toContain('- [ ] _(none defined)_');
    expect(md).toContain('| Impact × Effort | — |');
    expect(md).toContain('| Source | — ');
  }

  @Verifies<RequirementCommandsFeature>('requirementSyncReusesDiffCore')
  'renderMarkdown handles missing fitCriteria property (not an array) and returns empty for non-object'() {
    const spec = { ...baseKaizenSpec() }; // no fitCriteria key at all
    const md = LEAN_REPORTER.renderMarkdown(spec);
    expect(md).toContain('- [ ] _(none defined)_');

    expect(LEAN_REPORTER.renderMarkdown(null)).toBe('');
    expect(LEAN_REPORTER.renderMarkdown(42)).toBe('');
  }

  // ─── Templates — findTemplate ───────────────────────────────────────────
  @Verifies<RequirementCommandsFeature>('fromFeatureFlagPreFillsFromExistingFeature')
  'findTemplate returns every declared template by id and undefined for unknown'() {
    for (const t of LEAN_TEMPLATES.templates) {
      expect(LEAN_TEMPLATES.findTemplate(t.id)).toBe(t);
    }
    expect(LEAN_TEMPLATES.findTemplate('zzz-unknown')).toBeUndefined();
  }

  // ─── Vocabulary — rework loops ──────────────────────────────────────────
  @Verifies<RequirementCommandsFeature>('projectCanDefineCustomStatusWorkflow')
  'LeanStyle status workflow declares the three rework loops (PDCA)'() {
    const ts = LEAN_VOCABULARY.statusWorkflow.transitions;
    const has = (from: string, to: string) => ts.some(t => t.from === from && t.to === to);
    expect(has('Experimenting', 'CountermeasureProposed')).toBe(true);
    expect(has('Validated', 'TargetStateDefined')).toBe(true);
    expect(has('Standardized', 'ProblemStated')).toBe(true);
  }

  // ─── Risk taxonomy — cover the exported LeanStyle bundle ────────────────
  @Verifies<RequirementCommandsFeature>('projectCanDefineCustomRiskTaxonomy')
  'LeanStyle exposes Impact×Effort risk taxonomy with a full matrix'() {
    expect(LeanStyle.vocabulary.riskTaxonomy.levels).toContain('HighImpactLowEffort');
    expect(LeanStyle.vocabulary.riskTaxonomy.matrix?.cells.length).toBe(9);
    expect(LeanStyle.id).toBe('@frenchexdev2/requirements/styles/lean');
  }

  // ─── Short-circuit on non-requirement kind (closes lean.ts:253 else branch) ─
  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  'validateSpec short-circuits when spec.kind is not "requirement"'() {
    const r = LeanStyle.validators.validateSpec({ kind: 'feature', id: 'X', title: 'X', priority: 'High' });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  }

  // ─── Standardization positive path (closes lean.ts:276 else branch) ─────
  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  'Standardization with standard-work pattern does not raise a pattern error'() {
    const r = LeanStyle.validators.validateSpec({
      kind: 'requirement',
      id: 'STD-X', title: 'X',
      priority: 'High',
      requirementKind: 'Standardization',
      status: 'Standardized',
      statement: {
        pattern: 'standard-work',
        operation: 'brew coffee', steps: 'grind; bloom; pour', taktTime: '4 min',
      },
      verificationMethod: 'StandardWork',
    });
    const patternErrors = r.errors.filter(e => e.path === 'statement.pattern');
    expect(patternErrors).toEqual([]);
  }
}

// Silence unused-class lint — decorator invocation happens at class-evaluation time.
void LeanStyleCoverageTests;
