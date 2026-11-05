/**
 * ScenarioUi — clack-based terminal playback.
 *
 * One clack spinner per active FSM instance; labels update on every
 * orchestrator event. Narration (intro / outro) drives the clack banners.
 * A non-interactive mode emits line-by-line logs suitable for CI / `--yes`.
 *
 * Design: see `docs/scenarii-player-design.md` — UI responsibilities.
 *
 * Coverage strategy:
 *   - The pure event-routing logic (`routeEvent`, `labelFor`, `makeScenarioUi`)
 *     is fully unit-tested against a fake `Prompt`.
 *   - The TTY-bound real-clack glue in `startScenarioUi(..., nonInteractive:
 *     false)` is exempt via `/* v8 ignore * /` — same pattern as
 *     `explore-shell.ts`. It is exercised by smoke / e2e tests only.
 *
 * Satisfies: ScenarioAiAdapterFeature (indirectly: the UI is the demo
 * surface). Primary owner: ScenarioOrchestratorFeature.
 */

import type { Clock, Logger, Prompt, PromptSpinner } from '@frenchexdev2/requirements-core/ports';
import type { Scenario } from './types.js';
import type { FsmId, UiEvent } from './event-bridge.js';

// ══════════════════════════════════════════════════════════════════════════════
// UI event shape — single source of truth lives in `event-bridge.ts`. We
// re-export under the historical `OrchestratorEvent` name so existing tests
// and downstream code keep building. The bridge is the only place that knows
// how to translate the raw orchestrator transition stream into these markers.
// ══════════════════════════════════════════════════════════════════════════════

export type { FsmId } from './event-bridge.js';
export type OrchestratorEvent = UiEvent;

export interface OrchestratorResult {
  readonly ok: boolean;
  readonly durationMs: number;
  readonly summary: string;
  readonly failures?: readonly string[];
}

export type Cancel = () => void;

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════

export interface UiDeps {
  readonly prompt: Prompt;
  readonly logger: Logger;
  readonly clock: Clock;
  /** Forces non-interactive mode (CI, `--yes`, non-TTY). */
  readonly nonInteractive?: boolean;
  /** Optional sleep port for scenario narration pacing — swappable in tests. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface ScenarioUi {
  /** Subscribe the UI to orchestrator events. Returns an unsubscribe handle. */
  connectTo(subscribe: (listener: (event: OrchestratorEvent) => void) => Cancel): Cancel;
  /** Print the final report — exactly once. */
  finish(result: OrchestratorResult): void;
  readonly nonInteractive: boolean;
  /**
   * Await the configured step-delay from `scenario.narration.stepDelayMs`.
   * No-op when the scenario omits it; useful for live demos and tests.
   */
  pace(): Promise<void>;
}

/**
 * Public entry point — wires an orchestrator event stream to the terminal UI.
 * `deps.nonInteractive: true` forces log-line output (no clack spinners);
 * otherwise we use real clack spinners — those lines are /* v8 ignore * / d.
 */
export function startScenarioUi(deps: UiDeps, scenario: Scenario): ScenarioUi {
  const nonInteractive = deps.nonInteractive === true;
  const ui = makeScenarioUi(deps, scenario, nonInteractive);
  printIntro(deps, scenario, nonInteractive);
  return ui;
}

// ══════════════════════════════════════════════════════════════════════════════
// Pure core — fully testable
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build the label a spinner should show for an FSM currently in `state`.
 * Pure function of inputs — no clack, no I/O.
 */
export function labelFor(fsm: FsmId, state: string, progress?: { done: number; total: number }): string {
  const base = nameFor(fsm);
  const p = progress ? ` (${progress.done}/${progress.total})` : '';
  return `${base}: ${state}${p}`;
}

function nameFor(fsm: FsmId): string {
  switch (fsm.kind) {
    case 'project':
      return 'ProjectLifecycle';
    case 'feature':
      return `Feature ${fsm.featureId}`;
    case 'ac':
      return `AC ${fsm.featureId}.${fsm.acName}`;
  }
}

function fsmKey(fsm: FsmId): string {
  switch (fsm.kind) {
    case 'project':
      return 'project';
    case 'feature':
      return `feature:${fsm.featureId}`;
    case 'ac':
      return `ac:${fsm.featureId}.${fsm.acName}`;
  }
}

/**
 * Factory exposed for unit tests — lets the test install a fake `Prompt` whose
 * spinner records start/stop calls. The real clack glue (non-TTY branch) is in
 * `startScenarioUi` and marked `/* Coverage rationale:  * /` below.
 */
