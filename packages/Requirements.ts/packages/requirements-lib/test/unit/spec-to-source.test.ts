import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { FeatureNewCommandFeature } from '@frenchexdev2/requirements-requirements';
import {
  kebabOfId,
  featureClassName,
  requirementClassName,
  generateFeatureSource,
  generateRequirementSource,
  specToJson,
  featureSpecToMeta,
} from '@frenchexdev2/requirements-spec-io/spec-to-source';
import {
  planWrites,
  generateScaffoldForSpec,
} from '@frenchexdev2/requirements-scaffolders';
import type {
  FeatureSpec,
  RequirementSpec,
  FeatureId,
  RequirementId,
  AcName,
  Sentence,
  IsoDate,
} from '@frenchexdev2/requirements-core/types';
import { SCHEMA_VERSION } from '@frenchexdev2/requirements-core/types';
import { Priority, TestLevel } from '@frenchexdev2/requirements-core';

// ── Branded fixture builders ────────────────────────────────────────────────

const fid = (s: string) => s as FeatureId;
const rid = (s: string) => s as RequirementId;
const an  = (s: string) => s as AcName;
const sen = (s: string) => s as Sentence;
const dt  = (s: string) => s as IsoDate;

function featureSpec(partial: Partial<FeatureSpec> = {}): FeatureSpec {
  return {
    $schemaVersion: SCHEMA_VERSION,
    kind: 'feature',
    id: fid('CART'),
    title: 'Cart persistence',
    priority: Priority.High,
    satisfies: [rid('REQ-CART-PERSIST')],
    acs: [
      { name: an('persistsAcrossReloads'), expects: [TestLevel.Unit] },
      { name: an('walksFullCheckout'),     expects: [TestLevel.EndToEnd] },
    ],
    ...partial,
  };
}

