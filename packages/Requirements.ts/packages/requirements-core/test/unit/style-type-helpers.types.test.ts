/**
 * Compile-time narrowing tests for KindsOf / StatusesOf / RiskLevelsOf /
 * VerificationMethodsOf / RationaleKindsOf / SourceKindsOf / StatementPatternsOf.
 *
 * Each @Verifies-bound method declares a value whose type *is the helper*, then
 * assigns a literal from the FixtureStyle vocabulary. If the helper fails to
 * narrow (e.g. returns `string` instead of a literal union), the assignment
 * compiles with widening and a hand-written "@ts-expect-error" line below would
 * no longer error — that is what verifies the compile-time contract.
 *
 * The runtime assertions check the literal value made it through; the
 * compile-time contract is enforced by tsc --noEmit at build time.
 */

import { expect } from 'vitest';
import { FeatureTest, Verifies, TypeCheckOnly } from '@frenchexdev2/requirements-core';
import { StyleTypeHelpersFeature } from '@frenchexdev2/requirements-requirements';
import type {
  KindsOf,
  StatusesOf,
  RiskLevelsOf,
  VerificationMethodsOf,
  RationaleKindsOf,
  SourceKindsOf,
  StatementPatternsOf,
  Requirement,
} from '@frenchexdev2/requirements-core';
import type { DefaultStyleType } from '../../../requirements-styles/src/default.js';
import { FixtureStyle, type FixtureStyleType } from './_style-fixture';

@FeatureTest(StyleTypeHelpersFeature)
class StyleTypeHelpersContractTests {
  @TypeCheckOnly()
  @Verifies<StyleTypeHelpersFeature>('outOfVocabularyValueIsRejectedByCompiler')
  rejectsEveryOutOfVocabularyRequirementDiscriminant() {
    type Typed = Requirement<FixtureStyleType>;
    // @ts-expect-error -- the actual Requirement field, rather than its helper alone, must narrow.
    const kind: Typed['kind'] = 'NotDeclared';
    // @ts-expect-error -- status must belong to this Style.
    const status: Typed['status'] = 'NotAState';
    // @ts-expect-error -- risk must belong to this Style.
    const risk: Typed['risk']['level'] = 'NotALevel';
    // @ts-expect-error -- verification method must belong to this Style.
    const verification: Typed['verificationMethod'] = 'Telepathy';
    // @ts-expect-error -- rationale must belong to this Style.
    const rationale: Typed['rationale']['kind'] = 'vibes';
    // @ts-expect-error -- provenance must belong to this Style.
    const source: Typed['source']['type'] = 'pigeon-post';
    // @ts-expect-error -- statement pattern must belong to this Style.
    const pattern: Typed['statement']['pattern'] = 'vague';
    // @ts-expect-error -- the real built-in preset must preserve literals too.
    const defaultKind: KindsOf<DefaultStyleType> = 'NotDeclared';
    expect([kind, status, risk, verification, rationale, source, pattern, defaultKind]).toEqual(['NotDeclared', 'NotAState', 'NotALevel', 'Telepathy', 'vibes', 'pigeon-post', 'vague', 'NotDeclared']);
  }

  @TypeCheckOnly()
  @Verifies<StyleTypeHelpersFeature>('kindsOfNarrowsToStringLiteralUnion')
  'KindsOf<S> narrows to the declared requirementKinds union'() {
    const k: KindsOf<FixtureStyleType> = 'Functional';
    // @ts-expect-error — 'NotDeclared' is not in requirementKinds
    const bad: KindsOf<FixtureStyleType> = 'NotDeclared';
    expect(k).toBe('Functional');
    expect(bad).toBe('NotDeclared');
    expect(FixtureStyle.vocabulary.requirementKinds).toContain(k);
  }

  @TypeCheckOnly()
  @Verifies<StyleTypeHelpersFeature>('statusesOfNarrowsToWorkflowStates')
  'StatusesOf<S> narrows to statusWorkflow.states'() {
    const s: StatusesOf<FixtureStyleType> = 'Draft';
    // @ts-expect-error — 'NotAState' is not in statusWorkflow.states
    const bad: StatusesOf<FixtureStyleType> = 'NotAState';
    expect(s).toBe('Draft');
    expect(bad).toBe('NotAState');
    expect(FixtureStyle.vocabulary.statusWorkflow.states).toContain(s);
  }

  @TypeCheckOnly()
  @Verifies<StyleTypeHelpersFeature>('riskLevelsOfNarrowsToTaxonomyLevels')
  'RiskLevelsOf<S> narrows to riskTaxonomy.levels'() {
    const r: RiskLevelsOf<FixtureStyleType> = 'Critical';
    // @ts-expect-error — 'NotALevel' is not in riskTaxonomy.levels
    const bad: RiskLevelsOf<FixtureStyleType> = 'NotALevel';
    expect(r).toBe('Critical');
    expect(bad).toBe('NotALevel');
    expect(FixtureStyle.vocabulary.riskTaxonomy.levels).toContain(r);
  }

  @TypeCheckOnly()
  @Verifies<StyleTypeHelpersFeature>('verificationMethodsOfNarrows')
  'VerificationMethodsOf<S> narrows to verificationMethods'() {
    const v: VerificationMethodsOf<FixtureStyleType> = 'Test';
    // @ts-expect-error — 'Telepathy' is not a declared verificationMethod
    const bad: VerificationMethodsOf<FixtureStyleType> = 'Telepathy';
    expect(v).toBe('Test');
    expect(bad).toBe('Telepathy');
    expect(FixtureStyle.vocabulary.verificationMethods).toContain(v);
  }

  @TypeCheckOnly()
  @Verifies<StyleTypeHelpersFeature>('rationaleKindsOfNarrows')
  'RationaleKindsOf<S> narrows to rationaleKinds'() {
    const k: RationaleKindsOf<FixtureStyleType> = 'principle';
    // @ts-expect-error — 'vibes' is not a declared rationaleKind
    const bad: RationaleKindsOf<FixtureStyleType> = 'vibes';
    expect(k).toBe('principle');
    expect(bad).toBe('vibes');
    expect(FixtureStyle.vocabulary.rationaleKinds).toContain(k);
  }

  @TypeCheckOnly()
  @Verifies<StyleTypeHelpersFeature>('sourceKindsOfNarrowsToKindField')
  'SourceKindsOf<S> narrows to the kind discriminant of sourceKinds'() {
    const k: SourceKindsOf<FixtureStyleType> = 'stakeholder';
    // @ts-expect-error — 'pigeon-post' is not a declared sourceKind.kind
    const bad: SourceKindsOf<FixtureStyleType> = 'pigeon-post';
    expect(k).toBe('stakeholder');
    expect(bad).toBe('pigeon-post');
    expect(FixtureStyle.vocabulary.sourceKinds.map((sk) => sk.kind)).toContain(k);
  }

  @TypeCheckOnly()
  @Verifies<StyleTypeHelpersFeature>('statementPatternsOfNarrowsToPatternField')
  'StatementPatternsOf<S> narrows to the pattern discriminant of statementPatterns'() {
    const p: StatementPatternsOf<FixtureStyleType> = 'ubiquitous';
    // @ts-expect-error — 'vague' is not a declared statementPattern.pattern
    const bad: StatementPatternsOf<FixtureStyleType> = 'vague';
    expect(p).toBe('ubiquitous');
    expect(bad).toBe('vague');
    expect(FixtureStyle.vocabulary.statementPatterns.map((sp) => sp.pattern)).toContain(p);
  }
}

void StyleTypeHelpersContractTests;
