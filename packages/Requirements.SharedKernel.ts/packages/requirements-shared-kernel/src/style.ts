/**
 * RequirementStyle — the ontology + behaviors a project adopts for its requirements.
 *
 * A Style bundles:
 *   - Vocabulary  : kinds, statuses, risk levels, sources, statement patterns (data)
 *   - Validators  : statement shape checks, spec shape checks          (behavior / port)
 *   - Templates   : pre-filled skeletons for `requirement new`         (behavior)
 *   - Reporter    : how to render a Requirement to Markdown / console  (behavior / port)
 *   - Adapters    : FitCriterion evaluators                            (behavior / port)
 *
 * Default preset: @frenchexdev2/requirements/style — 29148 + Volere + EARS.
 * Projects override per-concern (legal / safety-critical / domain-specific) by
 * declaring a const-typed Style and wiring it into requirements.config.json.
 *
 * SOLID:
 *   S — each sub-interface owns one concern (vocabulary vs validators vs templates vs reporter)
 *   O — add a new Style without modifying the Requirement base class
 *   L — a custom Style is substitutable for DefaultStyle
 *   I — small interfaces; projects implement only what they override
 *   D — Requirement<S> depends on the Style abstraction, not DefaultStyle
 */

import type { AdapterContext, FitCriterionAdapter } from './ports/external.js';

// ══════════════════════════════════════════════════════════════════════════════
// Vocabulary — the data a Style supplies
// ══════════════════════════════════════════════════════════════════════════════

export interface StyleVocabulary {
  /** Requirement kinds the project recognises (Functional, Obligation, SafetyCase, …). */
  readonly requirementKinds: readonly string[];

  /** Status workflow as a small FSM. */
  readonly statusWorkflow: StatusWorkflow;

  /** Risk taxonomy — user-defined levels with optional likelihood×impact matrix. */
  readonly riskTaxonomy: RiskTaxonomy;

  /** Verification methods recognised (Test, Inspection, …). */
  readonly verificationMethods: readonly string[];

  /** Valid `kind` discriminants for a Rationale. */
  readonly rationaleKinds: readonly string[];

  /** Source kinds — each with its own slot shape (citation, role+date, …). */
  readonly sourceKinds: readonly SourceKindSchema[];

  /** Statement patterns — EARS by default; a legal DSL might ship obligation/permission/prohibition. */
  readonly statementPatterns: readonly StatementPatternSchema[];
}

export interface StatusWorkflow {
  readonly states: readonly string[];
  readonly initial: string;
  readonly transitions: readonly { readonly from: string; readonly to: string }[];
  readonly terminal: readonly string[];
}

export interface RiskTaxonomy {
  readonly levels: readonly string[];
  readonly matrix?: RiskMatrix;
}

export interface RiskMatrix {
  readonly axes: {
    readonly likelihood: readonly string[];
    readonly impact: readonly string[];
  };
  readonly cells: readonly { readonly likelihood: string; readonly impact: string; readonly level: string }[];
}

export interface SourceKindSchema {
  readonly kind: string;
  readonly label: string;
  readonly slots: readonly SourceSlot[];
}

export interface SourceSlot {
  readonly name: string;
  readonly type: 'string' | 'iso-date' | 'number' | 'url';
  readonly required: boolean;
  readonly hint?: string;
}

export interface StatementPatternSchema {
  readonly pattern: string;
  readonly label: string;
  readonly slots: readonly StatementSlot[];
  /** Human template used by renderers: "When {trigger}, the system shall {response}." */
  readonly template: string;
}

export interface StatementSlot {
  readonly name: string;
  readonly required: boolean;
  readonly hint?: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Validators — pluggable shape checks
// ══════════════════════════════════════════════════════════════════════════════

export interface ValidationResult {
  readonly ok: boolean;
  readonly errors: readonly ValidationError[];
}

export interface ValidationError {
  readonly path: string;
  readonly message: string;
}

export interface StyleValidators {
  /** Validate a statement value against the style's patterns. */
  validateStatement(statement: unknown): ValidationResult;

  /** Validate a full Requirement spec against the style's vocabulary + schema. */
  validateSpec(spec: unknown): ValidationResult;
}

// ══════════════════════════════════════════════════════════════════════════════
// Templates — pre-filled skeletons for `requirement new --template <id>`
// ══════════════════════════════════════════════════════════════════════════════

export interface RequirementTemplate {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Partial skeleton — the wizard fills in the rest interactively. */
  readonly skeleton: TemplateSkeleton;
}

export interface TemplateSkeleton {
  readonly kind?: string;
  readonly statementPattern?: string;
  readonly priority?: string;
  readonly defaultFitCriterionKinds?: readonly string[];
  readonly rationaleKind?: string;
  readonly verificationMethod?: string;
}

export interface StyleTemplates {
  readonly templates: readonly RequirementTemplate[];
  findTemplate(id: string): RequirementTemplate | undefined;
}

// ══════════════════════════════════════════════════════════════════════════════
// Reporter — how the style renders a Requirement
// ══════════════════════════════════════════════════════════════════════════════

export interface RequirementReporter {
  /** Render a single Requirement's statement to a human string. */
  renderStatement(statement: unknown): string;

  /** Render a full Requirement (for `requirement show`). */
  renderRequirement(spec: unknown): string;

  /** Render a Requirement as Markdown (for `requirement export --format md`). */
  renderMarkdown(spec: unknown): string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Style — the coherent bundle
// ══════════════════════════════════════════════════════════════════════════════

export interface RequirementStyle {
  readonly id: string;
  readonly version: string;

  readonly vocabulary: StyleVocabulary;
  readonly validators: StyleValidators;
  readonly templates: StyleTemplates;
  readonly reporter: RequirementReporter;

  /** Pluggable evaluators per FitCriterion kind — projects can drop in Datadog/Grafana/etc. */
  readonly fitCriterionAdapters: readonly FitCriterionAdapter[];

  /** Optional hook: style-specific setup at wizard start (e.g. fetch OKR list from an API). */
  onWizardStart?(ctx: AdapterContext): Promise<void>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Extracting types from a const-typed Style (compile-time narrowing)
// ══════════════════════════════════════════════════════════════════════════════

export type KindsOf<S extends RequirementStyle>            = S['vocabulary']['requirementKinds'][number];
export type StatusesOf<S extends RequirementStyle>         = S['vocabulary']['statusWorkflow']['states'][number];
export type RiskLevelsOf<S extends RequirementStyle>       = S['vocabulary']['riskTaxonomy']['levels'][number];
export type VerificationMethodsOf<S extends RequirementStyle> = S['vocabulary']['verificationMethods'][number];
export type RationaleKindsOf<S extends RequirementStyle>   = S['vocabulary']['rationaleKinds'][number];
export type SourceKindsOf<S extends RequirementStyle>      = S['vocabulary']['sourceKinds'][number]['kind'];
export type StatementPatternsOf<S extends RequirementStyle> = S['vocabulary']['statementPatterns'][number]['pattern'];
