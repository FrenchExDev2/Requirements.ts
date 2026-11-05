/**
 * Tests for PerFeatureFsm — FSM B. Verifies 3 ACs of ScenarioOrchestratorFeature.
 */

import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ScenarioOrchestratorFeature } from '../../../requirements/features/scenario/scenario-orchestrator';
import { PerFeatureFsm, type PerFeatureTransition } from '../../../src/per-feature-fsm';

@FeatureTest(ScenarioOrchestratorFeature)
class PerFeatureTests {
  @Verifies<ScenarioOrchestratorFeature>('perFeatureSpawnsOnePerFeatureSeed')
  'PerFeatureFsm is scoped to a single featureId / totalAcs pair'() {
    const a = new PerFeatureFsm('FEAT-A', 2);
    const b = new PerFeatureFsm('FEAT-B', 3);
    expect(a.featureId).toBe('FEAT-A');
    expect(a.totalAcs).toBe(2);
    expect(b.featureId).toBe('FEAT-B');
    expect(a.currentState()).toBe('Empty');
    expect(a.implementedCount()).toBe(0);
  }

  @Verifies<ScenarioOrchestratorFeature>('everyPerFeatureTransitionIsTested')
  'every declared transition is exercised (happy path + Fail edges + listeners + invalid + unsubscribe + Fail-from-terminal is rejected)'() {
    // Happy path
    const fsm = new PerFeatureFsm('FEAT', 2);
    const seen: PerFeatureTransition[] = [];
    const off = fsm.onTransition((t) => seen.push(t));

    fsm.dispatch({ kind: 'SpecWritten' });
    expect(fsm.currentState()).toBe('HasSpec');

    fsm.dispatch({ kind: 'ScaffoldWritten' });
    expect(fsm.currentState()).toBe('HasScaffold');

    // First AcImplemented keeps us in HasScaffold (count 1 / 2); records self-transition.
    fsm.dispatch({ kind: 'AcImplemented', acName: 'ac1' });
    expect(fsm.currentState()).toBe('HasScaffold');
    expect(fsm.implementedCount()).toBe(1);

    // Second AcImplemented moves us forward.
    fsm.dispatch({ kind: 'AcImplemented', acName: 'ac2' });
    expect(fsm.currentState()).toBe('AllAcsImplemented');
    expect(fsm.implementedCount()).toBe(2);

    fsm.dispatch({ kind: 'TestsPass' });
    expect(fsm.currentState()).toBe('AllTestsPassing');

    fsm.dispatch({ kind: 'Verified' });
    expect(fsm.currentState()).toBe('Verified');

    expect(fsm.replay().length).toBe(seen.length);

    off();
    off(); // idempotent double-unsubscribe

    // Fail from every non-terminal state is legal; Fail from Verified/Failed is illegal.
    const states: ReadonlyArray<readonly [readonly Parameters<PerFeatureFsm['dispatch']>[0][], string]> = [
      [[], 'Empty'],
      [[{ kind: 'SpecWritten' }], 'HasSpec'],
      [[{ kind: 'SpecWritten' }, { kind: 'ScaffoldWritten' }], 'HasScaffold'],
      [[{ kind: 'SpecWritten' }, { kind: 'ScaffoldWritten' }, { kind: 'AcImplemented', acName: 'x' }, { kind: 'AcImplemented', acName: 'y' }], 'AllAcsImplemented'],
      [[{ kind: 'SpecWritten' }, { kind: 'ScaffoldWritten' }, { kind: 'AcImplemented', acName: 'x' }, { kind: 'AcImplemented', acName: 'y' }, { kind: 'TestsPass' }], 'AllTestsPassing'],
    ];
    for (const [prefix, label] of states) {
      const f = new PerFeatureFsm('F', 2);
      for (const e of prefix) f.dispatch(e);
      f.dispatch({ kind: 'Fail', reason: `fail-from-${label}` });
      expect(f.currentState()).toBe('Failed');
    }

    // Invalid transitions throw.
    const bad = new PerFeatureFsm('F', 1);
    expect(() => bad.dispatch({ kind: 'ScaffoldWritten' })).toThrow(/invalid transition/);

    // Fail from Verified is an invalid transition.
    const verified = new PerFeatureFsm('F', 1);
    verified.dispatch({ kind: 'SpecWritten' });
    verified.dispatch({ kind: 'ScaffoldWritten' });
    verified.dispatch({ kind: 'AcImplemented', acName: 'ac1' });
    verified.dispatch({ kind: 'TestsPass' });
    verified.dispatch({ kind: 'Verified' });
    expect(() => verified.dispatch({ kind: 'Fail', reason: 'late' })).toThrow(/invalid transition/);
  }

  @Verifies<ScenarioOrchestratorFeature>('perFeatureAggregatesAcImplementedCount')
  'AllAcsImplemented transition is guarded by count === total, with duplicate names deduped'() {
    const fsm = new PerFeatureFsm('F', 3);
    fsm.dispatch({ kind: 'SpecWritten' });
    fsm.dispatch({ kind: 'ScaffoldWritten' });
    fsm.dispatch({ kind: 'AcImplemented', acName: 'a' });
    // Duplicate — should not advance.
    fsm.dispatch({ kind: 'AcImplemented', acName: 'a' });
    expect(fsm.currentState()).toBe('HasScaffold');
    expect(fsm.implementedCount()).toBe(1);
    fsm.dispatch({ kind: 'AcImplemented', acName: 'b' });
    fsm.dispatch({ kind: 'AcImplemented', acName: 'c' });
    expect(fsm.currentState()).toBe('AllAcsImplemented');
    expect(fsm.implementedCount()).toBe(3);
  }
}

void PerFeatureTests;
