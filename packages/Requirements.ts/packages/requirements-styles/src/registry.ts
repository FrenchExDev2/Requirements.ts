/**
 * StyleRegistry — discoverability surface for the built-in RequirementStyle
 * presets, symmetric to ScaffolderRegistry.
 *
 * SOLID:
 *  - OCP: `register()` adds a project-supplied Style without modifying built-ins
 *  - DIP: tests / tools depend only on the registry, never on individual Style files
 *  - ISP: tiny surface — get(byId) / list() / register()
 *
 * Adding a new built-in Style: import it here and add to BUILT_IN_STYLES.
 * No test file ever needs to know about the new Style — every iterating test
 * picks it up automatically.
 */

import type { RequirementStyle } from '@frenchexdev2/requirements-core';
import { DefaultStyle } from './default.js';
import { IndustrialStyle } from './industrial.js';
import { LeanStyle } from './lean.js';
import { AgileStyle } from './agile.js';
import { KanbanStyle } from './kanban.js';

export interface StyleRegistry {
  /** Look up a Style by its `id` field (e.g. '@frenchexdev2/requirements/styles/default'). */
  get(id: string): RequirementStyle | undefined;
  /** Every registered Style, in registration order. */
  list(): readonly RequirementStyle[];
  /** Add or replace a Style in this registry. Mutates. */
  register(style: RequirementStyle): void;
}

/** The five built-in presets — one per cultural / industrial paradigm. */
export const BUILT_IN_STYLES: readonly RequirementStyle[] = [
  DefaultStyle,
  IndustrialStyle,
  LeanStyle,
  AgileStyle,
  KanbanStyle,
];

class MapStyleRegistry implements StyleRegistry {
  private readonly byId = new Map<string, RequirementStyle>();
  private readonly order: string[] = [];

  constructor(initial: readonly RequirementStyle[]) {
    for (const s of initial) this.register(s);
  }

  get(id: string): RequirementStyle | undefined {
    return this.byId.get(id);
  }

  list(): readonly RequirementStyle[] {
    return this.order.map((id) => this.byId.get(id)!);
  }

  register(style: RequirementStyle): void {
    if (!this.byId.has(style.id)) this.order.push(style.id);
    this.byId.set(style.id, style);
  }
}

/** Factory — fresh registry, useful in tests to avoid global-state bleed. */
export function createStyleRegistry(
  styles: readonly RequirementStyle[] = BUILT_IN_STYLES,
): StyleRegistry {
  return new MapStyleRegistry(styles);
}

/** The default registry, pre-populated with the five built-in Styles. */
export const DEFAULT_STYLE_REGISTRY: StyleRegistry = createStyleRegistry();

/** Resolve the configured identity before requesting an external module through a caller-owned loader. */
export async function resolveStyleFromRegistry(
  id: string,
  registry: StyleRegistry,
  load: (specifier: string) => Promise<unknown>,
): Promise<RequirementStyle> {
  const registered = registry.get(id);
  if (registered) return registered;
  const module = await load(id);
  const isStyle = (value: unknown): value is RequirementStyle => {
    if (value === null || typeof value !== 'object') return false;
    const style = value as Record<string, unknown>;
    if (typeof style.id !== 'string' || !style.id || typeof style.version !== 'string' || !style.version) return false;
    for (const part of ['vocabulary', 'validators', 'templates', 'reporter']) if (style[part] === null || typeof style[part] !== 'object') return false;
    const validators = style.validators as Record<string, unknown>, reporter = style.reporter as Record<string, unknown>, templates = style.templates as Record<string, unknown>;
    return typeof validators.validateSpec === 'function' && typeof validators.validateStatement === 'function' && typeof reporter.renderStatement === 'function' && typeof reporter.renderRequirement === 'function' && typeof reporter.renderMarkdown === 'function' && typeof templates.findTemplate === 'function' && Array.isArray(templates.templates) && Array.isArray(style.fitCriterionAdapters);
  };
  if (module !== null && typeof module === 'object') {
    const exports = module as Record<string, unknown>;
    const candidates = [exports.default, ...Object.values(exports)];
    const style = candidates.find(isStyle);
    if (style) return style;
  }
  throw new TypeError(`Module '${id}' does not export a complete RequirementStyle.`);
}
