/**
 * Requirements Tracking DSL — Base Types.
 * Features and Requirements are abstract classes.
 * ACs are abstract methods (Feature → AC is composition, UML black diamond).
 * Requirement is generic over a RequirementStyle (project-defined ontology).
 */

import type {
  RequirementStyle,
  KindsOf,
  StatusesOf,
  RiskLevelsOf,
  VerificationMethodsOf,
  RationaleKindsOf,
  SourceKindsOf,
  StatementPatternsOf,
} from './style.js';

export enum Priority {
  Critical = 'critical',
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

export interface ACResult {
  satisfied: boolean;
  reason?: string;
}

export enum TestLevel {
  Unit           = 'unit',
  Functional     = 'functional',
  EndToEnd       = 'e2e',
  Accessibility  = 'a11y',
  Internationalization = 'i18n',
  Visual         = 'visual',
  Performance    = 'perf',
}

export abstract class Feature {
  abstract readonly id: string;
  abstract readonly title: string;
  abstract readonly priority: Priority;
  readonly enabled?: boolean;
}

/**
 * Requirement — the WHY tier of the traceability chain.
 * Requirement → (decomposes into) Feature[] → (specifies via) AC[] → (verified by) Test[].
 *
 * The class IS the spec — every field that was once only in JSDoc prose is now
 * a typed abstract field. Generic over a RequirementStyle so a project's
 * vocabulary (kinds / statuses / patterns / risk levels / …) is narrowed at
 * compile time when the project declares its style as `const`.
 *
 * Parse, don't validate: wizard constructs typed values; the type system
 * carries the invariant everywhere afterwards.
 *
 * SOLID:
 *   - O: new Styles without changing this class
 *   - L: any Style substitutes for DefaultStyle
 *   - D: depends on abstract Style, not concrete DefaultStyle
 */
export abstract class Requirement<S extends RequirementStyle = RequirementStyle> {
  abstract readonly id: string;
  abstract readonly title: string;
  abstract readonly priority: Priority;

  /** Narrowed to the project's statusWorkflow.states when a const-typed Style is supplied. */
  abstract readonly status: StatusesOf<S>;

  /** Narrowed to the project's requirementKinds. */
  abstract readonly kind: KindsOf<S>;

  /** Shape governed by the project's statementPatterns (EARS by default). */
  abstract readonly statement: RequirementStatement<StatementPatternsOf<S>>;

  /** Free structured reasoning — rationaleKinds validated by the style. */
  abstract readonly rationale: RequirementRationale<RationaleKindsOf<S>>;

  /** Executable verifiables — style supplies adapters per FitCriterionKind. */
  abstract readonly fitCriteria: readonly RequirementFitCriterion[];

  /** Narrowed to the project's verificationMethods. */
  abstract readonly verificationMethod: VerificationMethodsOf<S>;

  /** Provenance — style declares which source kinds are legal and their slots. */
  abstract readonly source: RequirementProvenance<SourceKindsOf<S>>;

  /** Risk tied to the project's riskTaxonomy.levels. */
  abstract readonly risk: RequirementRisk<RiskLevelsOf<S>>;

  /** Parent Requirements (via @Refines, inverse = refinedBy). */
  readonly refines?: readonly string[];

  /** Opaque external links — Linear / GitHub / Notion / Jira / url. */
  readonly tracedTo?: readonly TracedToLink[];

  /** Append-only audit trail. */
  readonly history?: readonly RequirementHistoryEntry[];
}

// ── Field shapes referenced by Requirement<S> ──
// These are the *structural* types; the style's vocabulary constrains the string-typed discriminants.

export interface RequirementStatement<P extends string = string> {
  readonly pattern: P;
  readonly [slot: string]: string;                    // pattern-specific slots
}

export interface RequirementRationale<K extends string = string> {
  readonly claim: string;
  readonly kind: K;
  readonly evidence: readonly RequirementEvidence[];
  readonly assumptions?: readonly string[];
}

export type RequirementEvidence =
  | { readonly kind: 'metric';         readonly name: string; readonly value: string; readonly date: string; readonly sourceUrl?: string }
  | { readonly kind: 'incident';       readonly ref: string;  readonly date: string; readonly postmortemUrl?: string }
  | { readonly kind: 'study';          readonly title: string; readonly authors: string; readonly year: number; readonly url?: string }
  | { readonly kind: 'expert-opinion'; readonly expert: string; readonly recordedAt: string }
  | { readonly kind: 'precedent';      readonly requirement: string; readonly rationale: string };

export type RequirementFitCriterion =
  | { readonly kind: 'unit-test';          readonly describes: string; readonly binds: readonly string[] }
  | { readonly kind: 'coverage-threshold'; readonly metric: 'line' | 'branch' | 'mutation'; readonly min: number; readonly scope: string }
  | { readonly kind: 'quality-gate';       readonly tool: string; readonly rule: string }
  | { readonly kind: 'metric';             readonly name: string; readonly query: string; readonly operator: '<' | '<=' | '=' | '>=' | '>'; readonly threshold: number; readonly window?: string }
  | { readonly kind: 'inspection';         readonly checklist: readonly string[]; readonly reviewers: readonly string[] }
  | { readonly kind: 'demonstration';      readonly scenario: string; readonly recordingUrl?: string }
  | { readonly kind: 'narrative';          readonly text: string };

export interface RequirementProvenance<K extends string = string> {
  readonly type: K;
  readonly [slot: string]: string | number | undefined;
}

export interface RequirementRisk<L extends string = string> {
  readonly level: L;
  readonly ifNotMet: string;
  readonly mitigations?: readonly string[];
}

export type TracedToLink =
  | { readonly system: 'linear'; readonly ticket: string }
  | { readonly system: 'github'; readonly org: string; readonly repo: string; readonly issue: number }
  | { readonly system: 'notion'; readonly pageId: string }
  | { readonly system: 'jira';   readonly project: string; readonly issue: number }
  | { readonly system: 'url';    readonly href: string; readonly label?: string };

export interface RequirementHistoryEntry {
  readonly date: string;
  readonly author: string;
  readonly change: string;
  readonly reason: string;
}
