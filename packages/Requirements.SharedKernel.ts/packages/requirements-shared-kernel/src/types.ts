/**
 * Phase 0 contract types — the frozen vocabulary shared by Phase 1 Streams A–F.
 *
 * This file is the agent on-ramp: every other module imports from here, no module
 * redefines these shapes. Amendments go through a `[phase-0-amend]` PR only.
 *
 * Organization:
 *   1. Branded primitives     (Tier 1)
 *   2. Smart constructors     (parse, don't validate)
 *   3. Discriminated unions   (EARS, source, traced-to, rationale, evidence, history)
 *   4. Generative types       (status workflow, risk taxonomy — project-extensible)
 *   5. Fit criteria + adapters
 *   6. Spec shapes            (FeatureSpec, RequirementSpec, Spec union)
 *   7. Sync plan              (create / unchanged / modified)
 *   8. Schema version constant
 *
 * Everything JSON-serializable: on disk as strings / numbers / arrays of same.
 */

import type { Priority, TestLevel } from './base.js';

// ══════════════════════════════════════════════════════════════════════════════
// 1. Branded primitives
// ══════════════════════════════════════════════════════════════════════════════

const brand: unique symbol = Symbol.for('@frenchexdev2/requirements/brand');

export type RequirementId = string & { readonly [brand]: 'RequirementId' };
export type FeatureId     = string & { readonly [brand]: 'FeatureId' };
export type AcName        = string & { readonly [brand]: 'AcName' };
export type IsoDate       = string & { readonly [brand]: 'IsoDate' };
export type Sentence      = string & { readonly [brand]: 'Sentence' };
export type Percentage    = number & { readonly [brand]: 'Percentage' };

// ══════════════════════════════════════════════════════════════════════════════
// 2. Smart constructors — the only way to mint a branded value
// ══════════════════════════════════════════════════════════════════════════════