function requirementSpec(partial: Partial<RequirementSpec> = {}): RequirementSpec {
  return {
    $schemaVersion: SCHEMA_VERSION,
    kind: 'requirement',
    id: rid('REQ-CART-PERSIST'),
    title: 'Cart survives a reload',
    priority: Priority.High,
    status: 'Approved',
    requirementKind: 'Functional',
    statement: {
      pattern: 'ubiquitous',
      response: sen('persist the user\'s cart across browser reloads.'),
    },
    source: { type: 'stakeholder', role: 'product-team', date: dt('2026-04-14') },
    rationale: {
      claim: sen('Losing a cart on reload kills conversion.'),
      kind: 'evidence-based',
      evidence: [{ kind: 'metric', name: 'reload-cart-loss', value: '17%', date: dt('2026-04-01') }],
    },
    fitCriteria: [
      { kind: 'unit-test', describes: sen('persists across reloads.'), binds: [an('persistsAcrossReloads')] },
    ],
    verificationMethod: 'Test',
    risk: { level: 'High', ifNotMet: sen('Conversion drops.') },
    satisfiedBy: [fid('CART')],
    ...partial,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Id → name helpers
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureNewCommandFeature)
class KebabOfIdTests {
  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'lowercases a single-segment feature id'() {
    expect(kebabOfId('CART')).toBe('cart');
  }

  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'preserves hyphens in multi-segment ids'() {
    expect(kebabOfId('USER-AUTH')).toBe('user-auth');
    expect(kebabOfId('REQ-CART-PERSIST')).toBe('req-cart-persist');
  }
}
void KebabOfIdTests;

@FeatureTest(FeatureNewCommandFeature)
class ClassNameTests {
  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'featureClassName PascalCases and appends Feature'() {
    expect(featureClassName(fid('CART'))).toBe('CartFeature');
    expect(featureClassName(fid('USER-AUTH'))).toBe('UserAuthFeature');
    expect(featureClassName(fid('FEATURE-NEW-COMMAND'))).toBe('FeatureNewCommandFeature');
  }

  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'requirementClassName PascalCases and appends Requirement'() {
    expect(requirementClassName(rid('REQ-CART-PERSIST'))).toBe('ReqCartPersistRequirement');
    expect(requirementClassName(rid('REQ-DSL'))).toBe('ReqDslRequirement');
  }
}
void ClassNameTests;

// ══════════════════════════════════════════════════════════════════════════════
// generateFeatureSource
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureNewCommandFeature)
class GenerateFeatureSourceTests {
  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'emits import from @frenchexdev2/requirements and extends Feature'() {
    const src = generateFeatureSource(featureSpec());
    expect(src).toContain(`import { Feature, Priority, Satisfies, type ACResult } from '@frenchexdev2/requirements';`);
    expect(src).toContain(`export abstract class CartFeature extends Feature {`);
  }

  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'emits @Satisfies with the satisfies list and requirement imports'() {
    const src = generateFeatureSource(featureSpec());
    expect(src).toContain(`@Satisfies(`);
    expect(src).toContain(`ReqCartPersistRequirement`);
    expect(src).toContain(`import { ReqCartPersistRequirement } from '@frenchexdev2/requirements-requirements';`);
  }

  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'separates multiple satisfies with commas, no trailing comma on last'() {
    const src = generateFeatureSource(featureSpec({
      satisfies: [rid('REQ-ONE'), rid('REQ-TWO'), rid('REQ-THREE')],
    }));
    expect(src).toContain('ReqOneRequirement,');
    expect(src).toContain('ReqTwoRequirement,');
    // last entry has no trailing comma (matches feature-new-command.ts style)
    expect(src).toMatch(/ReqThreeRequirement\n\)/);
  }

  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'omits @Satisfies decorator when satisfies is empty'() {
    const src = generateFeatureSource(featureSpec({ satisfies: [] }));
    expect(src).not.toContain('@Satisfies(');
  }

  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'omits @Satisfies when satisfies is undefined'() {
    const s = featureSpec();
    const { satisfies: _s, ...rest } = s;
    void _s;
    const src = generateFeatureSource(rest as FeatureSpec);
    expect(src).not.toContain('@Satisfies(');
  }

  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'emits abstract method per AC returning ACResult'() {
    const src = generateFeatureSource(featureSpec());
    expect(src).toContain(`abstract persistsAcrossReloads(): ACResult;`);
    expect(src).toContain(`abstract walksFullCheckout(): ACResult;`);
  }

  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'emits id, title and priority fields'() {
    const src = generateFeatureSource(featureSpec());
    expect(src).toContain(`readonly id = 'CART';`);
    expect(src).toContain(`readonly title = "Cart persistence";`);
    expect(src).toContain(`readonly priority = Priority.High;`);
  }

  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'maps each Priority enum value to the correct literal'() {
    for (const [p, literal] of [
      [Priority.Critical, 'Priority.Critical'],
      [Priority.High,     'Priority.High'],
      [Priority.Medium,   'Priority.Medium'],
      [Priority.Low,      'Priority.Low'],
    ] as const) {
      const src = generateFeatureSource(featureSpec({ priority: p }));
      expect(src).toContain(`readonly priority = ${literal};`);
    }
  }

  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'falls back to Priority.Medium for unknown priority with a comment'() {
    const src = generateFeatureSource(featureSpec({ priority: 'weird' as Priority }));
    expect(src).toContain(`Priority.Medium /* unknown: weird */`);
  }

  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'is deterministic — same spec produces byte-identical output'() {
    const a = generateFeatureSource(featureSpec());
    const b = generateFeatureSource(featureSpec());
    expect(a).toBe(b);
  }

  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'includes an expects comment on each AC line'() {
    const src = generateFeatureSource(featureSpec());
    expect(src).toContain(`// expects: unit`);
    expect(src).toContain(`// expects: e2e`);
  }

  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'omits expects comment when expects array is empty'() {
    const src = generateFeatureSource(featureSpec({
      acs: [{ name: an('bare'), expects: [] }],
    }));
    expect(src).toContain(`abstract bare(): ACResult;`);
    expect(src).not.toContain(`// expects:`);
  }
}
void GenerateFeatureSourceTests;

