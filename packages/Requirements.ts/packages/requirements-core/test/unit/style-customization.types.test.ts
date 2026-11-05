import { expect } from 'vitest';
import { FeatureTest, Verifies, TypeCheckOnly, type Requirement, type RequirementStyle } from '@frenchexdev2/requirements-core';
import { StyleCustomizationFeature } from '@frenchexdev2/requirements-requirements';
import { DefaultStyle } from '../../../requirements-styles/src/default.js';

const LegalStyle = {
  ...DefaultStyle,
  id: 'project/legal',
  vocabulary: {
    ...DefaultStyle.vocabulary,
    requirementKinds: ['LegalObligation'],
    statusWorkflow: { states: ['Filed', 'Accepted'], initial: 'Filed', terminal: ['Accepted'], transitions: [{ from: 'Filed', to: 'Accepted' }] },
    riskTaxonomy: { levels: ['Severe'] },
  },
} as const satisfies RequirementStyle;

@FeatureTest(StyleCustomizationFeature)
class StyleCustomizationTypeTests {
  @TypeCheckOnly()
  @Verifies<StyleCustomizationFeature>('customStyleNarrowsRequirementFieldsToItsOwnVocabulary')
  acceptsTheProjectOntologyAndRejectsDefaultOnlyValues() {
    type Legal = Requirement<typeof LegalStyle>;
    const kind: Legal['kind'] = 'LegalObligation';
    const status: Legal['status'] = 'Filed';
    const risk: Legal['risk']['level'] = 'Severe';
    // @ts-expect-error -- the default ontology must not leak into this project.
    const rejectedKind: Legal['kind'] = 'Functional';
    // @ts-expect-error -- the default workflow must not leak into this project.
    const rejectedStatus: Legal['status'] = 'Draft';
    // @ts-expect-error -- the default risk taxonomy must not leak into this project.
    const rejectedRisk: Legal['risk']['level'] = 'Critical';
    expect([kind, status, risk]).toEqual(['LegalObligation', 'Filed', 'Severe']);
    expect([rejectedKind, rejectedStatus, rejectedRisk]).toEqual(['Functional', 'Draft', 'Critical']);
  }
}
void StyleCustomizationTypeTests;
