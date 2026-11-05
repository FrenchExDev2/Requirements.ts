/**
 * Tests for PerAcFsm — FSM C. Verifies 3 ACs of ScenarioOrchestratorFeature.
 */

import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ScenarioOrchestratorFeature } from '../../../requirements/features/scenario/scenario-orchestrator';
import { PerAcFsm, type PerAcTransition } from '../../../src/per-ac-fsm';

@FeatureTest(ScenarioOrchestratorFeature)
class PerAcTests {
  @Verifies<ScenarioOrchestratorFeature>('perAcSpawnsOnePerAc')
  'PerAcFsm is scoped to one featureId + acName pair, initial state Declared'() {
    const ac = new PerAcFsm('FEAT-A', 'doesFoo');
    expect(ac.featureId).toBe('FEAT-A');
    expect(ac.acName).toBe('doesFoo');
    expect(ac.currentState()).toBe('Declared');
    expect(ac.attemptCount()).toBe(0);
    expect(ac.replay()).toEqual([]);
  }

  @Verifies<ScenarioOrchestratorFeature>('everyPerAcTransitionIsTested')
  'every declared transition exercised (AI branch, stub branch, retry self-loop, no-retry Fail, Review reject, Fail edges, invalid, listener unsubscribe)'() {
    // AI branch + Reviewed/Verified
    const ai = new PerAcFsm('F', 'ac1');
    const seen: PerAcTransition[] = [];
    const off = ai.onTransition((t) => seen.push(t));
    ai.dispatch({ kind: 'ScaffoldEmitted' });
    ai.dispatch({ kind: 'AiImplement', prompt: 'do it' });
    expect(ai.attemptCount()).toBe(1);
    ai.dispatch({ kind: 'TestRunPass' });
    ai.dispatch({ kind: 'Review', reviewer: 'me', approved: true });
    ai.dispatch({ kind: 'Verified' });
    expect(ai.currentState()).toBe('Verified');
    expect(seen.length).toBe(ai.replay().length);
    off();
    off(); // idempotent double-unsubscribe

    // Stub branch + retry self-loop + eventual pass
    const stub = new PerAcFsm('F', 'ac2');
    stub.dispatch({ kind: 'ScaffoldEmitted' });
    stub.dispatch({ kind: 'ImplementStub' });
    expect(stub.attemptCount()).toBe(1);
    stub.dispatch({ kind: 'TestRunFail', retry: true });
    expect(stub.currentState()).toBe('ImplementedByAI');
    expect(stub.attemptCount()).toBe(2);
    stub.dispatch({ kind: 'TestRunPass' });
    expect(stub.currentState()).toBe('TestPassing');

    // Review rejected → Failed
    const rej = new PerAcFsm('F', 'ac3');
    rej.dispatch({ kind: 'ScaffoldEmitted' });
    rej.dispatch({ kind: 'ImplementStub' });
    rej.dispatch({ kind: 'TestRunPass' });
    rej.dispatch({ kind: 'Review', reviewer: 'r', approved: false });
    expect(rej.currentState()).toBe('Failed');

    // No-retry Fail
    const noRetry = new PerAcFsm('F', 'ac4');
    noRetry.dispatch({ kind: 'ScaffoldEmitted' });
    noRetry.dispatch({ kind: 'ImplementStub' });
    noRetry.dispatch({ kind: 'TestRunFail', retry: false });
    expect(noRetry.currentState()).toBe('Failed');

    // Fail edges from every non-terminal state
    const froms: ReadonlyArray<readonly [readonly Parameters<PerAcFsm['dispatch']>[0][], string]> = [
      [[], 'Declared'],
      [[{ kind: 'ScaffoldEmitted' }], 'Scaffolded'],
      [[{ kind: 'ScaffoldEmitted' }, { kind: 'ImplementStub' }], 'ImplementedByAI'],
      [[{ kind: 'ScaffoldEmitted' }, { kind: 'ImplementStub' }, { kind: 'TestRunPass' }], 'TestPassing'],
      [[{ kind: 'ScaffoldEmitted' }, { kind: 'ImplementStub' }, { kind: 'TestRunPass' }, { kind: 'Review', reviewer: 'r', approved: true }], 'Reviewed'],
    ];
    for (const [prefix, label] of froms) {
      const f = new PerAcFsm('F', 'x');
      for (const e of prefix) f.dispatch(e);
      f.dispatch({ kind: 'Fail', reason: `fail-from-${label}` });
      expect(f.currentState()).toBe('Failed');
    }

    // Fail from Verified / Failed is invalid.
    const v = new PerAcFsm('F', 'v');
    v.dispatch({ kind: 'ScaffoldEmitted' });
    v.dispatch({ kind: 'ImplementStub' });
    v.dispatch({ kind: 'TestRunPass' });
    v.dispatch({ kind: 'Review', reviewer: 'r', approved: true });
    v.dispatch({ kind: 'Verified' });
    expect(() => v.dispatch({ kind: 'Fail', reason: 'late' })).toThrow(/invalid transition/);

    // Generic invalid transition.
    const bad = new PerAcFsm('F', 'b');
    expect(() => bad.dispatch({ kind: 'TestRunPass' })).toThrow(/invalid transition/);
  }

  @Verifies<ScenarioOrchestratorFeature>('perAcFiresAcImplementedOnTestPassing')
  'entering TestPassing is observable via onTransition — the orchestrator uses this signal to fire AcImplemented on the parent PerFeatureFsm'() {
    const ac = new PerAcFsm('F', 'doesFoo');
    let passed = false;
    const off = ac.onTransition((t) => {
      if (t.to === 'TestPassing') passed = true;
    });
    ac.dispatch({ kind: 'ScaffoldEmitted' });
    ac.dispatch({ kind: 'ImplementStub' });
    ac.dispatch({ kind: 'TestRunPass' });
    expect(passed).toBe(true);
    off();
  }
}

void PerAcTests;