// ══════════════════════════════════════════════════════════════════════════════
// generateRequirementSource
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureNewCommandFeature)
class GenerateRequirementSourceTests {
  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'extends Requirement<DefaultStyleType>'() {
    const src = generateRequirementSource(requirementSpec());
    expect(src).toContain(`import { Requirement, Priority } from '@frenchexdev2/requirements';`);
    expect(src).toContain(`import type { DefaultStyleType } from '@frenchexdev2/requirements-styles';`);
    expect(src).toContain(`export abstract class ReqCartPersistRequirement extends Requirement<DefaultStyleType> {`);
  }

  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'emits id, title, status, kind, verificationMethod fields'() {
    const src = generateRequirementSource(requirementSpec());
    expect(src).toContain(`readonly id = 'REQ-CART-PERSIST';`);
    expect(src).toContain(`readonly status = "Approved" as const;`);
    expect(src).toContain(`readonly kind = "Functional" as const;`);
    expect(src).toContain(`readonly verificationMethod = "Test" as const;`);
  }

  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'emits structured statement literal with pattern as const'() {
    const src = generateRequirementSource(requirementSpec());
    expect(src).toContain(`pattern: "ubiquitous" as const,`);
    expect(src).toContain(`response:`);
  }

  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'omits tracedTo section when absent'() {
    const src = generateRequirementSource(requirementSpec());
    expect(src).not.toContain('tracedTo');
  }

  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'emits tracedTo section when present and non-empty'() {
    const src = generateRequirementSource(requirementSpec({
      tracedTo: [{ system: 'url', href: 'https://x', label: 'plan' }],
    }));
    expect(src).toContain(`readonly tracedTo =`);
    expect(src).toContain(`https://x`);
  }

  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'skips empty tracedTo array'() {
    const src = generateRequirementSource(requirementSpec({ tracedTo: [] }));
    expect(src).not.toContain('readonly tracedTo =');
  }

  @Verifies<FeatureNewCommandFeature>('generateFeatureSourceMatchesSpec')
  'is deterministic'() {
    const a = generateRequirementSource(requirementSpec());
    const b = generateRequirementSource(requirementSpec());
    expect(a).toBe(b);
  }
}
void GenerateRequirementSourceTests;

// ══════════════════════════════════════════════════════════════════════════════
// specToJson
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureNewCommandFeature)
class SpecToJsonTests {
  @Verifies<FeatureNewCommandFeature>('specJsonSavedNextToFeature')
  '$schema is the first key in serialized JSON'() {
    const s = specToJson(featureSpec());
    const firstLine = s.split('\n')[1]!; // index 0 is '{'
    expect(firstLine.trimStart().startsWith('"$schema"')).toBe(true);
  }

  @Verifies<FeatureNewCommandFeature>('specJsonSavedNextToFeature')
  '$schemaVersion is the second key'() {
    const s = specToJson(featureSpec());
    const secondLine = s.split('\n')[2]!;
    expect(secondLine.trimStart().startsWith('"$schemaVersion"')).toBe(true);
  }

  @Verifies<FeatureNewCommandFeature>('specJsonSavedNextToFeature')
  'feature spec uses feature schema path'() {
    const s = specToJson(featureSpec());
    expect(s).toContain('@frenchexdev2/requirements-lib/schemas/feature-spec.schema.json');
  }

  @Verifies<FeatureNewCommandFeature>('specJsonSavedNextToFeature')
  'requirement spec uses requirement schema path'() {
    const s = specToJson(requirementSpec());
    expect(s).toContain('@frenchexdev2/requirements-lib/schemas/requirement-spec.schema.json');
  }

  @Verifies<FeatureNewCommandFeature>('specJsonSavedNextToFeature')
  'preserves a user-provided $schema value'() {
    const s = specToJson(featureSpec({ $schema: './custom/path.json' }));
    expect(s).toContain('"$schema": "./custom/path.json"');
  }

