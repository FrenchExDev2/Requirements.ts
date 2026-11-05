import { expect, vi } from 'vitest';
import { FeatureTest, Verifies, type RequirementStyle } from '@frenchexdev2/requirements-core';
import { StyleCustomizationFeature } from '@frenchexdev2/requirements-requirements';
import { DefaultStyle } from '../../src/default.js';
import { createStyleRegistry, resolveStyleFromRegistry } from '../../src/registry.js';

@FeatureTest(StyleCustomizationFeature)
class StyleCustomizationTests {
  @Verifies<StyleCustomizationFeature>('configResolutionLoadsDeclaredStyleFromRegistry')
  async resolvesTheConfiguredRegistryIdentityBeforeLoadingModules() {
    const style = { ...DefaultStyle, id: 'project/custom' };
    const registry = createStyleRegistry([style]);
    const config = { style: 'project/custom' };
    const load = vi.fn(async () => { throw new Error('A registered Style must not require module loading.'); });
    expect(await resolveStyleFromRegistry(config.style, registry, load)).toBe(style);
    expect(load).not.toHaveBeenCalled();
  }

  @Verifies<StyleCustomizationFeature>('configResolutionLoadsDeclaredStyleFromRegistry')
  async loadsDefaultAndNamedStyleExportsAndRejectsIncompleteModules() {
    const registry = createStyleRegistry([]);
    const style = { ...DefaultStyle, id: 'project/custom' };
    expect(await resolveStyleFromRegistry('custom', registry, async () => ({ default: style }))).toBe(style);
    expect(await resolveStyleFromRegistry('custom', registry, async () => ({ CustomStyle: style }))).toBe(style);
    for (const invalid of [null, 42, {}, { default: null }, { default: [] }, { default: { ...style, id: '' } }, { default: { ...style, version: '' } }, { default: { ...style, id: 1 } }, { default: { ...style, version: 1 } }]) await expect(resolveStyleFromRegistry('custom', registry, async () => invalid)).rejects.toThrow('complete RequirementStyle');
    for (const key of ['vocabulary', 'validators', 'templates', 'reporter']) for (const value of [null, 'invalid']) await expect(resolveStyleFromRegistry('custom', registry, async () => ({ default: { ...style, [key]: value } }))).rejects.toThrow();
    for (const key of ['validateSpec', 'validateStatement']) await expect(resolveStyleFromRegistry('custom', registry, async () => ({ default: { ...style, validators: { ...style.validators, [key]: null } } }))).rejects.toThrow();
    for (const key of ['renderStatement', 'renderRequirement', 'renderMarkdown']) await expect(resolveStyleFromRegistry('custom', registry, async () => ({ default: { ...style, reporter: { ...style.reporter, [key]: null } } }))).rejects.toThrow();
    for (const key of ['findTemplate', 'templates']) await expect(resolveStyleFromRegistry('custom', registry, async () => ({ default: { ...style, templates: { ...style.templates, [key]: null } } }))).rejects.toThrow();
    await expect(resolveStyleFromRegistry('custom', registry, async () => ({ default: { ...style, fitCriterionAdapters: null } }))).rejects.toThrow();
    const failure = new Error('Module load failed');
    await expect(resolveStyleFromRegistry('custom', registry, async () => { throw failure; })).rejects.toBe(failure);
  }

  @Verifies<StyleCustomizationFeature>('customStyleCanOverrideSingleSubInterface')
  overridesOnlyValidatorsWhilePreservingTheOtherFourConcerns() {
    const validateSpec = (value: unknown) => ({ ok: value === 'accepted', errors: [] });
    const custom: RequirementStyle = { ...DefaultStyle, validators: { ...DefaultStyle.validators, validateSpec } };
    expect(custom.validators.validateSpec('accepted').ok).toBe(true);
    expect(custom.validators.validateSpec('rejected').ok).toBe(false);
    expect(custom.validators.validateStatement).toBe(DefaultStyle.validators.validateStatement);
    expect(custom.vocabulary).toBe(DefaultStyle.vocabulary);
    expect(custom.templates).toBe(DefaultStyle.templates);
    expect(custom.reporter).toBe(DefaultStyle.reporter);
    expect(custom.fitCriterionAdapters).toBe(DefaultStyle.fitCriterionAdapters);
  }
}
void StyleCustomizationTests;