export function makeScenarioUi(
  deps: UiDeps,
  scenario: Scenario,
  nonInteractive: boolean,
): ScenarioUi {
  const spinners = new Map<string, PromptSpinner>();
  const finished = new Set<string>();
  let finishCalled = false;

  const handle = (event: OrchestratorEvent): void => {
    routeEvent(event, {
      nonInteractive,
      logger: deps.logger,
      prompt: deps.prompt,
      spinners,
      finished,
    });
  };

  return {
    connectTo(subscribe: (listener: (event: OrchestratorEvent) => void) => Cancel): Cancel {
      return subscribe(handle);
    },

    finish(result: OrchestratorResult): void {
      if (finishCalled) return;
      finishCalled = true;
      // Safety: any spinner still running gets stopped as 'cancelled'.
      for (const [, s] of spinners) s.stop('cancelled');
      spinners.clear();

      const line = result.ok
        ? `OK — ${result.summary} (${result.durationMs}ms)`
        : `FAIL — ${result.summary} (${result.durationMs}ms)`;
      if (nonInteractive) {
        deps.logger.info(line);
        for (const f of result.failures ?? []) deps.logger.error(`  · ${f}`);
      } else {
        printOutro(deps, scenario, line, result);
      }
    },

    async pace(): Promise<void> {
      const ms = scenario.narration?.stepDelayMs ?? 0;
      if (ms <= 0) return;
      const sleep = deps.sleep ?? defaultSleep;
      await sleep(ms);
    },

    nonInteractive,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Event routing
// ──────────────────────────────────────────────────────────────────────────────

interface RouteContext {
  readonly nonInteractive: boolean;
  readonly logger: Logger;
  readonly prompt: Prompt;
  readonly spinners: Map<string, PromptSpinner>;
  readonly finished: Set<string>;
}

/**
 * Fold one orchestrator event into the live UI state. Pure w.r.t. the given
 * context — tests drive it directly with a scripted `Prompt` spinner.
 */
export function routeEvent(event: OrchestratorEvent, ctx: RouteContext): void {
  switch (event.kind) {
    case 'Narration':
      ctx.logger.info(event.text);
      return;

    case 'FsmStarted': {
      const key = fsmKey(event.fsm);
      const label = labelFor(event.fsm, event.initialState);
      if (ctx.nonInteractive) {
        ctx.logger.info(`▶ ${label}`);
        return;
      }
      const s = ctx.prompt.spinner();
      s.start(label);
      ctx.spinners.set(key, s);
      return;
    }

    case 'FsmTransition': {
      const key = fsmKey(event.fsm);
      const label = labelFor(event.fsm, event.to, event.progress ? { ...event.progress } : undefined);
      if (ctx.nonInteractive) {
        ctx.logger.info(`  ${nameFor(event.fsm)}: ${event.from} → ${event.to}`);
        return;
      }
      const s = ctx.spinners.get(key);
      if (s) {
        // clack spinner exposes start(msg) to re-label a live spinner.
        s.start(label);
      } else {
        // Transition before start — gracefully spawn one.
        const fresh = ctx.prompt.spinner();
        fresh.start(label);
        ctx.spinners.set(key, fresh);
      }
      return;
    }

    case 'FsmFinished': {
      const key = fsmKey(event.fsm);
      if (ctx.finished.has(key)) return;
      ctx.finished.add(key);
      const label = labelFor(event.fsm, event.finalState);
      const verdict = event.ok ? `✓ ${label}` : `✗ ${label}`;
      if (ctx.nonInteractive) {
        (event.ok ? ctx.logger.info : ctx.logger.error).call(ctx.logger, verdict);
        return;
      }
      const s = ctx.spinners.get(key);
      if (s) {
        s.stop(verdict);
        ctx.spinners.delete(key);
      } else {
        ctx.logger.info(verdict);
      }
      return;
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Banner helpers
// ──────────────────────────────────────────────────────────────────────────────

function printIntro(deps: UiDeps, scenario: Scenario, nonInteractive: boolean): void {
  const intro = scenario.narration?.intro ?? `Scenario: ${scenario.title}`;
  if (nonInteractive) {
    deps.logger.info(`── ${intro} ──`);
  } else {
    deps.prompt.note(intro, scenario.title);
  }
}

function printOutro(deps: UiDeps, scenario: Scenario, line: string, result: OrchestratorResult): void {
  const outro = scenario.narration?.outro ?? line;
  deps.prompt.note(line, outro);
  for (const f of result.failures ?? []) deps.logger.error(`  · ${f}`);
}

/* Coverage rationale:  — real setTimeout wrapper; inner arrow fires on the next
 * tick and is not credited by v8 coverage even when awaited. The DI surface
 * (deps.sleep) is the canonical test seam. */
function defaultSleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