export const REQUIREMENT_ID_PATTERN = /^REQ-[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/;
export const FEATURE_ID_PATTERN     = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/;
export const AC_NAME_PATTERN        = /^[a-z][a-zA-Z0-9]*$/;
export const ISO_DATE_PATTERN       = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/;

export class ParseError extends Error {
  constructor(public readonly field: string, public readonly value: unknown, message: string) {
    super(`${field}: ${message} (got ${JSON.stringify(value)})`);
    this.name = 'ParseError';
  }
}

/**
 * Smart constructors — parse-don't-validate.
 *
 * Each constructor accepts only its declared TypeScript input type AND adds a
 * runtime `typeof` guard so callers bypassing TypeScript (JSON.parse output,
 * dynamic imports, FFI, REST handlers) receive a ParseError instead of a
 * TypeError. Industrial-grade hardening — see REQ-PROPERTY-INVARIANTS.
 */

function requireString(s: unknown, field: string): asserts s is string {
  if (typeof s !== 'string') throw new ParseError(field, s, 'must be a string');
}

function requireNumber(n: unknown, field: string): asserts n is number {
  if (typeof n !== 'number') throw new ParseError(field, n, 'must be a number');
}

export function requirementId(s: string): RequirementId {
  requireString(s, 'RequirementId');
  if (!REQUIREMENT_ID_PATTERN.test(s)) throw new ParseError('RequirementId', s, `must match ${REQUIREMENT_ID_PATTERN}`);
  return s as RequirementId;
}

export function featureId(s: string): FeatureId {
  requireString(s, 'FeatureId');
  if (!FEATURE_ID_PATTERN.test(s)) throw new ParseError('FeatureId', s, `must match ${FEATURE_ID_PATTERN}`);
  return s as FeatureId;
}

export function acName(s: string): AcName {
  requireString(s, 'AcName');
  if (!AC_NAME_PATTERN.test(s)) throw new ParseError('AcName', s, `must be camelCase matching ${AC_NAME_PATTERN}`);
  return s as AcName;
}

export function isoDate(s: string): IsoDate {
  requireString(s, 'IsoDate');
  if (!ISO_DATE_PATTERN.test(s)) throw new ParseError('IsoDate', s, 'must be ISO 8601 (YYYY-MM-DD or full datetime)');
  return s as IsoDate;
}

export function sentence(s: string): Sentence {
  requireString(s, 'Sentence');
  const trimmed = s.trim();
  if (trimmed.length === 0) throw new ParseError('Sentence', s, 'must be non-empty');
  if (!/[.!?]$/.test(trimmed)) throw new ParseError('Sentence', s, 'must end with . ! or ?');
  return trimmed as Sentence;
}

export function percentage(n: number): Percentage {
  requireNumber(n, 'Percentage');
  if (!Number.isFinite(n)) throw new ParseError('Percentage', n, 'must be finite');
  if (n < 0 || n > 100)    throw new ParseError('Percentage', n, 'must be in [0, 100]');
  return n as Percentage;
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. Discriminated unions — EARS statement, source, traced-to, rationale, history
// ══════════════════════════════════════════════════════════════════════════════

/** EARS notation (Mavin et al., Rolls-Royce 2009). Five typed patterns + natural fallback. */
export type EarsStatement =
  | { readonly pattern: 'ubiquitous';                           readonly response: Sentence }
  | { readonly pattern: 'event-driven';  readonly trigger: Sentence;  readonly response: Sentence }
  | { readonly pattern: 'state-driven';  readonly state: Sentence;    readonly response: Sentence }
  | { readonly pattern: 'optional';      readonly feature: Sentence;  readonly response: Sentence }
  | { readonly pattern: 'unwanted';      readonly trigger: Sentence;  readonly response: Sentence }
  | { readonly pattern: 'natural';       readonly text: Sentence };

export type EarsPattern = EarsStatement['pattern'];

/** Provenance — who/what authority asked for this Requirement. */
export type RequirementSource =
  | { readonly type: 'stakeholder';      readonly role: string;          readonly date: IsoDate }
  | { readonly type: 'regulation';       readonly citation: Citation }
  | { readonly type: 'standard';         readonly org: string;           readonly id: string; readonly section?: string }
  | { readonly type: 'contract';         readonly doc: string;           readonly clause?: string }
  | { readonly type: 'risk';             readonly registerEntry: string; readonly severity: string }
  | { readonly type: 'business-goal';    readonly okrId: string;         readonly period: string }
  | { readonly type: 'incident';         readonly incidentId: string;    readonly date: IsoDate; readonly postmortemUrl?: string }
  | { readonly type: 'domain-knowledge'; readonly reference: string };

export type RequirementSourceKind = RequirementSource['type'];

/** Parsed legal citation. */
export interface Citation {
  readonly jurisdiction: string;
  readonly act: string;
  readonly article?: string;
  readonly paragraph?: string;
}

/** Opaque external link. */
export type TracedTo =
  | { readonly system: 'linear'; readonly ticket: string }
  | { readonly system: 'github'; readonly org: string; readonly repo: string; readonly issue: number }
  | { readonly system: 'notion'; readonly pageId: string }
  | { readonly system: 'jira';   readonly project: string; readonly issue: number }
  | { readonly system: 'url';    readonly href: string; readonly label?: string };

/** Structured rationale — typed so auditors can grep for faith-based requirements. */
export interface Rationale {
  readonly claim: Sentence;
  readonly kind: RationaleKind;
  readonly evidence: readonly Evidence[];
  readonly assumptions?: readonly Sentence[];
}

export type RationaleKind =
  | 'evidence-based'
  | 'principle'
  | 'value-driven'
  | 'regulatory-compliance'
  | 'risk-mitigation'
  | 'precedent';

export type Evidence =
  | { readonly kind: 'metric';         readonly name: string; readonly value: string; readonly date: IsoDate; readonly sourceUrl?: string }
  | { readonly kind: 'incident';       readonly ref: string;  readonly date: IsoDate; readonly postmortemUrl?: string }
  | { readonly kind: 'study';          readonly title: string; readonly authors: string; readonly year: number; readonly url?: string }
  | { readonly kind: 'expert-opinion'; readonly expert: string; readonly recordedAt: IsoDate }
  | { readonly kind: 'precedent';      readonly requirement: RequirementId; readonly rationale: string };

/** Append-only audit trail entry. */
export interface HistoryEntry {
  readonly date: IsoDate;
  readonly author: string;
  readonly change: ChangeKind;
  readonly reason: string;
  /** Optional audit-trail-hooks (REQ-AUDIT-TRAIL-HOOKS). Shape validated by
   *  {@link ./audit-hooks}.validateSignatureShape; full cryptographic
   *  verification is deferred to Tier 3. Always additive on wire. */
  readonly signature?: SignatureInfo;
}

/**
 * Audit-trail signature envelope (REQ-AUDIT-TRAIL-HOOKS — hook-only layer).
 * Shape-only in Tier 2; Tier 3 adds crypto verification.
 */
export interface SignatureInfo {
  readonly signer: string;
  readonly algorithm: 'ed25519' | 'rsa-sha256';
  readonly signedAt: IsoDate;
  /** base64-encoded signature over the canonical spec hash */
  readonly payload: string;
  /** optional key-rotation pointer */
  readonly publicKeyRef?: string;
}

export type ChangeKind =
  | 'Created'
  | 'StatusChanged'
  | 'StatementEdited'
  | 'AcAdded'
  | 'AcRemoved'
  | 'AcRenamed'
  | 'SatisfiedByChanged'
  | 'FitCriterionAdded'
  | 'FitCriterionRemoved'
  | 'RiskReassessed'
  | 'RationaleUpdated'
  | 'Deprecated'
  // ── REQ-AUDIT-TRAIL-HOOKS additions (Tier-2 hook-only) ──
  | 'Reviewed'
  | 'ApprovedBy'
  | 'SignedOff'
  | 'RejectedBy';

// ══════════════════════════════════════════════════════════════════════════════
// 4. Generative types — user-extensible status and risk
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Default status preset (29148-aligned). Projects override via requirements.config.json;
 * Stream E codegen emits a project-specific RequirementStatus union + transition guard.
 * When no override, this preset is authoritative.
 */
export type DefaultRequirementStatus =
  | 'Draft'
  | 'Approved'
  | 'Implemented'
  | 'Verified'
  | 'Deprecated';

export interface StatusWorkflow {
  readonly states: readonly string[];
  readonly initial: string;
  readonly transitions: readonly { readonly from: string; readonly to: string }[];
  readonly terminal: readonly string[];
}

export const DEFAULT_STATUS_WORKFLOW = {
  states: ['Draft', 'Approved', 'Implemented', 'Verified', 'Deprecated'] as const satisfies readonly DefaultRequirementStatus[],
  initial: 'Draft' as const satisfies DefaultRequirementStatus,
  transitions: [
    { from: 'Draft',       to: 'Approved' },
    { from: 'Approved',    to: 'Implemented' },
    { from: 'Implemented', to: 'Verified' },
    { from: 'Verified',    to: 'Deprecated' },
    { from: 'Approved',    to: 'Deprecated' },
    { from: 'Draft',       to: 'Deprecated' },
  ] as const satisfies readonly { readonly from: DefaultRequirementStatus; readonly to: DefaultRequirementStatus }[],
  terminal: ['Deprecated'] as const satisfies readonly DefaultRequirementStatus[],
} satisfies StatusWorkflow;

/** Default risk taxonomy. Projects redeclare (e.g. DO-178C, legal 4-tier). */
export type DefaultRiskLevel = 'Critical' | 'High' | 'Medium' | 'Low';

export interface RiskTaxonomy {
  readonly levels: readonly string[];
  readonly matrix?: RiskMatrix;
}

export const DEFAULT_RISK_TAXONOMY = {
  levels: ['Critical', 'High', 'Medium', 'Low'] as const satisfies readonly DefaultRiskLevel[],
} satisfies RiskTaxonomy;

export interface RiskMatrix {
  readonly axes: {
    readonly likelihood: readonly string[];
    readonly impact: readonly string[];
  };
  readonly cells: readonly { readonly likelihood: string; readonly impact: string; readonly level: string }[];
}

export interface Risk {
  readonly level: string;                    // one of the taxonomy's levels
  readonly ifNotMet: Sentence;
  readonly mitigations?: readonly Sentence[];
}

export type RequirementKind =
  | 'Functional'
  | 'NonFunctional'
  | 'Constraint'
  | 'Compliance'
  | 'UserStory';

export type VerificationMethod = 'Test' | 'Inspection' | 'Analysis' | 'Demonstration';

// ══════════════════════════════════════════════════════════════════════════════
// 5. Fit criteria — executable verifiables
// ══════════════════════════════════════════════════════════════════════════════

export type FitCriterion =
  | { readonly kind: 'unit-test';          readonly describes: Sentence; readonly binds: readonly AcName[] }
  | { readonly kind: 'coverage-threshold'; readonly metric: 'line' | 'branch' | 'mutation'; readonly min: Percentage; readonly scope: string }
  | { readonly kind: 'quality-gate';       readonly tool: string; readonly rule: string }
  | { readonly kind: 'metric';             readonly name: string; readonly query: string; readonly operator: '<' | '<=' | '=' | '>=' | '>'; readonly threshold: number; readonly window?: string }
  | { readonly kind: 'inspection';         readonly checklist: readonly Sentence[]; readonly reviewers: readonly string[] }
  | { readonly kind: 'demonstration';      readonly scenario: Sentence; readonly recordingUrl?: string }
  | { readonly kind: 'narrative';          readonly text: Sentence };

export type FitCriterionKind = FitCriterion['kind'];

export type FitVerdict =
  | { readonly status: 'Met';            readonly evaluatedAt: IsoDate }
  | { readonly status: 'Unmet';          readonly evaluatedAt: IsoDate; readonly reason: string }
  | { readonly status: 'Pending';        readonly reason: string }
  | { readonly status: 'NotApplicable';  readonly reason: string };

// ══════════════════════════════════════════════════════════════════════════════
// 6. Spec shapes — the JSON on disk
// ══════════════════════════════════════════════════════════════════════════════

export const SCHEMA_VERSION = '2026-04-14' as const;
export type SchemaVersion = typeof SCHEMA_VERSION;

/** Every spec carries its schema version for migration safety. */
export interface VersionedSpec {
  readonly $schemaVersion: SchemaVersion;
  readonly $schema?: string;                 // relative path to feature-spec.schema.json / requirement-spec.schema.json
}

export interface AcSpec {
  readonly name: AcName;
  readonly expects: readonly TestLevel[];    // must be non-empty
}

export interface FeatureSpec extends VersionedSpec {
  readonly kind: 'feature';
  readonly id: FeatureId;
  readonly title: string;
  readonly priority: Priority;
  readonly satisfies?: readonly RequirementId[];
  readonly acs: readonly AcSpec[];
  readonly history?: readonly HistoryEntry[];
}

export interface RequirementSpec extends VersionedSpec {
  readonly kind: 'requirement';
  readonly id: RequirementId;
  readonly title: string;
  readonly statement: EarsStatement;
  readonly requirementKind: RequirementKind;
  readonly priority: Priority;
  readonly status: string;                   // project's workflow state (no hardcoded enum)
  readonly source: RequirementSource;
  readonly rationale: Rationale;
  readonly fitCriteria: readonly FitCriterion[];
  readonly verificationMethod: VerificationMethod;
  readonly risk: Risk;
  readonly refines?: readonly RequirementId[];     // parent requirements
  readonly satisfiedBy: readonly FeatureId[];      // child features
  readonly tracedTo?: readonly TracedTo[];
  readonly history?: readonly HistoryEntry[];
}

export type Spec = FeatureSpec | RequirementSpec;

// ══════════════════════════════════════════════════════════════════════════════
// 7. Sync plan — the diff/apply contract between cores and shell
// ══════════════════════════════════════════════════════════════════════════════

export type EntryStatus = 'create' | 'unchanged' | 'modified';

export interface Hunk {
  readonly removed: readonly string[];
  readonly added: readonly string[];
  readonly contextBefore?: string;
  readonly contextAfter?: string;
}

export interface SyncEntry {
  readonly path: string;
  readonly status: EntryStatus;
  readonly proposed: string;
  readonly current: string | null;           // null when status=create
  readonly hunks: readonly Hunk[];           // empty when status=unchanged
}

export interface SyncPlan {
  readonly spec: Spec;
  readonly entries: readonly SyncEntry[];
}
