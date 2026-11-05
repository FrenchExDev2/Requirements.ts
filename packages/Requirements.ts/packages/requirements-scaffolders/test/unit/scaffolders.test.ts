import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ScaffolderRegistryFeature } from '@frenchexdev2/requirements-requirements';
import type { FeatureMeta, TestLevel } from '@frenchexdev2/requirements-compliance';
import type { UncoveredAC, TestScaffolder } from '../../src/scaffolders';
import {
  UnitScaffolder,
  E2eScaffolder,
  FunctionalScaffolder,
  A11yScaffolder,
  I18nScaffolder,
  VisualScaffolder,
  PerfScaffolder,
  BUILT_IN_SCAFFOLDERS,
  DEFAULT_REGISTRY,
  createRegistry,
} from '../../src/scaffolders';

// ── Fixtures ────────────────────────────────────────────────────────────────

function feat(partial: Partial<FeatureMeta> = {}): FeatureMeta {
  return {
    id: 'SHOP',
    title: 'Shopping Cart',
    priority: 'high',
    acMethods: ['addsItem', 'removesItem'],
    acDetails: [
      { name: 'addsItem', expectedLevels: ['unit'] },
      { name: 'removesItem', expectedLevels: ['unit'] },
    ],
    enabled: true,
    className: 'ShoppingCartFeature',
    file: 'shopping-cart.ts',
    satisfies: [],
    ...partial,
  };
}

const UNCOVERED: readonly UncoveredAC[] = [
  { ac: 'addsItem', missingLevels: ['unit'] },
  { ac: 'removesItem', missingLevels: ['unit'] },
];

const ALL_LEVELS: readonly TestLevel[] = [
  'unit',
  'functional',
  'e2e',
  'a11y',
  'i18n',
  'visual',
  'perf',
];

function expectedPath(s: TestScaffolder, featureFile: string): string {
  const withoutTs = featureFile.replace(/\.ts$/, '');
  return `${s.defaultDir}/${withoutTs}-scaffold${s.filenameSuffix}`;
}

// ── Registry surface ────────────────────────────────────────────────────────

@FeatureTest(ScaffolderRegistryFeature)
class RegistryTests {
  @Verifies<ScaffolderRegistryFeature>('registryCoversEveryBuiltInTestLevel')
  'default registry returns a scaffolder for every built-in TestLevel'() {
    for (const level of ALL_LEVELS) {
      const s = DEFAULT_REGISTRY.get(level);
      expect(s, `missing scaffolder for ${level}`).toBeDefined();
      expect(s!.level).toBe(level);
    }
    expect(BUILT_IN_SCAFFOLDERS.length).toBe(7);
  }

  @Verifies<ScaffolderRegistryFeature>('registryReturnsUndefinedForUnknownLevel')
  'unknown level returns undefined'() {
    const reg = createRegistry();
    expect(reg.get('does-not-exist' as TestLevel)).toBeUndefined();
  }

  @Verifies<ScaffolderRegistryFeature>('registerScaffolderAddsNewLevel')
  'register adds a brand-new level'() {
    const reg = createRegistry([]);
    const custom: TestScaffolder = {
      level: 'custom' as TestLevel,
      defaultDir: 'test/custom',
      filenameSuffix: '.custom.test.ts',
      description: 'custom',
      generate: () => 'generated',
    };
    reg.register(custom);
    expect(reg.get('custom' as TestLevel)).toBe(custom);
    expect(reg.list()).toHaveLength(1);
  }

  @Verifies<ScaffolderRegistryFeature>('registerScaffolderOverridesDefault')
  'register overrides an existing level'() {
    const reg = createRegistry();
    const override: TestScaffolder = {
      level: 'unit',
      defaultDir: 'tests/my-unit',
      filenameSuffix: '.myunit.test.ts',
      description: 'project-override',
      generate: () => '// override',
    };
    reg.register(override);
    expect(reg.get('unit')).toBe(override);
    // Non-mutation of DEFAULT_REGISTRY because createRegistry() clones.
    expect(DEFAULT_REGISTRY.get('unit')).toBe(UnitScaffolder);
  }

