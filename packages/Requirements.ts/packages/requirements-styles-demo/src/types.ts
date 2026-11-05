/**
 * ScenariiPlayer — typed data shapes for a declarative scenario JSON file.
 *
 * A Scenario drives the end-to-end generation of a typed Requirements project:
 * a list of RequirementSeed + FeatureSeed entries is replayed non-interactively
 * through the existing wizard cores, the scaffolder registry is invoked for
 * every declared AC × TestLevel pair, and (optionally) a pluggable AiAdapter
 * is asked to produce AC implementations.
 *
 * Design rules:
 *   - No I/O here — this is the frozen contract imported by shell + core.
 *   - Partial-by-intent: Seeds carry only the fields the scenario author
 *     explicitly sets; everything else is resolved by wizard defaults /
 *     templates.
 *   - `readonly` all the way down (scenarii are replayable artifacts).
 *   - Every forward-reference (`satisfiedByFeatureIds`, `satisfies`) is a
 *     plain string; schema validation cross-checks it against the seeds array.
 *
 * Owner: Stream Scenario (ScenariiPlayerFeature et al.).
 * Satisfies: REQ-SCENARIO-DRIVEN-WORKFLOW, REQ-MULTI-FSM-ORCHESTRATION,
 *            REQ-AI-AS-IMPLEMENTER-ADAPTER.
 */

import { SCHEMA_VERSION, type EarsStatement } from '@frenchexdev2/requirements-core/types';

// ══════════════════════════════════════════════════════════════════════════════
// Scenario — top-level declarative document
// ══════════════════════════════════════════════════════════════════════════════

export interface Scenario {
  /** Optional JSON-Schema pointer (IDE autocompletion). */
  readonly $schema?: string;
  /** Pinned schema version — replay safety. */
  readonly $schemaVersion: typeof SCHEMA_VERSION;

  /** Stable scenario identifier, e.g. 'sis-iec61511-fired-heater'. */
  readonly id: string;
  readonly title: string;
  readonly description: string;

  /**
   * RequirementStyle to use. One of the built-in style names
   * ('default' | 'industrial' | 'lean' | 'agile' | 'kanban') OR a module
   * path that default-exports a RequirementStyle (custom styles).
   */
  readonly style: string;

  /** Seeds replayed through the wizards in declaration order. */
  readonly seeds: {
    readonly requirements: readonly RequirementSeed[];   // 3-10 entries
    readonly features: readonly FeatureSeed[];           // 3-10 entries
  };

  /** Optional runtime targets — AI prompts, expected artifacts, budgets. */
  readonly targets?: ScenarioTargets;

  /** Optional narration for demo capture (clack intro/outro + pacing). */
  readonly narration?: ScenarioNarration;
}

export interface ScenarioTargets {
  /** Per-AC prompt template for `--ai` mode. Key: `"<FEAT-ID>.<acName>"`. */
  readonly aiPrompts?: Readonly<Record<string, string>>;
  /** File paths that MUST exist at scenario end (asserted post-run). */
  readonly expectedArtifacts?: readonly string[];
  /** Wall-clock budget for the whole scenario. */
  readonly timingBudget?: { readonly totalMs: number };
}

export interface ScenarioNarration {
  /** `clack.intro()` banner. */
  readonly intro?: string;
  /** `clack.outro()` banner. */
  readonly outro?: string;
  /** Sleep between FSM transitions in ms (playback pacing for demos). */
  readonly stepDelayMs?: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// Seeds — partial-by-intent
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Partial RequirementSpec — the scenario author sets only what matters for
 * the demo; the wizard's defaults / style-template fill in the rest.
 *
 * Fields not listed here are derived at playback time by
 * `runRequirementWizard(..., { yes: true, template })`.
 */
export interface RequirementSeed {
  readonly id: string;                                 // REQ-…
  readonly title: string;
  readonly kind?: string;                              // style-vocabulary entry
  readonly statement?: EarsStatement;
  /** Forward reference — validated against seeds.features[].id. */
  readonly satisfiedByFeatureIds?: readonly string[];
  /** Style template id (e.g. 'iec61511-sif', 'scrum-story'). */
  readonly template?: string;
}

export interface FeatureSeed {
  readonly id: string;                                 // UPPERCASE-WITH-HYPHENS
  readonly title: string;
  /** Matches a Priority enum label (case-insensitive). */
  readonly priority?: string;
  /** Forward references — validated against seeds.requirements[].id. */
  readonly satisfies?: readonly string[];
  /** Each AC carries its expected test levels (strings match TestLevel enum). */
  readonly acs: readonly FeatureSeedAc[];
}

export interface FeatureSeedAc {
  readonly name: string;                               // camelCase AC name
  readonly expects: readonly string[];                 // TestLevel enum values
}
