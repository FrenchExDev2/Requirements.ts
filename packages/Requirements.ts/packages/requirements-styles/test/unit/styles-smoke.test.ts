/**
 * Smoke tests for the 5 built-in RequirementStyle presets.
 *
 * Each Style is essentially a typed data module; this file exercises every
 * preset's vocabulary / validators / templates / reporter surface so the
 * self-imposed 100% coverage gate holds. Dog-fooded via @FeatureTest on
 * RequirementCommandsFeature (the Feature that owns "projects can define
 * custom status workflow" and "custom risk taxonomy" ACs — which these
 * presets exemplify).
 */

import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { RequirementCommandsFeature } from '../../requirements/features/requirement-commands';
import {
  DefaultStyle,
  IndustrialStyle,
  DEFAULT_STYLE_REGISTRY,
  BUILT_IN_STYLES,
  createStyleRegistry,
} from '../../src/index';
import type { RequirementStyle } from '@frenchexdev2/requirements-core';

// Discover every built-in Style via the registry — adding a new Style there
// auto-extends every iterating test below (OCP). No hardcoded list to maintain.
const ALL_STYLES: ReadonlyArray<{ readonly name: string; readonly style: RequirementStyle }> =
  DEFAULT_STYLE_REGISTRY.list().map((style) => ({
    // 'Default' / 'Industrial' / 'Lean' / 'Agile' / 'Kanban' from '@…/styles/default' etc.
    name: style.id.split('/').pop()!.replace(/^./, (c) => c.toUpperCase()),
    style,
  }));

function validReqShape(style: RequirementStyle): Record<string, unknown> {
  const kind = style.vocabulary.requirementKinds[0]!;
  const statusInitial = style.vocabulary.statusWorkflow.initial;
  const pattern = style.vocabulary.statementPatterns[0]!;
  const statement: Record<string, unknown> = { pattern: pattern.pattern };
  for (const slot of pattern.slots) if (slot.required) statement[slot.name] = 'filler';
  return {
    kind: 'requirement',
    id: 'REQ-X',
    title: 'X',
    priority: 'High',
    requirementKind: kind,
    status: statusInitial,
    statement,
  };
}

@FeatureTest(RequirementCommandsFeature)
class StylesSmokeTests {
  @Verifies<RequirementCommandsFeature>('projectCanDefineCustomStatusWorkflow')
  'every preset declares a non-empty statusWorkflow with a legal initial state'() {
    for (const { name, style } of ALL_STYLES) {
      const sw = style.vocabulary.statusWorkflow;
      expect(sw.states.length, `${name}: states`).toBeGreaterThan(0);
      expect(sw.states, `${name}: initial is a declared state`).toContain(sw.initial);
      for (const t of sw.transitions) {
        expect(sw.states, `${name}: transition.from ${t.from} is declared`).toContain(t.from);
        expect(sw.states, `${name}: transition.to ${t.to} is declared`).toContain(t.to);
      }
    }
  }

  @Verifies<RequirementCommandsFeature>('projectCanDefineCustomRiskTaxonomy')
  'every preset declares a non-empty risk taxonomy'() {
    for (const { name, style } of ALL_STYLES) {
      expect(style.vocabulary.riskTaxonomy.levels.length, `${name}: levels`).toBeGreaterThan(0);
    }
  }

  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  'every preset declares at least one statement pattern with a non-empty template'() {
    for (const { name, style } of ALL_STYLES) {
      expect(style.vocabulary.statementPatterns.length, `${name}: patterns`).toBeGreaterThan(0);
      for (const p of style.vocabulary.statementPatterns) {
        expect(p.template.length, `${name}: pattern ${p.pattern} template`).toBeGreaterThan(0);
      }
    }
  }