  @Verifies<FeatureNewCommandFeature>('specJsonSavedNextToFeature')
  'is deterministic — same spec → same JSON string'() {
    const a = specToJson(featureSpec());
    const b = specToJson(featureSpec());
    expect(a).toBe(b);
  }

  @Verifies<FeatureNewCommandFeature>('specJsonSavedNextToFeature')
  'ends with a trailing newline'() {
    const s = specToJson(featureSpec());
    expect(s.endsWith('\n')).toBe(true);
  }

  @Verifies<FeatureNewCommandFeature>('specJsonSavedNextToFeature')
  'round-trips through JSON.parse preserving all fields'() {
    const s = specToJson(featureSpec());
    const parsed = JSON.parse(s);
    expect(parsed.id).toBe('CART');
    expect(parsed.kind).toBe('feature');
    expect(parsed.$schemaVersion).toBe(SCHEMA_VERSION);
  }
}
void SpecToJsonTests;

// ══════════════════════════════════════════════════════════════════════════════
// planWrites
// ══════════════════════════════════════════════════════════════════════════════

const CFG = {
  featuresDir: 'requirements/features',
  requirementsDir: 'requirements/requirements',
  testUnitDir: 'test/unit',
  testE2eDir: 'test/e2e',
};

@FeatureTest(FeatureNewCommandFeature)
class PlanWritesTests {
  @Verifies<FeatureNewCommandFeature>('generatedFileGoesToFeaturesDir')
  'Feature spec source goes to featuresDir'() {
    const plan = planWrites(featureSpec(), CFG);
    expect(plan.sourcePath).toBe('requirements/features/cart.ts');
  }

  @Verifies<FeatureNewCommandFeature>('specJsonSavedNextToFeature')
  'Feature spec JSON sits next to the source'() {
    const plan = planWrites(featureSpec(), CFG);
    expect(plan.specPath).toBe('requirements/features/cart.spec.json');
  }

  @Verifies<FeatureNewCommandFeature>('generatedFileGoesToFeaturesDir')
  'Requirement spec source goes to requirementsDir'() {
    const plan = planWrites(requirementSpec(), CFG);
    expect(plan.sourcePath).toBe('requirements/requirements/req-cart-persist.ts');
    expect(plan.specPath).toBe('requirements/requirements/req-cart-persist.spec.json');
  }

  @Verifies<FeatureNewCommandFeature>('scaffoldsUnitTestsForUncoveredAcs')
  'plans a unit scaffold when any AC expects unit'() {
    const plan = planWrites(featureSpec(), CFG);
    const unit = plan.scaffoldPaths.find(s => s.level === 'unit');
    expect(unit?.path).toBe('test/unit/cart-scaffold.test.ts');
  }

  @Verifies<FeatureNewCommandFeature>('scaffoldsE2eOnlyWhenAcExpectsEndToEnd')
  'plans an e2e scaffold only when at least one AC expects e2e'() {
    const withE2e = planWrites(featureSpec(), CFG);
    expect(withE2e.scaffoldPaths.some(s => s.level === 'e2e')).toBe(true);

    const noE2e = planWrites(featureSpec({
      acs: [{ name: an('unitOnly'), expects: [TestLevel.Unit] }],
    }), CFG);
    expect(noE2e.scaffoldPaths.some(s => s.level === 'e2e')).toBe(false);
  }

  @Verifies<FeatureNewCommandFeature>('scaffoldsUnitTestsForUncoveredAcs')
  'plans no unit scaffold when no AC expects unit'() {
    const plan = planWrites(featureSpec({
      acs: [{ name: an('e2eOnly'), expects: [TestLevel.EndToEnd] }],
    }), CFG);
    expect(plan.scaffoldPaths.some(s => s.level === 'unit')).toBe(false);
  }

