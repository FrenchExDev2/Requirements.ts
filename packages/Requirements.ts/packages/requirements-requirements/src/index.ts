// @frenchexdev2/requirements-requirements — Domain vocabulary.
// All Requirements + Features for the @frenchexdev2/requirements-* ecosystem live here.
// Reqs and Features ARE source code; this package holds the lot.
// (requirements-core stays as pure infrastructure: base classes, decorators, style abstractions, ports.)

// ─── Requirements ───
// Universal Reqs every package's Features satisfy
export * from './req-dog-food.js';
export * from './req-parallel-deliverable.js';
export * from './req-dsl-complete.js';
export * from './req-refactor-safe.js';
export * from './req-vocab-industry-aligned.js';
export * from './req-style-open-closed.js';
export * from './req-style-compile-time-narrowing.js';
export * from './req-style-separated-concerns.js';
// Tier-2 roadmaps + cross-cutting Reqs
export * from './req-audit-trail-hooks.js';
export * from './req-bootstrap-zero-friction.js';
export * from './req-discoverable-traceability.js';
export * from './req-editor-first-class.js';
export * from './req-live-feedback.js';
export * from './req-low-friction-acs.js';
export * from './req-orthogonal-toggling.js';
export * from './req-property-invariants.js';
export * from './req-round-trip-editable.js';
export * from './req-scaffold-extensibility.js';
export * from './req-spec-is-source-of-truth.js';
export * from './req-tui-modern.js';
export * from './req-versioned-traceability.js';
export * from './req-visual-traceability.js';

// ─── Features ───
// Self-Features of requirements-core (base classes, decorators, style abstractions)
export * from './base.js';
export * from './decorators.js';
export * from './style-reporter.js';
export * from './style-templates.js';
export * from './style-type-helpers.js';
export * from './style-validators.js';
export * from './style-vocabulary.js';
// Self-Features per impl file across the @frenchexdev2/requirements-* ecosystem
export * from './audit-hooks.js';
export * from './behavioral-check.js';
export * from './clack-adapter.js';
export * from './compliance-core.js';
export * from './compliance-report.js';
export * from './feature-bidirectional-sync.js';
export * from './feature-heuristic-suggester.js';
export * from './feature-mermaid-graph.js';
export * from './feature-new-command.js';
export * from './feature-rename-codemod.js';
export * from './feature-schema-command.js';
export * from './feature-sync-command.js';
export * from './feature-trace-explorer-tui.js';
export * from './feature-watch-mode.js';
export * from './property-testing.js';
export * from './requirement-commands.js';
export * from './scaffold-core.js';
export * from './scaffolder-registry.js';
export * from './smart-constructors.js';
export * from './smoke.js';
export * from './test-bindings-scanner.js';
export * from './test-smells.js';
export * from './toggling.js';
export * from './trace-core.js';
export * from './code-trace.js';
export * from './versioning.js';
export * from './mutation-runner.js';
export * from './kernel-contracts.js';
export * from './declaration-contracts.js';
export * from './qualification-contracts.js';
export * from './participation-contracts.js';
export * from './style-customization.js';
export * from './architecture-contracts.js';
export * from './cli-contracts.js';
