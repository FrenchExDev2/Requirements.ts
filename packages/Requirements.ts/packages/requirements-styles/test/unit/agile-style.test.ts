/**
 * Dedicated coverage tests for AgileStyle (src/styles/agile.ts).
 *
 * Exercises every branch of AGILE_VALIDATORS.validateStatement / validateSpec,
 * AGILE_REPORTER.renderStatement / renderRequirement / renderMarkdown, and
 * AGILE_TEMPLATES.findTemplate. Dog-fooded via @FeatureTest on
 * RequirementCommandsFeature — Agile is the canonical example of a project
 * shipping its own status workflow, risk taxonomy, statement patterns and
 * acceptance-test conventions.
 */

import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { RequirementCommandsFeature } from '../../requirements/features/requirement-commands';
import {
  AGILE_VOCABULARY,
  AGILE_VALIDATORS,
  AGILE_TEMPLATES,
  AGILE_REPORTER,
  AgileStyle,
} from '../../src/agile';

function baseReq(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'requirement',
    id: 'US-1',
    title: 'Checkout loyalty points',
    priority: 'High',
    requirementKind: 'UserStory',
    status: 'Backlog',
    statement: {
      pattern: 'user-story',
      role: 'returning customer',
      capability: 'redeem loyalty points at checkout',
      benefit: 'I feel rewarded for repeat business',
    },
    ...overrides,
  };
}

@FeatureTest(RequirementCommandsFeature)
class AgileStyleTests {
  // ── Status workflow rework loops ─────────────────────────────────────────

  @Verifies<RequirementCommandsFeature>('projectCanDefineCustomStatusWorkflow')
  'rework transitions InReview→InProgress and Ready→Refined are declared'() {
    const transitions = AGILE_VOCABULARY.statusWorkflow.transitions;
    expect(transitions).toContainEqual({ from: 'InReview', to: 'InProgress' });
    expect(transitions).toContainEqual({ from: 'Ready', to: 'Refined' });
    expect(AGILE_VOCABULARY.statusWorkflow.initial).toBe('Backlog');
    expect(AGILE_VOCABULARY.statusWorkflow.terminal).toContain('Archived');
    expect(AgileStyle.id).toMatch(/agile/);
    expect(AgileStyle.version.length).toBeGreaterThan(0);
    expect(AgileStyle.fitCriterionAdapters).toEqual([]);
  }

  @Verifies<RequirementCommandsFeature>('projectCanDefineCustomRiskTaxonomy')
  'Agile risk taxonomy exposes levels and a likelihood×impact matrix'() {
    const taxo = AGILE_VOCABULARY.riskTaxonomy;
    expect(taxo.levels).toContain('Showstopper');
    expect(taxo.levels).toContain('Trivial');
    expect(taxo.matrix?.axes.likelihood).toContain('Certain');
    expect(taxo.matrix?.axes.impact).toContain('Cosmetic');
    expect(taxo.matrix?.cells.length).toBeGreaterThan(0);
  }