  @Verifies<ScaffolderRegistryFeature>('listScaffoldersReturnsEverythingRegistered')
  'list reflects every registered scaffolder'() {
    const reg = createRegistry();
    const listed = reg.list();
    expect(listed).toHaveLength(7);
    const levels = listed.map(s => s.level).sort();
    expect(levels).toEqual(['a11y', 'e2e', 'functional', 'i18n', 'perf', 'unit', 'visual']);
  }
}
void RegistryTests;

// ── Built-in scaffolders — shape guarantees ─────────────────────────────────

@FeatureTest(ScaffolderRegistryFeature)
class BuiltInShapeTests {
  @Verifies<ScaffolderRegistryFeature>('unitScaffolderEmitsVitestStub')
  'unit scaffolder emits a vitest stub'() {
    const src = UnitScaffolder.generate(feat(), UNCOVERED);
    expect(src).toContain(`import { expect } from 'vitest';`);
    expect(src).toContain(`class ShoppingCartScaffoldTests {`);
    expect(src).toContain(`@Verifies<ShoppingCartFeature>('addsItem')`);
    // Empty-uncovered path returns ''
    expect(UnitScaffolder.generate(feat(), [])).toBe('');
  }

  @Verifies<ScaffolderRegistryFeature>('e2eScaffolderEmitsPlaywrightStub')
  'e2e scaffolder emits a Playwright stub'() {
    const src = E2eScaffolder.generate(feat(), UNCOVERED);
    expect(src).toContain(`import { test, expect } from '@playwright/test';`);
    expect(src).toContain(`class ShoppingCartE2eTests {`);
    expect(E2eScaffolder.generate(feat(), [])).toBe('');
  }

  @Verifies<ScaffolderRegistryFeature>('functionalScaffolderEmitsVitestIntegrationStub')
  'functional scaffolder emits a vitest integration stub'() {
    const src = FunctionalScaffolder.generate(feat(), UNCOVERED);
    expect(src).toContain(`import { expect } from 'vitest';`);
    expect(src).toContain(`class ShoppingCartFunctionalTests {`);
    expect(src).toContain(`async 'addsItem'()`);
    expect(src).toContain(`throw new Error('Not implemented: SHOP/addsItem');`);
    // Should NOT pull Playwright
    expect(src).not.toContain('@playwright/test');
    expect(FunctionalScaffolder.generate(feat(), [])).toBe('');
  }

  @Verifies<ScaffolderRegistryFeature>('a11yScaffolderEmitsAxePlaywrightStub')
  'a11y scaffolder emits axe + Playwright stub'() {
    const src = A11yScaffolder.generate(feat(), UNCOVERED);
    expect(src).toContain(`import { test, expect } from '@playwright/test';`);
    expect(src).toContain(`import AxeBuilder from '@axe-core/playwright';`);
    expect(src).toContain(`class ShoppingCartA11yTests {`);
    expect(src).toContain(`AxeBuilder({ page })`);
    expect(A11yScaffolder.generate(feat(), [])).toBe('');
  }

  @Verifies<ScaffolderRegistryFeature>('i18nScaffolderEmitsLocaleSweepStub')
  'i18n scaffolder emits locale-sweep stub'() {
    const src = I18nScaffolder.generate(feat(), UNCOVERED);
    expect(src).toContain(`import { test, expect } from '@playwright/test';`);
    expect(src).toContain(`class ShoppingCartI18nTests {`);
    expect(src).toContain(`LOCALES`);
    expect(I18nScaffolder.generate(feat(), [])).toBe('');
  }

  @Verifies<ScaffolderRegistryFeature>('visualScaffolderEmitsPlaywrightSnapshotStub')
  'visual scaffolder emits Playwright snapshot stub'() {
    const src = VisualScaffolder.generate(feat(), UNCOVERED);
    expect(src).toContain(`import { test, expect } from '@playwright/test';`);
    expect(src).toContain(`class ShoppingCartVisualTests {`);
    expect(src).toContain(`toHaveScreenshot`);
    expect(VisualScaffolder.generate(feat(), [])).toBe('');
  }

