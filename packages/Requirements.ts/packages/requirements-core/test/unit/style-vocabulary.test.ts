import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { StyleVocabularyFeature } from '@frenchexdev2/requirements-requirements';
import { FixtureStyle } from './_style-fixture';

@FeatureTest(StyleVocabularyFeature)
class StyleVocabularyContractTests {
  @Verifies<StyleVocabularyFeature>('vocabularyExposesAllSevenLists')
  'vocabulary exposes the seven required lists'() {
    const v = FixtureStyle.vocabulary;
    expect(v.requirementKinds).toBeDefined();
    expect(v.statusWorkflow).toBeDefined();
    expect(v.riskTaxonomy).toBeDefined();
    expect(v.verificationMethods).toBeDefined();
    expect(v.rationaleKinds).toBeDefined();
    expect(v.sourceKinds).toBeDefined();
    expect(v.statementPatterns).toBeDefined();
  }

  @Verifies<StyleVocabularyFeature>('statusWorkflowHasInitialAndTerminal')
  'statusWorkflow.initial is a declared state and terminal is a subset of states'() {
    const sw = FixtureStyle.vocabulary.statusWorkflow;
    expect(sw.states).toContain(sw.initial);
    for (const t of sw.terminal) {
      expect(sw.states, `terminal state ${t} must be declared`).toContain(t);
    }
  }

  @Verifies<StyleVocabularyFeature>('statusWorkflowTransitionsClosedOverStates')
  'every transition.from and transition.to is a declared state'() {
    const sw = FixtureStyle.vocabulary.statusWorkflow;
    for (const t of sw.transitions) {
      expect(sw.states, `transition.from ${t.from}`).toContain(t.from);
      expect(sw.states, `transition.to ${t.to}`).toContain(t.to);
    }
  }

  @Verifies<StyleVocabularyFeature>('riskTaxonomyLevelsNonEmpty')
  'riskTaxonomy.levels is non-empty'() {
    expect(FixtureStyle.vocabulary.riskTaxonomy.levels.length).toBeGreaterThan(0);
  }

  @Verifies<StyleVocabularyFeature>('sourceKindSchemaSlotsHaveType')
  'every sourceKinds slot has a valid type'() {
    const valid = new Set(['string', 'iso-date', 'number', 'url']);
    for (const sk of FixtureStyle.vocabulary.sourceKinds) {
      for (const slot of sk.slots) {
        expect(valid.has(slot.type), `${sk.kind}.${slot.name}.type`).toBe(true);
      }
    }
  }

  @Verifies<StyleVocabularyFeature>('statementPatternHasTemplate')
  'every statementPattern carries a non-empty human template'() {
    for (const p of FixtureStyle.vocabulary.statementPatterns) {
      expect(p.template.length, `pattern ${p.pattern}`).toBeGreaterThan(0);
    }
  }
}

void StyleVocabularyContractTests;