  @Verifies<FeatureNewCommandFeature>('generatedFileGoesToFeaturesDir')
  'requirement plan has no scaffold paths'() {
    const plan = planWrites(requirementSpec(), CFG);
    expect(plan.scaffoldPaths).toEqual([]);
  }

  @Verifies<FeatureNewCommandFeature>('generatedFileGoesToFeaturesDir')
  'strips trailing slashes from config dirs'() {
    const plan = planWrites(featureSpec(), {
      featuresDir: 'requirements/features/',
      requirementsDir: 'requirements/requirements/',
      testDirsByLevel: { unit: 'test/unit/', e2e: 'test/e2e/' },
    });
    expect(plan.sourcePath).toBe('requirements/features/cart.ts');
    expect(plan.scaffoldPaths.find(s => s.level === 'unit')?.path).toBe('test/unit/cart-scaffold.test.ts');
  }
}
void PlanWritesTests;

// ══════════════════════════════════════════════════════════════════════════════
// featureSpecToMeta + scaffold reuse
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureNewCommandFeature)
class FeatureSpecToMetaTests {
  @Verifies<FeatureNewCommandFeature>('scaffoldsUnitTestsForUncoveredAcs')
  'builds a FeatureMeta that matches scaffold-core contract'() {
    const meta = featureSpecToMeta(featureSpec());
    expect(meta.id).toBe('CART');
    expect(meta.className).toBe('CartFeature');
    expect(meta.file).toBe('cart.ts');
    expect(meta.acMethods).toEqual(['persistsAcrossReloads', 'walksFullCheckout']);
    expect(meta.acDetails).toHaveLength(2);
    expect(meta.enabled).toBe(true);
  }

  @Verifies<FeatureNewCommandFeature>('scaffoldsUnitTestsForUncoveredAcs')
  'unit scaffold goes through the registry and reuses generateUnitTestStub'() {
    const src = generateScaffoldForSpec(featureSpec(), 'unit');
    expect(src).toContain(`@FeatureTest(CartFeature)`);
    expect(src).toContain(`@Verifies<CartFeature>('persistsAcrossReloads')`);
    expect(src).not.toContain(`'walksFullCheckout'`);
  }

  @Verifies<FeatureNewCommandFeature>('scaffoldsE2eOnlyWhenAcExpectsEndToEnd')
  'e2e scaffold goes through the registry and reuses generateE2eTestStub'() {
    const src = generateScaffoldForSpec(featureSpec(), 'e2e');
    expect(src).toContain(`@playwright/test`);
    expect(src).toContain(`async 'walksFullCheckout'()`);
    expect(src).not.toContain(`'persistsAcrossReloads'`);
  }

  @Verifies<FeatureNewCommandFeature>('scaffoldsE2eOnlyWhenAcExpectsEndToEnd')
  'e2e scaffold is empty when no AC expects e2e'() {
    const src = generateScaffoldForSpec(
      featureSpec({ acs: [{ name: an('unitOnly'), expects: [TestLevel.Unit] }] }),
      'e2e',
    );
    expect(src).toBe('');
  }

  @Verifies<FeatureNewCommandFeature>('scaffoldsUnitTestsForUncoveredAcs')
  'unit scaffold is empty when no AC expects unit'() {
    const src = generateScaffoldForSpec(
      featureSpec({ acs: [{ name: an('e2eOnly'), expects: [TestLevel.EndToEnd] }] }),
      'unit',
    );
    expect(src).toBe('');
  }

  @Verifies<FeatureNewCommandFeature>('featureSpecToMetaDefaultsSatisfiesToEmptyArrayWhenAbsent')
  'featureSpecToMeta defaults satisfies to [] when the spec omits the field'() {
    const s = featureSpec();
    const { satisfies: _drop, ...rest } = s;
    const meta = featureSpecToMeta(rest as FeatureSpec);
    expect(meta.satisfies).toEqual([]);
  }
}
void FeatureSpecToMetaTests;
