/**
 * Targeted coverage test for src/styles/industrial.ts — drives the validator
 * domain rules (Safety→SIL, safety-function→SIL verification, Regulatory→
 * standard source) and the Markdown reporter paths that the smoke test skips.
 *
 * Dog-fooded on RequirementCommandsFeature (owner of custom-workflow /
 * custom-risk-taxonomy ACs that the IndustrialStyle exemplifies).
 */

import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { RequirementCommandsFeature } from '../../requirements/features/requirement-commands';
import {
  INDUSTRIAL_VOCABULARY,
  INDUSTRIAL_VALIDATORS,
  INDUSTRIAL_TEMPLATES,
  INDUSTRIAL_REPORTER,
} from '../../src/industrial';

function baseSafetySpec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'requirement',
    id: 'REQ-S1',
    title: 'Close valve on overpressure',
    priority: 'Critical',
    requirementKind: 'Safety',
    status: 'Draft',
    verificationMethod: 'SILProofTest',
    risk: { level: 'SIL2', ifNotMet: 'Rupture of vessel' },
    statement: {
      pattern: 'safety-function',
      action: 'close XV-101',
      demand: 'PAHH-101 trip',
      responseTime: '2 s',
      silLevel: 'SIL 2',
      proofInterval: '1 year',
    },
    ...overrides,
  };
}

@FeatureTest(RequirementCommandsFeature)
class IndustrialStyleTests {

  // ── Validator domain rules ───────────────────────────────────────────────

