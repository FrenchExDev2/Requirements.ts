// @frenchexdev2/requirements — Requirements Tracking DSL
// Kernel surface (base, decorators, style abstraction) — see @frenchexdev2/requirements-core
export * from '@frenchexdev2/requirements-core';

// ── Style presets (one import per preset) ───────────────────────────────────
// Stay in this package until Ship 3 extracts them into @frenchexdev2/requirements-styles
export { DefaultStyle, type DefaultStyleType } from './styles/default.js';
export { IndustrialStyle, type IndustrialStyleType } from './styles/industrial.js';
export { LeanStyle, type LeanStyleType } from './styles/lean.js';
export { AgileStyle, type AgileStyleType } from './styles/agile.js';
export { KanbanStyle, type KanbanStyleType } from './styles/kanban.js';

// ── Style registry — discoverability + OCP for project-defined Styles ───────
export {
  type StyleRegistry,
  BUILT_IN_STYLES,
  createStyleRegistry,
  DEFAULT_STYLE_REGISTRY,
} from './styles/registry.js';
