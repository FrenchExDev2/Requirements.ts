/**
 * orchestrator-port — adapter from the concrete `ScenarioOrchestrator` class
 * to the `Orchestrator` port consumed by `playScenario` / `inspectScenario` /
 * `exportScenario`.
 *
 * The two shapes diverge on purpose:
 *   - The class exposes `onEvent` + `run(): { finalState, published, events }`
 *     — a stateful, event-emitting object tied to a single scenario+deps pair.
 *   - The port exposes `plan()` + `run(s, opts): { transitions, artifacts,
 *     complianceOk, … }` — a stateless, call-scoped contract suitable for CLI
 *     shells and test stubs.
 *
 * This adapter reconciles them:
 *   - `plan(s)` delegates to `computeFallbackPlan` (cheap, pure; mirrors the
 *     fallback the bin used to inject).
 *   - `run(s, opts)` constructs a fresh class instance, wires the optional
 *     `opts.onEvent` listener, runs, normalises the result, and unsubscribes.
 *
 * Primary owner: ScenarioOrchestratorFeature.
 */

import { ScenarioOrchestrator, type OrchestratorDeps, type OrchestratorEvent as OrchEvent } from './orchestrator.js';
import type { Scenario } from './types.js';
import {
  computeFallbackPlan,
  type Orchestrator,
  type OrchestratorPlanStep,
  type OrchestratorRunOptions,
  type OrchestratorRunResult,
} from './commands.js';

/**
 * Build an `Orchestrator` port backed by the real `ScenarioOrchestrator`
 * class. Each `run()` call instantiates a fresh FSM ensemble — scenarios
 * do not share state.
 */
export function makeScenarioOrchestratorPort(
  baseDeps: Omit<OrchestratorDeps, 'ai'>,
): Orchestrator {
  return {
    plan(s: Scenario): readonly OrchestratorPlanStep[] {
      return computeFallbackPlan(s);
    },

    async run(
      s: Scenario,
      opts: OrchestratorRunOptions,
    ): Promise<OrchestratorRunResult> {
      const deps: OrchestratorDeps = { ...baseDeps, ai: opts.ai };
      const instance = new ScenarioOrchestrator(deps, s);
      const unsub = opts.onEvent ? instance.onEvent(opts.onEvent) : undefined;
      try {
        const result = await instance.run();
        const transitions = normaliseEventsToPlanSteps(result.events);
        const failure = failureReason(result.events, result.published, result.finalState);
        return {
          transitions,
          artifacts: [],
          complianceOk: result.published,
          complianceOutput: result.published ? 'PASS' : 'FAIL',
          narrationIntro: s.narration?.intro,
          narrationOutro: s.narration?.outro,
          stepDelayMs: s.narration?.stepDelayMs,
          ...(failure ? { failure } : {}),
        };
      } finally {
        unsub?.();
      }
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Event-log → plan-step normalisation
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Translate the orchestrator's raw event log into the port's plan-step shape.
 * `Narration` and `Error` events have no plan-step analogue and are dropped —
 * Narration surfaces in `narrationIntro`/`narrationOutro`, Error surfaces via
 * `complianceOk=false` + `failure`.
 */
export function normaliseEventsToPlanSteps(
  events: readonly OrchEvent[],
): readonly OrchestratorPlanStep[] {
  const out: OrchestratorPlanStep[] = [];
  for (const e of events) {
    switch (e.kind) {
      case 'ProjectLifecycle':
        out.push({ fsm: 'ProjectLifecycle', from: e.from, to: e.to, event: e.event });
        break;
      case 'PerFeature': {
        const payload: Record<string, unknown> = { feature: e.featureId };
        if (e.acName !== undefined) payload.ac = e.acName;
        out.push({ fsm: 'PerFeature', from: e.from, to: e.to, event: e.event, payload });
        break;
      }
      case 'PerAc':
        out.push({
          fsm: 'PerAc', from: e.from, to: e.to, event: e.event,
          payload: { feature: e.featureId, ac: e.acName },
        });
        break;
      case 'Narration':
      case 'Error':
        // Dropped — see docstring.
        break;
    }
  }
  return out;
}

function failureReason(
  events: readonly OrchEvent[],
  published: boolean,
  finalState: string,
): string | undefined {
  if (published) return undefined;
  const err = events.find((e): e is Extract<OrchEvent, { kind: 'Error' }> => e.kind === 'Error');
  if (err) return err.reason;
  return `Final state: ${finalState}`;
}
