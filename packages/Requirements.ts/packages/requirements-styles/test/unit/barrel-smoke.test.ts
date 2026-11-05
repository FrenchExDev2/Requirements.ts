import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';

import { StylesBarrelSmokeFeature } from '../../requirements/features/barrel-smoke.js';


@FeatureTest(StylesBarrelSmokeFeature)
class BarrelSmokeTests {
  @Verifies<StylesBarrelSmokeFeature>('barrelExportsFivePresets')
  async 'five style presets are re-exported from barrel'() {
    const styles = await import('../../src/index');
    expect(typeof styles.DefaultStyle).toBe('object');
    expect(typeof styles.IndustrialStyle).toBe('object');
    expect(typeof styles.LeanStyle).toBe('object');
    expect(typeof styles.AgileStyle).toBe('object');
    expect(typeof styles.KanbanStyle).toBe('object');
  }

  @Verifies<StylesBarrelSmokeFeature>('barrelExportsRegistry')
  async 'registry surface is re-exported'() {
    const styles = await import('../../src/index');
    expect(Array.isArray(styles.BUILT_IN_STYLES)).toBe(true);
    expect(styles.BUILT_IN_STYLES.length).toBe(5);
    expect(typeof styles.createStyleRegistry).toBe('function');
    expect(typeof styles.DEFAULT_STYLE_REGISTRY).toBe('object');
  }

  @Verifies<StylesBarrelSmokeFeature>('presetsAreDistinct')
  async 'each preset has a distinct vocabulary'() {
    const styles = await import('../../src/index');
    const names = [
      styles.DefaultStyle,
      styles.IndustrialStyle,
      styles.LeanStyle,
      styles.AgileStyle,
      styles.KanbanStyle,
    ].map((s) => s.vocabulary.requirementKinds.join(','));
    expect(new Set(names).size).toBe(5);
  }
}
void BarrelSmokeTests;
