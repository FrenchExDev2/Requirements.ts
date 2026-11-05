/**
 * ScenariiPlayer CLI command cores (pure, I/O through ports).
 *
 * Six subcommands: play / record / list / validate / inspect / export.
 *
 * Design rules:
 *   - No direct `fs`/`process` — every capability is injected via a typed port.
 *   - Every result is a plain data record (caller decides how to render / exit).
 *   - The orchestrator dependency is an injected port too: if Stream B1 has not
 *     landed at call time, tests provide a stub; the shell will wire the real
 *     orchestrator once it exists.
 *
 * Satisfies: Features SCENARIO-PLAY / SCENARIO-RECORD / SCENARIO-LIST /
 *            SCENARIO-VALIDATE / SCENARIO-INSPECT / SCENARIO-EXPORT.
 */

import * as nodePath from 'node:path';
const path = nodePath.posix;
import type { FileSystem } from '@frenchexdev2/requirements-core/ports';
import type { Scenario, RequirementSeed, FeatureSeed } from './types.js';
import { SCHEMA_VERSION } from '@frenchexdev2/requirements-core/types';
import type { OrchestratorEvent as OrchEvent } from './orchestrator.js';
import { makeOrchestratorEventAdapter, type UiEvent } from './event-bridge.js';

// ══════════════════════════════════════════════════════════════════════════════
// Orchestrator port — thin surface; B1 implements this.
// ══════════════════════════════════════════════════════════════════════════════

export interface OrchestratorPlanStep {
  readonly fsm: 'ProjectLifecycle' | 'PerFeature' | 'PerAc';
  readonly from: string;
  readonly to: string;
  readonly event: string;
  readonly guard?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface OrchestratorRunOptions {
  readonly ai: boolean;
  readonly seed: number;
  readonly dryRun: boolean;
  readonly cwd: string;
  /**
   * Optional live event sink invoked on every orchestrator emit. Subscription
   * lifetime is tied to this `run()` call — implementations unsubscribe on
   * return. Consumers wanting UI-shaped events should use `playScenario`'s
   * `onUiEvent` param instead; this seam is the low-level raw stream.
   */
  readonly onEvent?: (e: OrchEvent) => void;
}

export interface OrchestratorRunResult {
  readonly transitions: readonly OrchestratorPlanStep[];
  readonly artifacts: readonly string[];
  readonly complianceOk: boolean;
  readonly complianceOutput: string;
  readonly narrationIntro?: string;
  readonly narrationOutro?: string;
  readonly stepDelayMs?: number;
  readonly failure?: string;
}

export interface Orchestrator {
  /** Pure planner — no side effects; used by inspect and dry-run. */
  plan(scenario: Scenario): readonly OrchestratorPlanStep[];
  /** Full run — writes artifacts unless `dryRun`. */
  run(scenario: Scenario, opts: OrchestratorRunOptions): Promise<OrchestratorRunResult>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Schema validator port — injected so tests don't hit disk.
// ══════════════════════════════════════════════════════════════════════════════

export interface SchemaValidator {
  validate(scenario: unknown): Promise<{
    readonly ok: boolean;
    readonly errors: readonly { readonly path: string; readonly message: string }[];
  }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Known styles (cross-checked by play/validate).
// ══════════════════════════════════════════════════════════════════════════════

export const BUILT_IN_STYLE_NAMES: readonly string[] = [
  'default',
  'industrial',
  'lean',
  'agile',
  'kanban',
];

// ══════════════════════════════════════════════════════════════════════════════
// 1. VALIDATE
// ══════════════════════════════════════════════════════════════════════════════

export interface ValidateResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly exitCode: 0 | 1;
}

export interface ValidateOptions {
  readonly strict: boolean;
}

/**
 * Validate a scenario JSON string.
 *
 *   - Schema check (via injected SchemaValidator).
 *   - Duplicate-id check.
 *   - Forward-reference cross-checks (warning without --strict, error with).
 *
 * Never writes to disk.
 */
export async function validateScenario(
  rawJson: string,
  validator: SchemaValidator,
  opts: ValidateOptions,
): Promise<ValidateResult> {
  // ── Parse ─────────────────────────────────────────────────────────────
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    return {
      ok: false,
      errors: [`Malformed JSON: ${(e as Error).message}`],
      warnings: [],
      exitCode: 1,
    };
  }

