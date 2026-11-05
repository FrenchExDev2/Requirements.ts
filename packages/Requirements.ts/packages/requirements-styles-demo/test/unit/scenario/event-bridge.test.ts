/**
 * event-bridge — unit tests for the orchestrator → UI event transducer.
 *
 * The bridge is a stateful pure function (closes over a seen-FSM Set). It is
 * the load-bearing seam that lets `scenario play` connect orchestrator
 * `onEvent` to `ui.connectTo` without either side knowing the other's vocabulary.
 *
 * Bound to:
 *   - ScenarioOrchestratorFeature.orchestratorCrossCouplingIsEventsOnly
 *     (the bridge IS the cross-FSM coupling boundary toward the UI)
 *   - ScenarioPlayCommandFeature.scenarioPlayDispatchesToOrchestrator
 *     (the bridge enables the play command to dispatch live UI updates)
 */

import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ScenarioOrchestratorFeature } from '../../../requirements/features/scenario/scenario-orchestrator';
import { ScenarioPlayCommandFeature } from '../../../requirements/features/scenario/scenario-play-command';
import {
  makeOrchestratorEventAdapter,
  type UiEvent,
} from '../../../src/event-bridge';
import type { OrchestratorEvent as OrchEvent } from '../../../src/orchestrator';

@FeatureTest(ScenarioOrchestratorFeature)
class EventBridgeOrchestratorTests {
  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  'first transition for an FSM emits FsmStarted then FsmTransition'() {
    const adapt = makeOrchestratorEventAdapter();
    const out = adapt({
      kind: 'ProjectLifecycle', from: 'Empty', to: 'Seeded', event: 'LoadScenario',
    });
    expect(out).toEqual<readonly UiEvent[]>([
      { kind: 'FsmStarted', fsm: { kind: 'project' }, initialState: 'Empty' },
      { kind: 'FsmTransition', fsm: { kind: 'project' }, from: 'Empty', to: 'Seeded' },
    ]);
  }

  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  'subsequent transitions for the same FSM emit only FsmTransition'() {
    const adapt = makeOrchestratorEventAdapter();
    adapt({ kind: 'ProjectLifecycle', from: 'Empty', to: 'Seeded', event: 'LoadScenario' });
    const out = adapt({
      kind: 'ProjectLifecycle', from: 'Seeded', to: 'RequirementsDrafted', event: 'GenerateRequirements',
    });
    expect(out).toEqual<readonly UiEvent[]>([
      { kind: 'FsmTransition', fsm: { kind: 'project' }, from: 'Seeded', to: 'RequirementsDrafted' },
    ]);
  }

  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  'each FSM kind gets its own FsmId, independently tracked'() {
    const adapt = makeOrchestratorEventAdapter();
    const projectOut = adapt({ kind: 'ProjectLifecycle', from: 'Empty', to: 'Seeded', event: 'LoadScenario' });
    const featureOut = adapt({ kind: 'PerFeature', featureId: 'CART', from: 'Empty', to: 'HasSpec', event: 'SpecWritten' });
    const acOut = adapt({ kind: 'PerAc', featureId: 'CART', acName: 'addItem', from: 'Declared', to: 'Scaffolded', event: 'ScaffoldEmitted' });

    // Each FSM's first event yields its own FsmStarted with the right FsmId shape.
    expect(projectOut[0]).toEqual({ kind: 'FsmStarted', fsm: { kind: 'project' }, initialState: 'Empty' });
    expect(featureOut[0]).toEqual({ kind: 'FsmStarted', fsm: { kind: 'feature', featureId: 'CART' }, initialState: 'Empty' });
    expect(acOut[0]).toEqual({
      kind: 'FsmStarted', fsm: { kind: 'ac', featureId: 'CART', acName: 'addItem' }, initialState: 'Declared',
    });
  }

  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  'two AC FSMs under the same feature are tracked independently by acName'() {
    const adapt = makeOrchestratorEventAdapter();
    const a = adapt({ kind: 'PerAc', featureId: 'CART', acName: 'addItem',    from: 'Declared', to: 'Scaffolded', event: 'ScaffoldEmitted' });
    const b = adapt({ kind: 'PerAc', featureId: 'CART', acName: 'removeItem', from: 'Declared', to: 'Scaffolded', event: 'ScaffoldEmitted' });
    // Both yield FsmStarted (different keys), then their own FsmTransition.
    expect(a[0]?.kind).toBe('FsmStarted');
    expect(b[0]?.kind).toBe('FsmStarted');
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
  }

  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  'terminal OK states emit FsmFinished with ok=true alongside FsmTransition'() {
    const adapt = makeOrchestratorEventAdapter();
    adapt({ kind: 'ProjectLifecycle', from: 'Empty',     to: 'Seeded',              event: 'LoadScenario' });
    adapt({ kind: 'ProjectLifecycle', from: 'Seeded',    to: 'RequirementsDrafted', event: 'GenerateRequirements' });
    adapt({ kind: 'ProjectLifecycle', from: 'RequirementsDrafted', to: 'FeaturesDerived', event: 'DeriveFeatures' });
    adapt({ kind: 'ProjectLifecycle', from: 'FeaturesDerived', to: 'ScaffoldingReady', event: 'Scaffold' });
    adapt({ kind: 'ProjectLifecycle', from: 'ScaffoldingReady', to: 'Implementing', event: 'Implement' });
    adapt({ kind: 'ProjectLifecycle', from: 'Implementing', to: 'Verifying', event: 'AllAcsDone' });
    const out = adapt({ kind: 'ProjectLifecycle', from: 'Verifying', to: 'Published', event: 'Verify' });
    expect(out).toEqual<readonly UiEvent[]>([
      { kind: 'FsmTransition', fsm: { kind: 'project' }, from: 'Verifying', to: 'Published' },
      { kind: 'FsmFinished', fsm: { kind: 'project' }, finalState: 'Published', ok: true },
    ]);
  }

  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  'terminal Failed state emits FsmFinished with ok=false'() {
    const adapt = makeOrchestratorEventAdapter();
    const out = adapt({
      kind: 'PerFeature', featureId: 'CART', from: 'HasSpec', to: 'Failed', event: 'Fail',
    });
    expect(out).toEqual<readonly UiEvent[]>([
      { kind: 'FsmStarted', fsm: { kind: 'feature', featureId: 'CART' }, initialState: 'HasSpec' },
      { kind: 'FsmTransition', fsm: { kind: 'feature', featureId: 'CART' }, from: 'HasSpec', to: 'Failed' },
      { kind: 'FsmFinished', fsm: { kind: 'feature', featureId: 'CART' }, finalState: 'Failed', ok: false },
    ]);
  }

  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  'PerAc TestPassing is treated as a terminal OK state'() {
    const adapt = makeOrchestratorEventAdapter();
    const out = adapt({
      kind: 'PerAc', featureId: 'CART', acName: 'addItem',
      from: 'ImplementedByAI', to: 'TestPassing', event: 'TestRunPass',
    });
    expect(out.some(e => e.kind === 'FsmFinished' && e.ok === true)).toBe(true);
  }

  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  'Narration events pass through with text payload'() {
    const adapt = makeOrchestratorEventAdapter();
    const out = adapt({ kind: 'Narration', message: 'Step 3 of 6 — scaffolding…' });
    expect(out).toEqual<readonly UiEvent[]>([
      { kind: 'Narration', text: 'Step 3 of 6 — scaffolding…' },
    ]);
  }

  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  'Error event finishes the project FSM with ok=false, synthesising FsmStarted if needed'() {
    const adapt = makeOrchestratorEventAdapter();
    const out = adapt({ kind: 'Error', reason: 'wizard threw' });
    expect(out).toEqual<readonly UiEvent[]>([
      { kind: 'FsmStarted', fsm: { kind: 'project' }, initialState: 'Empty' },
      { kind: 'FsmFinished', fsm: { kind: 'project' }, finalState: 'Failed', ok: false },
    ]);
  }

  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  'Error event after project FSM was already started skips the synthetic FsmStarted'() {
    const adapt = makeOrchestratorEventAdapter();
    adapt({ kind: 'ProjectLifecycle', from: 'Empty', to: 'Seeded', event: 'LoadScenario' });
    const out = adapt({ kind: 'Error', reason: 'compliance failed' });
    expect(out).toEqual<readonly UiEvent[]>([
      { kind: 'FsmFinished', fsm: { kind: 'project' }, finalState: 'Failed', ok: false },
    ]);
  }

  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  'each adapter call gets a fresh seen-set — runs do not bleed across invocations'() {
    const adapt1 = makeOrchestratorEventAdapter();
    const adapt2 = makeOrchestratorEventAdapter();
    adapt1({ kind: 'ProjectLifecycle', from: 'Empty', to: 'Seeded', event: 'LoadScenario' });
    const out2 = adapt2({ kind: 'ProjectLifecycle', from: 'Empty', to: 'Seeded', event: 'LoadScenario' });
    // Second adapter sees the project FSM for the first time despite the first
    // adapter having already processed it.
    expect(out2[0]?.kind).toBe('FsmStarted');
  }
}