  // ── validateStatement: accept / reject per pattern ───────────────────────

  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  'validateStatement rejects non-object input and unknown pattern'() {
    expect(AGILE_VALIDATORS.validateStatement(null).ok).toBe(false);
    expect(AGILE_VALIDATORS.validateStatement('str').ok).toBe(false);
    expect(AGILE_VALIDATORS.validateStatement(undefined).ok).toBe(false);
    const unknown = AGILE_VALIDATORS.validateStatement({ pattern: 'mystery-pattern' });
    expect(unknown.ok).toBe(false);
    expect(unknown.errors[0]!.path).toBe('statement.pattern');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  'validateStatement accepts fully-filled statements for every Agile pattern'() {
    const cases: Array<Record<string, string>> = [
      { pattern: 'user-story', role: 'r', capability: 'c', benefit: 'b' },
      { pattern: 'given-when-then', precondition: 'p', trigger: 't', outcome: 'o' },
      { pattern: 'epic', epic: 'e', outcome: 'o', kpi: 'k' },
      { pattern: 'enabler', capability: 'c', userStories: 'US-1', riskMitigated: 'r' },
      { pattern: 'spike', question: 'q', timebox: '2 days', deliverable: 'ADR' },
      { pattern: 'bug', summary: 's', expected: 'e', actual: 'a', repro: 'steps' },
      { pattern: 'natural', text: 'hello' },
    ];
    for (const stmt of cases) {
      const res = AGILE_VALIDATORS.validateStatement(stmt);
      expect(res.ok, `${stmt.pattern}: ${JSON.stringify(res)}`).toBe(true);
    }
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'validateStatement reports missing required slots per pattern'() {
    const res = AGILE_VALIDATORS.validateStatement({ pattern: 'user-story', role: 'r' });
    expect(res.ok).toBe(false);
    const paths = res.errors.map(e => e.path);
    expect(paths).toContain('statement.capability');
    expect(paths).toContain('statement.benefit');

    const empty = AGILE_VALIDATORS.validateStatement({ pattern: 'bug', summary: '', expected: 'e', actual: 'a', repro: 'r' });
    expect(empty.ok).toBe(false);
  }

  // ── validateSpec top-level guards ────────────────────────────────────────

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  'validateSpec rejects non-object and ignores non-requirement kind'() {
    expect(AGILE_VALIDATORS.validateSpec(null).ok).toBe(false);
    expect(AGILE_VALIDATORS.validateSpec(42).ok).toBe(false);
    // kind !== 'requirement' → skipped, returns ok
    const skipped = AGILE_VALIDATORS.validateSpec({ kind: 'feature' });
    expect(skipped.ok).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  'validateSpec rejects unknown requirementKind and unknown status'() {
    const bad = AGILE_VALIDATORS.validateSpec(baseReq({ requirementKind: 'Nope', status: 'Nowhere' }));
    expect(bad.ok).toBe(false);
    const paths = bad.errors.map(e => e.path);
    expect(paths).toContain('requirementKind');
    expect(paths).toContain('status');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  'validateSpec accepts a well-formed UserStory'() {
    const res = AGILE_VALIDATORS.validateSpec(baseReq());
    expect(res.ok, JSON.stringify(res)).toBe(true);
  }

  // ── Rule 1: UserStory ────────────────────────────────────────────────────

  @Verifies<RequirementCommandsFeature>('requirementNewLoopsChildFeaturesUntilEnd')
  'UserStory kind rejects patterns that are not user-story or given-when-then'() {
    const res = AGILE_VALIDATORS.validateSpec(baseReq({
      statement: { pattern: 'natural', text: 'just words' },
    }));
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.message.includes('UserStory kind requires'))).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewLoopsChildFeaturesUntilEnd')
  'UserStory kind accepts given-when-then pattern'() {
    const res = AGILE_VALIDATORS.validateSpec(baseReq({
      statement: { pattern: 'given-when-then', precondition: 'p', trigger: 't', outcome: 'o' },
    }));
    expect(res.ok, JSON.stringify(res)).toBe(true);
  }

  // ── Rule 2: Epic ─────────────────────────────────────────────────────────

  @Verifies<RequirementCommandsFeature>('projectCanDefineCustomStatusWorkflow')
  'Epic kind rejects wrong pattern'() {
    const res = AGILE_VALIDATORS.validateSpec(baseReq({
      requirementKind: 'Epic',
      statement: { pattern: 'user-story', role: 'r', capability: 'c', benefit: 'b' },
    }));
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.message.includes("Epic kind requires 'epic' pattern"))).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('projectCanDefineCustomStatusWorkflow')
  'Epic kind with epic pattern but empty kpi is rejected'() {
    const res = AGILE_VALIDATORS.validateSpec(baseReq({
      requirementKind: 'Epic',
      statement: { pattern: 'epic', epic: 'e', outcome: 'o', kpi: '' },
    }));
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.path === 'statement.kpi')).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('projectCanDefineCustomStatusWorkflow')
  'Epic kind with epic pattern and kpi validates'() {
    const res = AGILE_VALIDATORS.validateSpec(baseReq({
      requirementKind: 'Epic',
      statement: { pattern: 'epic', epic: 'e', outcome: 'o', kpi: 'NPS ≥ 50' },
    }));
    expect(res.ok, JSON.stringify(res)).toBe(true);
  }

  // ── Rule 3: Spike ────────────────────────────────────────────────────────

  @Verifies<RequirementCommandsFeature>('requirementSyncReusesDiffCore')
  'Spike kind rejects non-spike pattern'() {
    const res = AGILE_VALIDATORS.validateSpec(baseReq({
      requirementKind: 'Spike',
      statement: { pattern: 'natural', text: 'investigate' },
    }));
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.message.includes("Spike kind requires 'spike' pattern"))).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementSyncReusesDiffCore')
  'Spike kind with spike pattern but empty timebox is rejected'() {
    const res = AGILE_VALIDATORS.validateSpec(baseReq({
      requirementKind: 'Spike',
      statement: { pattern: 'spike', question: 'q', timebox: '', deliverable: 'd' },
    }));
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.path === 'statement.timebox')).toBe(true);
  }

  // ── Rule 4: Bug ──────────────────────────────────────────────────────────

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'Bug kind rejects non-bug pattern'() {
    const res = AGILE_VALIDATORS.validateSpec(baseReq({
      requirementKind: 'Bug',
      statement: { pattern: 'natural', text: 'broken' },
    }));
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.message.includes("Bug kind requires 'bug' pattern"))).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'Bug kind with bug pattern but missing repro is rejected'() {
    const res = AGILE_VALIDATORS.validateSpec(baseReq({
      requirementKind: 'Bug',
      statement: { pattern: 'bug', summary: 's', expected: 'e', actual: 'a', repro: '' },
    }));
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.path === 'statement.repro')).toBe(true);
  }

  // ── Positive paths: Spike + timebox OK, Bug + repro OK (closes the
  // happy-path branches of rules 3 and 4).
  @Verifies<RequirementCommandsFeature>('requirementSyncReusesDiffCore')
  'Spike with spike pattern AND non-empty timebox passes rule 3'() {
    const res = AGILE_VALIDATORS.validateSpec(baseReq({
      requirementKind: 'Spike',
      statement: { pattern: 'spike', question: 'q', timebox: '3 days', deliverable: 'ADR' },
    }));
    expect(res.errors.some(e => e.path === 'statement.timebox')).toBe(false);
  }

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'Bug with bug pattern AND non-empty repro passes rule 4'() {
    const res = AGILE_VALIDATORS.validateSpec(baseReq({
      requirementKind: 'Bug',
      statement: { pattern: 'bug', summary: 's', expected: 'e', actual: 'a', repro: '1. do X' },
    }));
    expect(res.errors.some(e => e.path === 'statement.repro')).toBe(false);
  }

  // ── Rule 5: INVEST Valuable ──────────────────────────────────────────────

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'user-story pattern without benefit slot fails INVEST check'() {
    // Note: validateStatement will also reject missing required slots, so this
    // exercises both the INVEST branch and the downstream statement check.
    const res = AGILE_VALIDATORS.validateSpec(baseReq({
      statement: { pattern: 'user-story', role: 'r', capability: 'c', benefit: '' },
    }));
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => e.path === 'statement.benefit')).toBe(true);
  }

  // ── Reporter: renderStatement ────────────────────────────────────────────

  @Verifies<RequirementCommandsFeature>('requirementListShowsCoveragePerRequirement')
  'renderStatement templates each pattern and falls back on unknown/non-object'() {
    // Non-object → ''
    expect(AGILE_REPORTER.renderStatement(null)).toBe('');
    expect(AGILE_REPORTER.renderStatement(123)).toBe('');
    // Unknown pattern → JSON.stringify fallback
    const fb = AGILE_REPORTER.renderStatement({ pattern: 'zzz', foo: 1 });
    expect(fb).toBe(JSON.stringify({ pattern: 'zzz', foo: 1 }));
    // Template each registered pattern (covers the slot-replace loop + '…' fallback)
    for (const p of AGILE_VOCABULARY.statementPatterns) {
      const full: Record<string, string> = { pattern: p.pattern };
      for (const slot of p.slots) full[slot.name] = `<${slot.name}>`;
      const rendered = AGILE_REPORTER.renderStatement(full);
      expect(rendered.length).toBeGreaterThan(0);
      for (const slot of p.slots) expect(rendered).toContain(`<${slot.name}>`);
    }
    // Missing slot → '…' substitution branch
    const dots = AGILE_REPORTER.renderStatement({ pattern: 'user-story', role: 'R' });
    expect(dots).toContain('…');
  }

  // ── Reporter: renderRequirement ──────────────────────────────────────────

  @Verifies<RequirementCommandsFeature>('requirementListShowsCoveragePerRequirement')
  'renderRequirement returns empty on non-object and includes key fields otherwise'() {
    expect(AGILE_REPORTER.renderRequirement(null)).toBe('');
    expect(AGILE_REPORTER.renderRequirement('x')).toBe('');
    const out = AGILE_REPORTER.renderRequirement(baseReq({
      verificationMethod: 'AcceptanceTest',
      risk: { level: 'High' },
    }));
    expect(out).toContain('US-1');
    expect(out).toContain('Checkout loyalty points');
    expect(out).toContain('UserStory');
    expect(out).toContain('Backlog');
    expect(out).toContain('High');
    expect(out).toContain('AcceptanceTest');
    // Risk missing → "—" fallback branch
    const noRisk = AGILE_REPORTER.renderRequirement(baseReq());
    expect(noRisk).toContain('—');
  }

  // ── Reporter: renderMarkdown branches ────────────────────────────────────

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'renderMarkdown returns empty for non-object'() {
    expect(AGILE_REPORTER.renderMarkdown(null)).toBe('');
    expect(AGILE_REPORTER.renderMarkdown('nope')).toBe('');
  }

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'renderMarkdown renders a full story card with AC checkboxes and footer'() {
    const md = AGILE_REPORTER.renderMarkdown(baseReq({
      fitCriteria: [
        { kind: 'unit-test', id: 'AC-1', description: 'Points deducted on checkout' },
        { kind: 'demonstration', id: 'AC-2' }, // no description → id fallback
        { kind: 'narrative', description: 'ignored narrative' },
      ],
      source: { type: 'product-owner', name: 'Alice', date: '2026-04-01' },
      risk: { level: 'Medium' },
    }));
    expect(md).toMatch(/^# US-1 — Checkout loyalty points/);
    expect(md).toContain('> As a returning customer');
    expect(md).toContain('## Acceptance criteria');
    expect(md).toContain('- [ ] Points deducted on checkout');
    expect(md).toContain('- [ ] AC-2');
    expect(md).not.toContain('ignored narrative');
    expect(md).toContain('**Source**: product-owner');
    expect(md).toContain('**Priority**: High');
    expect(md).toContain('**Status**: Backlog');
    expect(md).toContain('**Risk**: Medium');
  }

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'renderMarkdown shows empty-AC placeholder when no unit-test/demonstration criteria'() {
    // Branch: acs.length === 0
    const mdNoFits = AGILE_REPORTER.renderMarkdown(baseReq());
    expect(mdNoFits).toContain('- [ ] _(no acceptance criteria defined yet)_');
    expect(mdNoFits).toContain('**Risk**: —');
    expect(mdNoFits).toContain('**Source**: —');

    // Branch: fitCriteria present but none match unit-test/demonstration
    const mdOnlyNarrative = AGILE_REPORTER.renderMarkdown(baseReq({
      fitCriteria: [{ kind: 'narrative', description: 'background context' }],
    }));
    expect(mdOnlyNarrative).toContain('- [ ] _(no acceptance criteria defined yet)_');

    // Branch: ac.description missing AND ac.id missing → 'criterion' fallback
    const mdFallback = AGILE_REPORTER.renderMarkdown(baseReq({
      fitCriteria: [{ kind: 'unit-test' }],
    }));
    expect(mdFallback).toContain('- [ ] criterion');

    // Branch: fitCriteria is not an array → treated as empty
    const mdNonArray = AGILE_REPORTER.renderMarkdown(baseReq({ fitCriteria: 'oops' }));
    expect(mdNonArray).toContain('- [ ] _(no acceptance criteria defined yet)_');
  }

  // ── Templates ────────────────────────────────────────────────────────────

  @Verifies<RequirementCommandsFeature>('fromFeatureFlagPreFillsFromExistingFeature')
  'findTemplate returns each registered template by id and undefined otherwise'() {
    expect(AGILE_TEMPLATES.templates.length).toBeGreaterThan(0);
    for (const t of AGILE_TEMPLATES.templates) {
      const found = AGILE_TEMPLATES.findTemplate(t.id);
      expect(found, `findTemplate(${t.id})`).toBeDefined();
      expect(found!.id).toBe(t.id);
      expect(found!.skeleton).toBeDefined();
    }
    expect(AGILE_TEMPLATES.findTemplate('not-a-real-id')).toBeUndefined();
  }
}

// Silence unused-class lint — decorator invocation happens at class-evaluation time.
void AgileStyleTests;