  // ── Schema ────────────────────────────────────────────────────────────
  const schema = await validator.validate(parsed);
  if (!schema.ok) {
    return {
      ok: false,
      errors: schema.errors.map((e) => `${e.path}: ${e.message}`),
      warnings: [],
      exitCode: 1,
    };
  }

  const s = parsed as Scenario;
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Duplicate ids ────────────────────────────────────────────────────
  const reqIds = new Set<string>();
  for (const r of s.seeds.requirements) {
    if (reqIds.has(r.id)) errors.push(`Duplicate requirement id: ${r.id}`);
    reqIds.add(r.id);
  }
  const featIds = new Set<string>();
  for (const f of s.seeds.features) {
    if (featIds.has(f.id)) errors.push(`Duplicate feature id: ${f.id}`);
    featIds.add(f.id);
  }

  // ── Forward references ───────────────────────────────────────────────
  const xrefProblems: string[] = [];
  for (const r of s.seeds.requirements) {
    for (const fid of r.satisfiedByFeatureIds ?? []) {
      if (!featIds.has(fid)) {
        xrefProblems.push(`Requirement ${r.id}: satisfiedByFeatureIds → unknown feature '${fid}'`);
      }
    }
  }
  for (const f of s.seeds.features) {
    for (const rid of f.satisfies ?? []) {
      if (!reqIds.has(rid)) {
        xrefProblems.push(`Feature ${f.id}: satisfies → unknown requirement '${rid}'`);
      }
    }
  }

  if (xrefProblems.length > 0) {
    if (opts.strict) errors.push(...xrefProblems);
    else warnings.push(...xrefProblems);
  }