  @Verifies<RequirementCommandsFeature>('projectCanDefineCustomRiskTaxonomy')
  'Safety requirement with NonSIL risk is rejected, SIL2 is accepted'() {
    const bad = INDUSTRIAL_VALIDATORS.validateSpec(
      baseSafetySpec({ risk: { level: 'NonSIL', ifNotMet: 'x' } }),
    );
    expect(bad.ok).toBe(false);
    expect(bad.errors.some(e => e.path === 'risk.level')).toBe(true);

    // Also: risk missing entirely
    const missing = INDUSTRIAL_VALIDATORS.validateSpec(baseSafetySpec({ risk: undefined }));
    expect(missing.ok).toBe(false);
    expect(missing.errors.some(e => e.path === 'risk.level')).toBe(true);

    const good = INDUSTRIAL_VALIDATORS.validateSpec(baseSafetySpec());
    expect(good.ok, JSON.stringify(good)).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  'safety-function statement requires SIL verification method'() {
    const bad = INDUSTRIAL_VALIDATORS.validateSpec(
      baseSafetySpec({ verificationMethod: 'UnitTest' }),
    );
    expect(bad.ok).toBe(false);
    expect(bad.errors.some(e => e.path === 'verificationMethod')).toBe(true);

    const missing = INDUSTRIAL_VALIDATORS.validateSpec(
      baseSafetySpec({ verificationMethod: undefined }),
    );
    expect(missing.ok).toBe(false);
    expect(missing.errors.some(e => e.path === 'verificationMethod')).toBe(true);

    for (const vm of ['SILProofTest', 'SILValidation', 'Certification']) {
      const good = INDUSTRIAL_VALIDATORS.validateSpec(baseSafetySpec({ verificationMethod: vm }));
      expect(good.ok, `${vm}: ${JSON.stringify(good)}`).toBe(true);
    }
  }

  @Verifies<RequirementCommandsFeature>('projectCanDefineCustomStatusWorkflow')
  'Regulatory requirement requires iec/iso/isa/regulation source'() {
    const base = {
      kind: 'requirement',
      id: 'REQ-R1',
      title: 'CE marking',
      priority: 'Critical',
      requirementKind: 'Regulatory',
      status: 'Draft',
      verificationMethod: 'Certification',
      statement: { pattern: 'ubiquitous', response: 'comply with Machinery Directive' },
    };

    const bad = INDUSTRIAL_VALIDATORS.validateSpec({
      ...base,
      source: { type: 'stakeholder' },
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors.some(e => e.path === 'source.type')).toBe(true);

    // Source missing entirely
    const missing = INDUSTRIAL_VALIDATORS.validateSpec(base);
    expect(missing.ok).toBe(false);
    expect(missing.errors.some(e => e.path === 'source.type')).toBe(true);

    for (const type of ['iec-standard', 'iso-standard', 'isa-standard', 'regulation']) {
      const good = INDUSTRIAL_VALIDATORS.validateSpec({
        ...base,
        source: { type, id: 'X', jurisdiction: 'EU', act: 'MD' },
      });
      expect(good.ok, `${type}: ${JSON.stringify(good)}`).toBe(true);
    }
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  'validateSpec rejects unknown requirementKind and unknown status'() {
    const badKind = INDUSTRIAL_VALIDATORS.validateSpec({
      kind: 'requirement',
      requirementKind: 'NotAKind',
      status: 'Draft',
      statement: { pattern: 'ubiquitous', response: 'x' },
    });
    expect(badKind.ok).toBe(false);
    expect(badKind.errors.some(e => e.path === 'requirementKind')).toBe(true);

    const badStatus = INDUSTRIAL_VALIDATORS.validateSpec({
      kind: 'requirement',
      requirementKind: 'Functional',
      status: 'NotAStatus',
      statement: { pattern: 'ubiquitous', response: 'x' },
    });
    expect(badStatus.ok).toBe(false);
    expect(badStatus.errors.some(e => e.path === 'status')).toBe(true);

    // Non-requirement kind short-circuits domain rules (errors array stays empty)
    const nonReq = INDUSTRIAL_VALIDATORS.validateSpec({ kind: 'feature' });
    expect(nonReq.ok).toBe(true);

    // Non-object rejection
    expect(INDUSTRIAL_VALIDATORS.validateSpec(null).ok).toBe(false);
    expect(INDUSTRIAL_VALIDATORS.validateSpec('not-object').ok).toBe(false);

    // validateSpec propagates validateStatement errors into the spec errors list
    const badStatement = INDUSTRIAL_VALIDATORS.validateSpec({
      kind: 'requirement',
      requirementKind: 'Functional',
      status: 'Draft',
      statement: { pattern: 'ubiquitous' }, // response slot missing
    });
    expect(badStatement.ok).toBe(false);
    expect(badStatement.errors.some(e => e.path.startsWith('statement.'))).toBe(true);
  }

  // ── validateStatement — every pattern slot ───────────────────────────────

  @Verifies<RequirementCommandsFeature>('requirementNewLoopsChildFeaturesUntilEnd')
  'validateStatement accepts a filled slot and rejects a missing slot for every pattern'() {
    for (const schema of INDUSTRIAL_VOCABULARY.statementPatterns) {
      const filled: Record<string, unknown> = { pattern: schema.pattern };
      for (const slot of schema.slots) if (slot.required) filled[slot.name] = 'x';
      const good = INDUSTRIAL_VALIDATORS.validateStatement(filled);
      expect(good.ok, `${schema.pattern} filled: ${JSON.stringify(good)}`).toBe(true);

      // Remove one required slot → reject (or set empty string to hit the length===0 branch)
      const requiredSlots = schema.slots.filter(s => s.required);
      if (requiredSlots.length > 0) {
        const emptied = { ...filled, [requiredSlots[0]!.name]: '' };
        const bad = INDUSTRIAL_VALIDATORS.validateStatement(emptied);
        expect(bad.ok, `${schema.pattern} empty slot`).toBe(false);
      }
    }

    // Unknown pattern + non-object
    expect(INDUSTRIAL_VALIDATORS.validateStatement({ pattern: 'nope' }).ok).toBe(false);
    expect(INDUSTRIAL_VALIDATORS.validateStatement(null).ok).toBe(false);
    expect(INDUSTRIAL_VALIDATORS.validateStatement('string').ok).toBe(false);
  }

  // ── Templates ────────────────────────────────────────────────────────────

  @Verifies<RequirementCommandsFeature>('fromFeatureFlagPreFillsFromExistingFeature')
  'findTemplate returns each template by id and undefined for unknown id'() {
    for (const t of INDUSTRIAL_TEMPLATES.templates) {
      const found = INDUSTRIAL_TEMPLATES.findTemplate(t.id);
      expect(found?.id, `template ${t.id}`).toBe(t.id);
    }
    expect(INDUSTRIAL_TEMPLATES.findTemplate('nonexistent-template-id')).toBeUndefined();
  }

  // ── Reporter ─────────────────────────────────────────────────────────────

  @Verifies<RequirementCommandsFeature>('requirementListShowsCoveragePerRequirement')
  'renderStatement templates every known pattern and falls back for unknown / non-object'() {
    for (const schema of INDUSTRIAL_VOCABULARY.statementPatterns) {
      const stmt: Record<string, string> = { pattern: schema.pattern };
      for (const slot of schema.slots) stmt[slot.name] = `<${slot.name}>`;
      const rendered = INDUSTRIAL_REPORTER.renderStatement(stmt);
      expect(rendered.length, schema.pattern).toBeGreaterThan(0);
      for (const slot of schema.slots) {
        expect(rendered, `${schema.pattern}: slot ${slot.name} substituted`).toContain(`<${slot.name}>`);
      }
    }

    // Missing slot → '…' fallback inside the template
    const partial = INDUSTRIAL_REPORTER.renderStatement({ pattern: 'ubiquitous' });
    expect(partial).toContain('…');

    // Unknown pattern → JSON.stringify fallback
    const unknown = INDUSTRIAL_REPORTER.renderStatement({ pattern: 'made-up' });
    expect(unknown).toBe(JSON.stringify({ pattern: 'made-up' }));

    // Non-object → ''
    expect(INDUSTRIAL_REPORTER.renderStatement(null)).toBe('');
    expect(INDUSTRIAL_REPORTER.renderStatement('string')).toBe('');
  }

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  'renderRequirement includes id/title/kind/status/priority/risk/verification'() {
    const spec = baseSafetySpec();
    const out = INDUSTRIAL_REPORTER.renderRequirement(spec);
    expect(out).toContain('REQ-S1');
    expect(out).toContain('Close valve on overpressure');
    expect(out).toContain('Safety');
    expect(out).toContain('Draft');
    expect(out).toContain('Critical');
    expect(out).toContain('SIL2');
    expect(out).toContain('Rupture of vessel');
    expect(out).toContain('SILProofTest');
    expect(out).toContain('Statement:');

    // Missing risk → no risk/SIL line, still renders
    const noRisk = INDUSTRIAL_REPORTER.renderRequirement({ ...spec, risk: undefined });
    expect(noRisk).toContain('REQ-S1');
    expect(noRisk).not.toContain('Risk/SIL:');

    // Non-object → ''
    expect(INDUSTRIAL_REPORTER.renderRequirement(null)).toBe('');
    expect(INDUSTRIAL_REPORTER.renderRequirement(42)).toBe('');
  }

  @Verifies<RequirementCommandsFeature>('requirementSyncReusesDiffCore')
  'renderMarkdown produces H1 + table + statement block, handles missing source/risk'() {
    const specFull = {
      ...baseSafetySpec(),
      source: { type: 'iec-standard', id: '61511-1', section: '9.2' },
    };
    const md = INDUSTRIAL_REPORTER.renderMarkdown(specFull);
    expect(md).toMatch(/^# REQ-S1 — Close valve on overpressure/);
    expect(md).toContain('| Field | Value |');
    expect(md).toContain('| Kind | Safety |');
    expect(md).toContain('| SIL / Risk | SIL2 |');
    expect(md).toContain('| Priority | Critical |');
    expect(md).toContain('| Status | Draft |');
    expect(md).toContain('| Verification method | SILProofTest |');
    expect(md).toContain('iec-standard');
    expect(md).toContain('id=61511-1');
    expect(md).toContain('## Statement');
    expect(md).toContain('**If not met**: Rupture of vessel');

    // Missing source + risk → fallback "—" / "NonSIL"
    const bare = INDUSTRIAL_REPORTER.renderMarkdown({
      id: 'REQ-X',
      title: 'X',
      requirementKind: 'Functional',
      priority: 'Low',
      status: 'Draft',
      verificationMethod: 'UnitTest',
      statement: { pattern: 'ubiquitous', response: 'do the thing' },
    });
    expect(bare).toContain('| SIL / Risk | NonSIL |');
    expect(bare).toContain('| Source | — (');
    expect(bare).toContain('**If not met**: —');

    // Non-object → ''
    expect(INDUSTRIAL_REPORTER.renderMarkdown(null)).toBe('');
    expect(INDUSTRIAL_REPORTER.renderMarkdown(123)).toBe('');
  }
}

void IndustrialStyleTests;
