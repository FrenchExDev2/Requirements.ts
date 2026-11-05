import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { StyleTemplatesFeature } from '@frenchexdev2/requirements-requirements';
import { FixtureStyle } from './_style-fixture';

@FeatureTest(StyleTemplatesFeature)
class StyleTemplatesContractTests {
  @Verifies<StyleTemplatesFeature>('templatesListIsDefined')
  'templates is a defined readonly array (possibly empty)'() {
    expect(Array.isArray(FixtureStyle.templates.templates)).toBe(true);
  }

  @Verifies<StyleTemplatesFeature>('findTemplateReturnsMatchingId')
  'findTemplate returns the template whose id matches'() {
    const first = FixtureStyle.templates.templates[0];
    expect(first).toBeDefined();
    const hit = FixtureStyle.templates.findTemplate(first!.id);
    expect(hit).toBeDefined();
    expect(hit!.id).toBe(first!.id);
  }

  @Verifies<StyleTemplatesFeature>('findTemplateReturnsUndefinedOnMiss')
  'findTemplate returns undefined for an unknown id'() {
    expect(FixtureStyle.templates.findTemplate('does-not-exist-xyz')).toBeUndefined();
  }

  @Verifies<StyleTemplatesFeature>('templateSkeletonKindIsInVocabulary')
  'every template skeleton.kind, when defined, is a declared requirement kind'() {
    const kinds = new Set<string>(FixtureStyle.vocabulary.requirementKinds);
    for (const t of FixtureStyle.templates.templates) {
      if (t.skeleton.kind !== undefined) {
        expect(kinds.has(t.skeleton.kind), `${t.id}: skeleton.kind ${t.skeleton.kind}`).toBe(true);
      }
    }
  }
}

void StyleTemplatesContractTests;
