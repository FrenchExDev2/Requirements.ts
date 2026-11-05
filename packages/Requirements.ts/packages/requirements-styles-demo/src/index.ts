// @frenchexdev2/requirements-styles-demo — scenario player + 3-FSM orchestrator.
export * from './types.js';

// AI adapter
export {
  StubAiAdapter,
  selectAdapter,
  DEFAULT_CLAUDE_MODEL,
  ClaudeAiAdapter,
  type AiAdapter,
  type AcContext,
  type AcImplementationResult,
  type ClaudeAdapterDeps,
} from './ai-adapter.js';

// Event bridge (FsmId, UiEvent)
export {
  makeOrchestratorEventAdapter,
  type FsmId,
  type UiEvent,
  type OrchestratorEventAdapter,
} from './event-bridge.js';

// FSMs
export * from './per-ac-fsm.js';
export * from './per-feature-fsm.js';
export * from './project-lifecycle-fsm.js';

// Orchestrator (owns OrchestratorResult / Cancel / OrchestratorEvent)
export {
  ScenarioOrchestrator,
  type OrchestratorDeps,
  type OrchestratorEvent,
  type OrchestratorResult,
  type OrchestratorListener,
  type Cancel,
} from './orchestrator.js';

// Orchestrator port
export * from './orchestrator-port.js';

// Commands (validator / play / list / validate / inspect / export / record)
export * from './commands.js';

// UI (startScenarioUi, labelFor, UiDeps, ScenarioUi)
export {
  startScenarioUi,
  labelFor,
  type UiDeps,
  type ScenarioUi,
} from './ui.js';