  const ok = errors.length === 0;
  return { ok, errors, warnings, exitCode: ok ? 0 : 1 };
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. LIST
// ══════════════════════════════════════════════════════════════════════════════

export interface ScenarioEntry {
  readonly id: string;
  readonly title: string;
  readonly style: string;
  readonly path: string;
  readonly source: 'built-in' | 'project';
}

export interface ListResult {
  readonly entries: readonly ScenarioEntry[];
  readonly isEmpty: boolean;
  readonly hint?: string;
}

export interface ListOptions {
  readonly builtInDir: string;
  readonly projectDir: string;
}

async function loadEntriesFromDir(
  fs: FileSystem,
  dir: string,
  source: 'built-in' | 'project',
): Promise<ScenarioEntry[]> {
  if (!(await fs.exists(dir))) return [];
  const names = await fs.readdir(dir);
  const entries: ScenarioEntry[] = [];
  for (const n of names) {
    if (!n.endsWith('.scenario.json')) continue;
    const full = path.join(dir, n);
    try {
      const raw = await fs.readFile(full, 'utf8');
      const parsed = JSON.parse(raw) as Partial<Scenario>;
      entries.push({
        id: String(parsed.id ?? n.replace(/\.scenario\.json$/, '')),
        title: String(parsed.title ?? '(untitled)'),
        style: String(parsed.style ?? 'default'),
        path: full,
        source,
      });
    } catch {
      /* skip malformed */
    }
  }
  return entries;
}

export async function listScenarios(
  fs: FileSystem,
  opts: ListOptions,
): Promise<ListResult> {
  const builtIn = await loadEntriesFromDir(fs, opts.builtInDir, 'built-in');
  const project = await loadEntriesFromDir(fs, opts.projectDir, 'project');
  const merged = [...builtIn, ...project].sort((a, b) => a.id.localeCompare(b.id));
  if (merged.length === 0) {
    return {
      entries: [],
      isEmpty: true,
      hint:
        'No scenarios found. Built-in scenarios ship under packages/requirements/scenarios/. ' +
        'Project-local scenarios live in ./scenarios/*.scenario.json',
    };
  }
  return { entries: merged, isEmpty: false };
}

export function renderListText(result: ListResult): string {
  if (result.isEmpty) return result.hint ?? '';
  const lines: string[] = [];
  for (const e of result.entries) {
    lines.push(`  ${e.id} — ${e.title}  [style: ${e.style}]  (${e.source})`);
  }
  return lines.join('\n');
}

export function renderListJson(result: ListResult): string {
  return JSON.stringify(
    result.entries.map((e) => ({ id: e.id, title: e.title, style: e.style, source: e.source })),
    null,
    2,
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. INSPECT
// ══════════════════════════════════════════════════════════════════════════════

export interface InspectOptions {
  readonly mermaid: boolean;
}

export interface InspectResult {
  readonly transitions: readonly OrchestratorPlanStep[];
  readonly expectedArtifacts: readonly string[];
  readonly rendering: string;
  readonly wrote: false;
}

export async function inspectScenario(
  rawJson: string,
  validator: SchemaValidator,
  orchestrator: Orchestrator | null,
  opts: InspectOptions,
): Promise<InspectResult | ValidateResult> {
  const v = await validateScenario(rawJson, validator, { strict: false });
  if (!v.ok) return v;
  const scenario = JSON.parse(rawJson) as Scenario;

  const transitions = orchestrator
    ? orchestrator.plan(scenario)
    : computeFallbackPlan(scenario);

  const expectedArtifacts = scenario.targets?.expectedArtifacts ?? [];

  const rendering = opts.mermaid
    ? renderPlanMermaid(transitions)
    : renderPlanText(transitions, expectedArtifacts);

  return { transitions, expectedArtifacts, rendering, wrote: false };
}

/**
 * Fallback plan enumeration when B1's orchestrator is unavailable.
 * Derives a proxy event sequence purely from seeds (no FSM instance).
 */
export function computeFallbackPlan(s: Scenario): OrchestratorPlanStep[] {
  const out: OrchestratorPlanStep[] = [];
  out.push({ fsm: 'ProjectLifecycle', from: 'Empty', to: 'Seeded', event: 'LoadScenario', guard: 'schema validates' });
  out.push({ fsm: 'ProjectLifecycle', from: 'Seeded', to: 'RequirementsDrafted', event: 'GenerateRequirements' });
  out.push({ fsm: 'ProjectLifecycle', from: 'RequirementsDrafted', to: 'FeaturesDerived', event: 'DeriveFeatures' });
  out.push({ fsm: 'ProjectLifecycle', from: 'FeaturesDerived', to: 'ScaffoldingReady', event: 'Scaffold' });
  out.push({ fsm: 'ProjectLifecycle', from: 'ScaffoldingReady', to: 'Implementing', event: 'Implement' });
  for (const f of s.seeds.features) {
    out.push({ fsm: 'PerFeature', from: 'Empty', to: 'HasSpec', event: 'SpecWritten', payload: { feature: f.id } });
    out.push({ fsm: 'PerFeature', from: 'HasSpec', to: 'HasScaffold', event: 'ScaffoldWritten', payload: { feature: f.id } });
    for (const ac of f.acs) {
      out.push({ fsm: 'PerAc', from: 'Declared', to: 'Scaffolded', event: 'ScaffoldEmitted', payload: { feature: f.id, ac: ac.name } });
      out.push({ fsm: 'PerAc', from: 'Scaffolded', to: 'ImplementedByAI', event: 'ImplementStub', payload: { feature: f.id, ac: ac.name } });
      out.push({ fsm: 'PerAc', from: 'ImplementedByAI', to: 'TestPassing', event: 'TestRunPass', payload: { feature: f.id, ac: ac.name } });
    }
  }
  out.push({ fsm: 'ProjectLifecycle', from: 'Implementing', to: 'Verifying', event: 'AllAcsDone' });
  out.push({ fsm: 'ProjectLifecycle', from: 'Verifying', to: 'Published', event: 'Verify', guard: 'compliance --strict' });
  return out;
}

function renderPlanText(
  transitions: readonly OrchestratorPlanStep[],
  expectedArtifacts: readonly string[],
): string {
  const lines: string[] = [];
  lines.push('FSM transitions:');
  for (const t of transitions) {
    const guard = t.guard ? ` [${t.guard}]` : '';
    const payload = t.payload ? ` ${JSON.stringify(t.payload)}` : '';
    lines.push(`  ${t.fsm}: ${t.from} → ${t.to} on ${t.event}${guard}${payload}`);
  }
  if (expectedArtifacts.length > 0) {
    lines.push('');
    lines.push('Expected artifacts:');
    for (const a of expectedArtifacts) lines.push(`  - ${a}`);
  }
  return lines.join('\n');
}

function renderPlanMermaid(transitions: readonly OrchestratorPlanStep[]): string {
  const lines: string[] = ['stateDiagram-v2'];
  for (const t of transitions) {
    lines.push(`  ${t.from} --> ${t.to}: ${t.event}`);
  }
  return lines.join('\n');
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. PLAY
// ══════════════════════════════════════════════════════════════════════════════

export interface PlayOptions {
  readonly ai: boolean;
  readonly seed: number;
  readonly dryRun: boolean;
  readonly cwd: string;
}

export interface PlayResult {
  readonly ok: boolean;
  readonly transitions: readonly OrchestratorPlanStep[];
  readonly artifacts: readonly string[];
  readonly complianceOk: boolean;
  readonly narrationIntro?: string;
  readonly narrationOutro?: string;
  readonly stepDelayMs?: number;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly exitCode: 0 | 1;
  readonly missingArtifacts: readonly string[];
}

/**
 * Run a scenario end-to-end via the injected orchestrator.
 *
 *   - Validates the JSON first; on failure, returns early (exit 1).
 *   - Checks the declared style is resolvable (built-in or module path).
 *   - Delegates to `orchestrator.run()`; prints narration intro/outro if present.
 *   - Asserts `targets.expectedArtifacts` exist post-run.
 *   - Respects `--dry-run` (calls `plan()` only; no writes).
 */
export async function playScenario(
  rawJson: string,
  validator: SchemaValidator,
  orchestrator: Orchestrator,
  fs: FileSystem,
  opts: PlayOptions,
  /**
   * Optional UI event sink. When provided, `playScenario` subscribes to the
   * orchestrator's raw event stream, pipes each event through the
   * orchestrator→UI bridge, and forwards the resulting UI events to this sink.
   * Subscription lifetime matches this call (tied to `run()`). Pass `undefined`
   * to run headlessly (tests, `--yes` in non-TTY).
   */
  onUiEvent?: (e: UiEvent) => void,
): Promise<PlayResult> {
  const v = await validateScenario(rawJson, validator, { strict: true });
  if (!v.ok) {
    return {
      ok: false,
      transitions: [],
      artifacts: [],
      complianceOk: false,
      errors: v.errors,
      warnings: v.warnings,
      exitCode: 1,
      missingArtifacts: [],
    };
  }

  const scenario = JSON.parse(rawJson) as Scenario;

  // ── Style resolution (reject unknown built-in names; allow module paths) ──
  const style = scenario.style;
  const isBuiltIn = BUILT_IN_STYLE_NAMES.includes(style);
  const looksLikeModulePath = style.startsWith('.') || style.startsWith('/') || style.includes('/');
  if (!isBuiltIn && !looksLikeModulePath) {
    return {
      ok: false,
      transitions: [],
      artifacts: [],
      complianceOk: false,
      errors: [`Unknown style '${style}'. Built-ins: ${BUILT_IN_STYLE_NAMES.join(', ')}.`],
      warnings: [],
      exitCode: 1,
      missingArtifacts: [],
    };
  }

  // ── Dry-run shortcut — no orchestrator.run(), only plan() ────────────
  if (opts.dryRun) {
    const transitions = orchestrator.plan(scenario);
    return {
      ok: true,
      transitions,
      artifacts: [],
      complianceOk: true,
      narrationIntro: scenario.narration?.intro,
      narrationOutro: scenario.narration?.outro,
      stepDelayMs: scenario.narration?.stepDelayMs,
      errors: [],
      warnings: [],
      exitCode: 0,
      missingArtifacts: [],
    };
  }

  // ── Live UI event forwarding ──────────────────────────────────────────
  // If the caller passed an `onUiEvent` sink, build a fresh bridge adapter
  // (stateful — tracks first-seen FSMs) and forward each raw orchestrator
  // event as 0..N UI events. Subscription scope is this call only; the
  // orchestrator impl unsubscribes when `run()` returns.
  const rawEventSink: ((e: OrchEvent) => void) | undefined = onUiEvent
    ? ((): ((e: OrchEvent) => void) => {
        const adapt = makeOrchestratorEventAdapter();
        return (e) => { for (const u of adapt(e)) onUiEvent(u); };
      })()
    : undefined;

  const res = await orchestrator.run(scenario, {
    ai: opts.ai,
    seed: opts.seed,
    dryRun: false,
    cwd: opts.cwd,
    ...(rawEventSink ? { onEvent: rawEventSink } : {}),
  });

  // ── Artifact assertion ────────────────────────────────────────────────
  const missing: string[] = [];
  for (const rel of scenario.targets?.expectedArtifacts ?? []) {
    const abs = path.resolve(opts.cwd, rel);
    const exists = await fs.exists(abs);
    if (!exists) missing.push(rel);
  }

  const errors: string[] = [];
  if (res.failure) errors.push(res.failure);
  if (!res.complianceOk) errors.push('compliance --strict failed');
  if (missing.length > 0) errors.push(`Missing expected artifacts: ${missing.join(', ')}`);

  const ok = errors.length === 0;
  return {
    ok,
    transitions: res.transitions,
    artifacts: res.artifacts,
    complianceOk: res.complianceOk,
    narrationIntro: res.narrationIntro ?? scenario.narration?.intro,
    narrationOutro: res.narrationOutro ?? scenario.narration?.outro,
    stepDelayMs: res.stepDelayMs ?? scenario.narration?.stepDelayMs,
    errors,
    warnings: [],
    exitCode: ok ? 0 : 1,
    missingArtifacts: missing,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. RECORD
// ══════════════════════════════════════════════════════════════════════════════

export interface RecordOptions {
  readonly name?: string;
  readonly fromProject?: string;
  readonly force?: boolean;
  readonly outPath: string;
}

export interface RecordInteractiveAnswers {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly style: string;
  readonly requirements: readonly RequirementSeed[];
  readonly features: readonly FeatureSeed[];
}

export interface RecordResult {
  readonly ok: boolean;
  readonly scenario: Scenario | null;
  readonly wrote: string | null;
  readonly errors: readonly string[];
  readonly exitCode: 0 | 1;
}

/**
 * Record mode (a): walk an existing project, extract seeds, emit Scenario.
 */
export async function recordFromProject(
  fs: FileSystem,
  opts: { readonly projectDir: string; readonly outPath: string; readonly force?: boolean; readonly id?: string },
): Promise<RecordResult> {
  // Refuse overwrite
  if (!opts.force && (await fs.exists(opts.outPath))) {
    return {
      ok: false,
      scenario: null,
      wrote: null,
      errors: [`Output file exists: ${opts.outPath}. Use --force to overwrite.`],
      exitCode: 1,
    };
  }

  const featuresDir = path.join(opts.projectDir, 'requirements', 'features');
  const requirementsDir = path.join(opts.projectDir, 'requirements', 'requirements');

  const requirements: RequirementSeed[] = [];
  const features: FeatureSeed[] = [];

  if (await fs.exists(requirementsDir)) {
    for (const n of await fs.readdir(requirementsDir)) {
      if (!n.endsWith('.spec.json')) continue;
      try {
        const raw = await fs.readFile(path.join(requirementsDir, n), 'utf8');
        const spec = JSON.parse(raw) as {
          id: string;
          title: string;
          kind?: string;
          statement?: unknown;
        };
        requirements.push({
          id: spec.id,
          title: spec.title,
          ...(spec.kind ? { kind: spec.kind } : {}),
          ...(spec.statement ? { statement: spec.statement as RequirementSeed['statement'] } : {}),
        });
      } catch { /* skip */ }
    }
  }

  if (await fs.exists(featuresDir)) {
    for (const n of await fs.readdir(featuresDir)) {
      if (!n.endsWith('.spec.json')) continue;
      try {
        const raw = await fs.readFile(path.join(featuresDir, n), 'utf8');
        const spec = JSON.parse(raw) as {
          id: string;
          title: string;
          priority?: string;
          satisfies?: readonly string[];
          acs: readonly { name: string; expects: readonly string[] }[];
        };
        features.push({
          id: spec.id,
          title: spec.title,
          ...(spec.priority ? { priority: spec.priority } : {}),
          ...(spec.satisfies ? { satisfies: spec.satisfies } : {}),
          acs: spec.acs.map((a) => ({ name: a.name, expects: a.expects })),
        });
      } catch { /* skip */ }
    }
  }

  const id = opts.id ?? path.basename(opts.projectDir).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const scenario: Scenario = {
    $schemaVersion: SCHEMA_VERSION,
    id,
    title: `Captured from ${path.basename(opts.projectDir)}`,
    description: `Scenario captured from project at ${opts.projectDir}. Replay with 'requirements scenario play --yes' for byte-identical artifacts.`,
    style: 'default',
    seeds: { requirements, features },
  };

  await fs.writeFile(opts.outPath, JSON.stringify(scenario, null, 2) + '\n');
  return { ok: true, scenario, wrote: opts.outPath, errors: [], exitCode: 0 };
}

/**
 * Record mode (b): log a wizard session (answers already collected by caller).
 * The caller drives `runFeatureWizard` / `runRequirementWizard`; this core
 * just materialises the final Scenario and writes it.
 */
export async function recordFromInteractive(
  fs: FileSystem,
  answers: RecordInteractiveAnswers,
  opts: { readonly outPath: string; readonly force?: boolean },
): Promise<RecordResult> {
  if (!opts.force && (await fs.exists(opts.outPath))) {
    return {
      ok: false,
      scenario: null,
      wrote: null,
      errors: [`Output file exists: ${opts.outPath}. Use --force to overwrite.`],
      exitCode: 1,
    };
  }
  const scenario: Scenario = {
    $schemaVersion: SCHEMA_VERSION,
    id: answers.id,
    title: answers.title,
    description: answers.description,
    style: answers.style,
    seeds: { requirements: answers.requirements, features: answers.features },
  };
  await fs.writeFile(opts.outPath, JSON.stringify(scenario, null, 2) + '\n');
  return { ok: true, scenario, wrote: opts.outPath, errors: [], exitCode: 0 };
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. EXPORT
// ══════════════════════════════════════════════════════════════════════════════

export type ExportFormat = 'md' | 'html' | 'pdf';

export interface ExportOptions {
  readonly format: ExportFormat;
  readonly outPath: string;
  readonly force?: boolean;
  readonly complianceReport?: string;
  readonly specJsonByPath?: Readonly<Record<string, string>>;
}

export interface ExportResult {
  readonly ok: boolean;
  readonly wrote: string | null;
  readonly content: string;
  readonly errors: readonly string[];
  readonly exitCode: 0 | 1;
  readonly isStub: boolean;
}

export async function exportScenario(
  rawJson: string,
  validator: SchemaValidator,
  orchestrator: Orchestrator | null,
  fs: FileSystem,
  opts: ExportOptions,
): Promise<ExportResult> {
  const v = await validateScenario(rawJson, validator, { strict: false });
  if (!v.ok) {
    return {
      ok: false,
      wrote: null,
      content: '',
      errors: v.errors,
      exitCode: 1,
      isStub: false,
    };
  }

  if (!opts.force && (await fs.exists(opts.outPath))) {
    return {
      ok: false,
      wrote: null,
      content: '',
      errors: [`Output file exists: ${opts.outPath}. Use --force to overwrite.`],
      exitCode: 1,
      isStub: false,
    };
  }

  const scenario = JSON.parse(rawJson) as Scenario;
  const transitions = orchestrator
    ? orchestrator.plan(scenario)
    : computeFallbackPlan(scenario);

  const mdContent = renderExportMarkdown(scenario, transitions, opts);

  const isStub = opts.format !== 'md';
  const finalContent = isStub
    ? `<!-- ${opts.format.toUpperCase()} export is stub-only — emits Markdown content for the renderer to wrap. -->\n` + mdContent
    : mdContent;

  await fs.writeFile(opts.outPath, finalContent);
  return {
    ok: true,
    wrote: opts.outPath,
    content: finalContent,
    errors: [],
    exitCode: 0,
    isStub,
  };
}

function renderExportMarkdown(
  s: Scenario,
  transitions: readonly OrchestratorPlanStep[],
  opts: ExportOptions,
): string {
  const lines: string[] = [];
  lines.push(`# Scenario: ${s.title}`);
  lines.push('');
  lines.push(`- **id**: \`${s.id}\``);
  lines.push(`- **style**: \`${s.style}\``);
  lines.push('');
  if (s.narration?.intro) {
    lines.push('## Narration — intro');
    lines.push('');
    lines.push('> ' + s.narration.intro);
    lines.push('');
  }
  lines.push('## Description');
  lines.push('');
  lines.push(s.description);
  lines.push('');
  lines.push('## FSM transitions');
  lines.push('');
  lines.push('```mermaid');
  lines.push('stateDiagram-v2');
  for (const t of transitions) lines.push(`  ${t.from} --> ${t.to}: ${t.event}`);
  lines.push('```');
  lines.push('');
  if (opts.specJsonByPath) {
    lines.push('## Generated artifacts');
    lines.push('');
    for (const [p, content] of Object.entries(opts.specJsonByPath)) {
      lines.push(`### \`${p}\``);
      lines.push('');
      lines.push('```json');
      lines.push(content);
      lines.push('```');
      lines.push('');
    }
  }
  if (opts.complianceReport) {
    lines.push('## Compliance report');
    lines.push('');
    lines.push('```');
    lines.push(opts.complianceReport);
    lines.push('```');
    lines.push('');
  }
  if (s.narration?.outro) {
    lines.push('## Narration — outro');
    lines.push('');
    lines.push('> ' + s.narration.outro);
    lines.push('');
  }
  return lines.join('\n');
}