void EventBridgeOrchestratorTests;

@FeatureTest(ScenarioPlayCommandFeature)
class EventBridgePlayCommandTests {
  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayDispatchesToOrchestrator')
  'a full mini-pipeline of orchestrator events translates into a coherent UI stream'() {
    const adapt = makeOrchestratorEventAdapter();
    const orchStream: readonly OrchEvent[] = [
      { kind: 'Narration', message: 'Starting…' },
      { kind: 'ProjectLifecycle', from: 'Empty', to: 'Seeded', event: 'LoadScenario' },
      { kind: 'PerFeature', featureId: 'CART', from: 'Empty', to: 'HasSpec', event: 'SpecWritten' },
      { kind: 'PerAc', featureId: 'CART', acName: 'addItem', from: 'Declared', to: 'Scaffolded', event: 'ScaffoldEmitted' },
      { kind: 'PerAc', featureId: 'CART', acName: 'addItem', from: 'Scaffolded', to: 'ImplementedByAI', event: 'ImplementStub' },
      { kind: 'PerAc', featureId: 'CART', acName: 'addItem', from: 'ImplementedByAI', to: 'TestPassing', event: 'TestRunPass' },
    ];
    const ui: UiEvent[] = orchStream.flatMap(adapt);

    // Expect: 1 Narration + 3 FsmStarted (project, feature, ac) + 5 FsmTransition + 1 FsmFinished (TestPassing).
    // Terminal transitions emit both FsmTransition and FsmFinished; the last AC step counts as a transition too.
    expect(ui.filter(e => e.kind === 'Narration')).toHaveLength(1);
    expect(ui.filter(e => e.kind === 'FsmStarted')).toHaveLength(3);
    expect(ui.filter(e => e.kind === 'FsmTransition')).toHaveLength(5);
    expect(ui.filter(e => e.kind === 'FsmFinished')).toHaveLength(1);
    const finished = ui.find(e => e.kind === 'FsmFinished');
    expect(finished).toEqual({
      kind: 'FsmFinished',
      fsm: { kind: 'ac', featureId: 'CART', acName: 'addItem' },
      finalState: 'TestPassing',
      ok: true,
    });
  }
}

void EventBridgePlayCommandTests;