  @Verifies<RequirementCommandsFeature>('requirementListShowsCoveragePerRequirement')
  'every preset reporter can render a statement through every pattern template'() {
    for (const { name, style } of ALL_STYLES) {
      for (const p of style.vocabulary.statementPatterns) {
        const stmt: Record<string, string> = { pattern: p.pattern };
        for (const slot of p.slots) stmt[slot.name] = 'x';
        const rendered = style.reporter.renderStatement(stmt);
        expect(rendered.length, `${name}/${p.pattern}: rendered`).toBeGreaterThan(0);
      }
      // Full spec rendering (console + markdown)
      const spec = validReqShape(style);
      expect(style.reporter.renderRequirement(spec).length).toBeGreaterThan(0);
      expect(style.reporter.renderMarkdown(spec).length).toBeGreaterThan(0);
    }
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'every preset validateStatement rejects a known pattern with missing required slots'() {
    // Pick the first pattern of each style that has at least one required slot, and
    // submit it without the slot — this exercises the per-slot required-check branch
    // that universal "garbage" inputs cannot reach.
    for (const { name, style } of ALL_STYLES) {
      const pat = style.vocabulary.statementPatterns.find(p => p.slots.some(s => s.required));
      if (!pat) continue;
      const r = style.validators.validateStatement({ pattern: pat.pattern });
      expect(r.ok, `${name}: required-slot rejection`).toBe(false);
    }
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  'every preset validator rejects malformed input'() {
    // Each style has its own domain invariants (Kanban: Standard → flow-driven source;
    // Industrial: Safety → SIL level; …) so a universal "valid" factory would have
    // to re-encode every rule. The positive path is covered by the per-style unit
    // tests in requirement-core. Here we assert the universal reject paths — these
    // exercise every style's validator entry points, which is what coverage needs.
    for (const { name, style } of ALL_STYLES) {
      const bad = style.validators.validateSpec('not-an-object');
      expect(bad.ok, `${name}: garbage must reject`).toBe(false);

      const badPattern = style.validators.validateStatement({ pattern: 'does-not-exist' });
      expect(badPattern.ok, `${name}: unknown pattern must reject`).toBe(false);

      const badSpec = style.validators.validateSpec({ kind: 'requirement', status: 'not-a-state' });
      expect(badSpec.ok, `${name}: unknown status must reject`).toBe(false);
    }

    // Positive path for Default only (its validator has no domain-specific rules
    // beyond pattern + kind + status membership).
    const good = DefaultStyle.validators.validateSpec(validReqShape(DefaultStyle));
    expect(good.ok, `Default: well-formed must validate — ${JSON.stringify(good)}`).toBe(true);

    // Non-requirement kind (e.g. a Feature spec passed to the same validator)
    // must skip requirementKind/status/statement checks and only enforce the
    // shared id/title/priority triplet — hits the kind !== 'requirement' branch.
    const feat = DefaultStyle.validators.validateSpec({ kind: 'feature', id: 'F-1', title: 'T', priority: 'High' });
    expect(feat.ok, 'Default: non-requirement kind skips requirement checks').toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  'every preset templates list is non-empty and findTemplate works for every id'() {
    for (const { name, style } of ALL_STYLES) {
      const list = style.templates.templates;
      expect(list.length, `${name}: templates`).toBeGreaterThan(0);
      for (const t of list) {
        expect(style.templates.findTemplate(t.id), `${name}: findTemplate(${t.id})`).toBeDefined();
      }
      expect(style.templates.findTemplate('unknown-id-xyz'), `${name}: unknown template`).toBeUndefined();
    }
  }

  @Verifies<RequirementCommandsFeature>('fromFeatureFlagPreFillsFromExistingFeature')
  'every preset declares sourceKinds with at least one slot each'() {
    for (const { name, style } of ALL_STYLES) {
      expect(style.vocabulary.sourceKinds.length, `${name}: sourceKinds`).toBeGreaterThan(0);
      for (const sk of style.vocabulary.sourceKinds) {
        expect(sk.kind.length, `${name}: ${sk.kind} non-empty name`).toBeGreaterThan(0);
      }
    }
  }

  @Verifies<RequirementCommandsFeature>('requirementListShowsCoveragePerRequirement')
  'every preset reporter handles defensive non-object input'() {
    for (const { name, style } of ALL_STYLES) {
      expect(style.reporter.renderStatement(null), `${name}: renderStatement null`).toBe('');
      expect(style.reporter.renderStatement('not-an-object'), `${name}: renderStatement string`).toBe('');
      expect(style.reporter.renderRequirement(null), `${name}: renderRequirement null`).toBe('');
      expect(style.reporter.renderMarkdown(null), `${name}: renderMarkdown null`).toBe('');
    }
  }

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'every preset reporter falls back to JSON.stringify on unknown pattern'() {
    for (const { name, style } of ALL_STYLES) {
      const out = style.reporter.renderStatement({ pattern: 'unknown-pattern-xyz', foo: 'bar' });
      expect(out, `${name}: unknown pattern fallback`).toContain('unknown-pattern-xyz');
    }
  }

  @Verifies<RequirementCommandsFeature>('requirementListShowsCoveragePerRequirement')
  'every preset reporter substitutes ellipsis for missing pattern slots'() {
    for (const { name, style } of ALL_STYLES) {
      const pat = style.vocabulary.statementPatterns.find(p => p.slots.some(s => s.required));
      if (!pat) continue;
      // Submit a statement with the pattern but ZERO slots populated → renderer must
      // use the '…' fallback for each {slot} placeholder.
      const out = style.reporter.renderStatement({ pattern: pat.pattern });
      expect(out, `${name}: ellipsis fallback`).toContain('…');
    }
  }

  // ── StyleRegistry surface (OCP for project-defined Styles) ─────────────

  @Verifies<RequirementCommandsFeature>('projectCanDefineCustomStatusWorkflow')
  'BUILT_IN_STYLES contains all five canonical presets in canonical order'() {
    const ids = BUILT_IN_STYLES.map(s => s.id);
    expect(ids).toEqual([
      '@frenchexdev2/requirements/styles/default',
      '@frenchexdev2/requirements/styles/industrial',
      '@frenchexdev2/requirements/styles/lean',
      '@frenchexdev2/requirements/styles/agile',
      '@frenchexdev2/requirements/styles/kanban',
    ]);
  }

  @Verifies<RequirementCommandsFeature>('projectCanDefineCustomStatusWorkflow')
  'DEFAULT_STYLE_REGISTRY.get returns the matching Style by id and undefined otherwise'() {
    expect(DEFAULT_STYLE_REGISTRY.get(DefaultStyle.id)).toBe(DefaultStyle);
    expect(DEFAULT_STYLE_REGISTRY.get(IndustrialStyle.id)).toBe(IndustrialStyle);
    expect(DEFAULT_STYLE_REGISTRY.get('unknown-style-id-xyz')).toBeUndefined();
  }

  @Verifies<RequirementCommandsFeature>('projectCanDefineCustomStatusWorkflow')
  'createStyleRegistry produces an isolated, mutable registry (OCP)'() {
    const empty = createStyleRegistry([]);
    expect(empty.list()).toEqual([]);

    empty.register(DefaultStyle);
    expect(empty.list()).toEqual([DefaultStyle]);

    // Re-registering the same id REPLACES rather than appending — order preserved.
    const fakeOverride: RequirementStyle = { ...DefaultStyle, version: '999.0.0' };
    empty.register(fakeOverride);
    expect(empty.list()).toEqual([fakeOverride]);
    expect(empty.get(DefaultStyle.id)?.version).toBe('999.0.0');

    // Registering a NEW id appends (covers the 'new id' branch of register()).
    empty.register(IndustrialStyle);
    expect(empty.list().map(s => s.id)).toEqual([DefaultStyle.id, IndustrialStyle.id]);
  }
}

// Silence unused-class lint — decorator invocation happens at class-evaluation time.
void StylesSmokeTests;
