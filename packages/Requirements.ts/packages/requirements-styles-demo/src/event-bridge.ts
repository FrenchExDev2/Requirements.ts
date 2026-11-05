/**
 * event-bridge — translates ScenarioOrchestrator events into the UI's
 * lifecycle-shaped event stream (FsmStarted / FsmTransition / FsmFinished /
 * Narration). Pure transducer — no I/O, no clack — but stateful:
 * `FsmStarted` requires remembering which FSM keys have already been seen.
 *
 * The orchestrator only emits raw transitions (`{ from, to, event }`); the
 * UI needs lifecycle markers (start / transition / finish). The bridge
 * synthesises the markers from the transition stream:
 *
 *   - First time we see an FSM key → emit FsmStarted({ initialState: from })
 *     immediately followed by FsmTransition({ from → to }).
 *   - Subsequent transitions → just FsmTransition.
 *   - When `to` is a recognised terminal state → also emit FsmFinished
 *     with `ok` derived from the state name (Failed → false, others → true).
 *   - Narration → passthrough (`message` → `text`).
 *   - Error → FsmFinished on the project lifecycle with `ok: false`,
 *     synthesising a FsmStarted first if the project FSM was never seen.
 *
 * Primary owner: ScenarioOrchestratorFeature.
 * Consumed by:   ScenarioPlayCommandFeature (the play command wires the
 *                bridge between orchestrator.onEvent and ui.connectTo).
 */

import type { OrchestratorEvent as OrchEvent } from './orchestrator.js';

// ══════════════════════════════════════════════════════════════════════════════
// UI event types — the canonical shape the terminal UI consumes.
// ══════════════════════════════════════════════════════════════════════════════

export type FsmId =
  | { readonly kind: 'project' }
  | { readonly kind: 'feature'; readonly featureId: string }
  | { readonly kind: 'ac'; readonly featureId: string; readonly acName: string };

export type UiEvent =
  | {
      readonly kind: 'FsmStarted';
      readonly fsm: FsmId;
      readonly initialState: string;
    }
  | {
      readonly kind: 'FsmTransition';
      readonly fsm: FsmId;
      readonly from: string;
      readonly to: string;
      readonly progress?: { readonly done: number; readonly total: number };
    }
  | {
      readonly kind: 'FsmFinished';
      readonly fsm: FsmId;
      readonly finalState: string;
      readonly ok: boolean;
    }
  | {
      readonly kind: 'Narration';
      readonly text: string;
    };

// ══════════════════════════════════════════════════════════════════════════════
// Terminal-state classification
// ══════════════════════════════════════════════════════════════════════════════

const TERMINAL_OK_STATES: ReadonlySet<string> = new Set([
  'Published',     // ProjectLifecycle
  'Verified',      // PerFeature, PerAc
  'TestPassing',   // PerAc — the orchestrator stops here in stub mode
]);

const TERMINAL_FAIL_STATES: ReadonlySet<string> = new Set([
  'Failed',
]);

function isTerminalState(state: string): boolean {
  return TERMINAL_OK_STATES.has(state) || TERMINAL_FAIL_STATES.has(state);
}

function isFailureState(state: string): boolean {
  return TERMINAL_FAIL_STATES.has(state);
}

// ══════════════════════════════════════════════════════════════════════════════
// FSM identification
// ══════════════════════════════════════════════════════════════════════════════

function fsmIdFor(e: Exclude<OrchEvent, { kind: 'Narration' | 'Error' }>): FsmId {
  switch (e.kind) {
    case 'ProjectLifecycle': return { kind: 'project' };
    case 'PerFeature':       return { kind: 'feature', featureId: e.featureId };
    case 'PerAc':            return { kind: 'ac', featureId: e.featureId, acName: e.acName };
  }
}

function fsmKey(id: FsmId): string {
  switch (id.kind) {
    case 'project': return 'project';
    case 'feature': return `feature:${id.featureId}`;
    case 'ac':      return `ac:${id.featureId}.${id.acName}`;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════

export interface OrchestratorEventAdapter {
  /** Translate one orchestrator event into 0..N UI events. */
  (e: OrchEvent): readonly UiEvent[];
}

/**
 * Build a fresh, stateful adapter. Each scenario play call should construct
 * its own — the seen-FSM set must not leak across runs.
 */
export function makeOrchestratorEventAdapter(): OrchestratorEventAdapter {
  const seen = new Set<string>();

  return (e: OrchEvent): readonly UiEvent[] => {
    if (e.kind === 'Narration') {
      return [{ kind: 'Narration', text: e.message }];
    }

    if (e.kind === 'Error') {
      const project: FsmId = { kind: 'project' };
      const out: UiEvent[] = [];
      if (!seen.has(fsmKey(project))) {
        seen.add(fsmKey(project));
        out.push({ kind: 'FsmStarted', fsm: project, initialState: 'Empty' });
      }
      out.push({
        kind: 'FsmFinished',
        fsm: project,
        finalState: 'Failed',
        ok: false,
      });
      return out;
    }

    // Transition events: ProjectLifecycle | PerFeature | PerAc
    const id = fsmIdFor(e);

    const out: UiEvent[] = [];
    const key = fsmKey(id);
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ kind: 'FsmStarted', fsm: id, initialState: e.from });
    }
    out.push({ kind: 'FsmTransition', fsm: id, from: e.from, to: e.to });
    if (isTerminalState(e.to)) {
      out.push({
        kind: 'FsmFinished',
        fsm: id,
        finalState: e.to,
        ok: !isFailureState(e.to),
      });
    }
    return out;
  };
}