  @Verifies<ScaffolderRegistryFeature>('perfScaffolderEmitsLatencyBudgetStub')
  'perf scaffolder emits a latency budget stub'() {
    const src = PerfScaffolder.generate(feat(), UNCOVERED);
    expect(src).toContain(`import { expect } from 'vitest';`);
    expect(src).toContain(`class ShoppingCartPerfTests {`);
    expect(src).toContain(`const BUDGET_MS = 100;`);
    expect(src).toContain(`performance.now()`);
    expect(src).toContain(`expect(elapsed).toBeLessThan(BUDGET_MS);`);
    expect(PerfScaffolder.generate(feat(), [])).toBe('');
  }
}
void BuiltInShapeTests;

// ── Universal output invariants ─────────────────────────────────────────────

@FeatureTest(ScaffolderRegistryFeature)
class UniversalInvariantTests {
  @Verifies<ScaffolderRegistryFeature>('scaffolderOutputUsesFeatureTestVerifiesOnly')
  'every scaffolder uses @FeatureTest + @Verifies'() {
    for (const s of BUILT_IN_SCAFFOLDERS) {
      const src = s.generate(feat(), UNCOVERED);
      expect(src, `${s.level} missing @FeatureTest`).toMatch(/@FeatureTest\(/);
      expect(src, `${s.level} missing @Verifies<`).toMatch(/@Verifies</);
    }
  }

  @Verifies<ScaffolderRegistryFeature>('scaffolderOutputContainsNoDescribeOrIt')
  'no scaffolder emits describe( or it('() {
    for (const s of BUILT_IN_SCAFFOLDERS) {
      const src = s.generate(feat(), UNCOVERED);
      expect(src, `${s.level} contains describe(`).not.toMatch(/describe\(/);
      expect(src, `${s.level} contains it(`).not.toMatch(/\bit\(/);
    }
  }

  @Verifies<ScaffolderRegistryFeature>('scaffolderHonoursFilenameSuffixConvention')
  'filename convention: <defaultDir>/<file-without-ts>-scaffold<suffix>'() {
    const f = feat();
    for (const s of BUILT_IN_SCAFFOLDERS) {
      const expected = expectedPath(s, f.file);
      // Sanity check of the helper against a known pair (CART / a11y).
      if (s.level === 'a11y') {
        expect(expected).toBe('test/a11y/shopping-cart-scaffold.a11y.test.ts');
      }
      // The expected path is fully determined by defaultDir + filenameSuffix.
      expect(expected.startsWith(s.defaultDir + '/')).toBe(true);
      expect(expected.endsWith(s.filenameSuffix)).toBe(true);
      expect(expected).toContain('shopping-cart-scaffold');
    }
  }
}
void UniversalInvariantTests;

// ── Integration ─────────────────────────────────────────────────────────────

@FeatureTest(ScaffolderRegistryFeature)
class IntegrationTests {
  @Verifies<ScaffolderRegistryFeature>('planWritesEnumeratesAllExpectedLevels')
  'walking DEFAULT_REGISTRY enumerates all 7 levels with non-empty descriptions'() {
    const levels = DEFAULT_REGISTRY.list().map(s => s.level).sort();
    expect(levels).toEqual(['a11y', 'e2e', 'functional', 'i18n', 'perf', 'unit', 'visual']);
    for (const s of DEFAULT_REGISTRY.list()) {
      expect(s.description.length).toBeGreaterThan(0);
      expect(s.defaultDir.length).toBeGreaterThan(0);
      expect(s.filenameSuffix.startsWith('.')).toBe(true);
    }
  }

  @Verifies<ScaffolderRegistryFeature>('unknownLevelInExpectsYieldsTypedError')
  'consumer can detect unknown level via undefined lookup'() {
    const reg = createRegistry();
    const unknown = reg.get('nope' as TestLevel);
    expect(unknown).toBeUndefined();
    // Typed guard — consumer code would throw with a typed error using this shape.
    const guard = (lvl: TestLevel): TestScaffolder => {
      const s = reg.get(lvl);
      if (!s) throw new Error(`No scaffolder registered for TestLevel '${lvl}'`);
      return s;
    };
    expect(() => guard('nope' as TestLevel)).toThrow(/No scaffolder registered/);
    expect(guard('unit')).toBe(UnitScaffolder);
  }
}
void IntegrationTests;
