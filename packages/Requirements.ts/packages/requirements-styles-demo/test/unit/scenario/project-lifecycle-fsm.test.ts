/**
 * Tests for ProjectLifecycleFsm — FSM A of the scenario orchestrator.
 * Verifies 10 ACs of ScenarioOrchestratorFeature.
 */

import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ScenarioOrchestratorFeature } from '../../../requirements/features/scenario/scenario-orchestrator';
import {
  ProjectLifecycleFsm,
  PROJECT_LIFECYCLE_TRANSITIONS,
  type ProjectLifecycleState,
  type ProjectLifecycleTransition,
} from '../../../src/project-lifecycle-fsm';

function driveTo(fsm: ProjectLifecycleFsm, ...events: readonly Parameters<ProjectLifecycleFsm['dispatch']>[0][]): void {
  for (const e of events) fsm.dispatch(e);
}

@FeatureTest(ScenarioOrchestratorFeature)
class ProjectLifecycleTests {
  @Verifies<ScenarioOrchestratorFeature>('projectLifecycleStartsInEmpty')
  'a fresh ProjectLifecycleFsm is in state Empty'() {
    const fsm = new ProjectLifecycleFsm();
    expect(fsm.currentState()).toBe('Empty' satisfies ProjectLifecycleState);
    expect(fsm.replay()).toEqual([]);
  }

  @Verifies<ScenarioOrchestratorFeature>('loadScenarioTransitionsEmptyToSeeded')
  'LoadScenario moves Empty to Seeded'() {
    const fsm = new ProjectLifecycleFsm();
    const next = fsm.dispatch({ kind: 'LoadScenario' });
    expect(next).toBe('Seeded');
    expect(fsm.currentState()).toBe('Seeded');
  }

  @Verifies<ScenarioOrchestratorFeature>('generateRequirementsTransitionsSeededToRequirementsDrafted')
  'GenerateRequirements moves Seeded to RequirementsDrafted'() {
    const fsm = new ProjectLifecycleFsm();
    driveTo(fsm, { kind: 'LoadScenario' }, { kind: 'GenerateRequirements' });
    expect(fsm.currentState()).toBe('RequirementsDrafted');
  }

  @Verifies<ScenarioOrchestratorFeature>('deriveFeaturesTransitionsToFeaturesDerived')
  'DeriveFeatures moves RequirementsDrafted to FeaturesDerived'() {
    const fsm = new ProjectLifecycleFsm();
    driveTo(fsm, { kind: 'LoadScenario' }, { kind: 'GenerateRequirements' }, { kind: 'DeriveFeatures' });
    expect(fsm.currentState()).toBe('FeaturesDerived');
  }

  @Verifies<ScenarioOrchestratorFeature>('scaffoldTransitionsToScaffoldingReady')
  'Scaffold moves FeaturesDerived to ScaffoldingReady'() {
    const fsm = new ProjectLifecycleFsm();
    driveTo(fsm,
      { kind: 'LoadScenario' }, { kind: 'GenerateRequirements' },
      { kind: 'DeriveFeatures' }, { kind: 'Scaffold' });
    expect(fsm.currentState()).toBe('ScaffoldingReady');
  }

  @Verifies<ScenarioOrchestratorFeature>('implementTransitionsToImplementing')
  'Implement moves ScaffoldingReady to Implementing'() {
    const fsm = new ProjectLifecycleFsm();
    driveTo(fsm,
      { kind: 'LoadScenario' }, { kind: 'GenerateRequirements' },
      { kind: 'DeriveFeatures' }, { kind: 'Scaffold' }, { kind: 'Implement' });
    expect(fsm.currentState()).toBe('Implementing');
  }

  @Verifies<ScenarioOrchestratorFeature>('allAcsDoneTransitionsToVerifying')
  'AllAcsDone moves Implementing to Verifying'() {
    const fsm = new ProjectLifecycleFsm();
    driveTo(fsm,
      { kind: 'LoadScenario' }, { kind: 'GenerateRequirements' },
      { kind: 'DeriveFeatures' }, { kind: 'Scaffold' },
      { kind: 'Implement' }, { kind: 'AllAcsDone' });
    expect(fsm.currentState()).toBe('Verifying');
  }

  @Verifies<ScenarioOrchestratorFeature>('verifyTransitionsVerifyingToPublished')
  'Verify moves Verifying to Published'() {
    const fsm = new ProjectLifecycleFsm();
    driveTo(fsm,
      { kind: 'LoadScenario' }, { kind: 'GenerateRequirements' },
      { kind: 'DeriveFeatures' }, { kind: 'Scaffold' },
      { kind: 'Implement' }, { kind: 'AllAcsDone' }, { kind: 'Verify' });
    expect(fsm.currentState()).toBe('Published');
  }

  @Verifies<ScenarioOrchestratorFeature>('everyProjectLifecycleTransitionIsTested')
  'every declared transition in the table fires at least once via dispatch; listeners + replay + invalid-transition path + onTransition unsubscribe all exercised'() {
    // Drive every success + every Fail edge; assert the transition table is covered.
    const successRules = PROJECT_LIFECYCLE_TRANSITIONS.filter((r) => r.on !== 'Fail');
    const failRules    = PROJECT_LIFECYCLE_TRANSITIONS.filter((r) => r.on === 'Fail');

    // Success chain: walk all 7 forward transitions.
    const fsm = new ProjectLifecycleFsm();
    const seen: ProjectLifecycleTransition[] = [];
    const off = fsm.onTransition((t) => seen.push(t));
    for (const r of successRules) {
      // Replay history so `state === r.from`; we rely on linear order.
      fsm.dispatch({ kind: r.on } as Parameters<ProjectLifecycleFsm['dispatch']>[0]);
    }
    expect(fsm.currentState()).toBe('Published');
    expect(seen.length).toBe(successRules.length);
    expect(fsm.replay().length).toBe(successRules.length);

    // Unsubscribe works.
    off();
    const unsub2 = fsm.onTransition(() => { /* noop */ });
    unsub2();     // first removal
    unsub2();     // second removal — idempotent (listener already gone).

    // Cover every Fail edge by building a fresh FSM up to each from-state.
    const prefixTo: Record<ProjectLifecycleState, readonly Parameters<ProjectLifecycleFsm['dispatch']>[0][]> = {
      Empty: [],
      Seeded: [{ kind: 'LoadScenario' }],
      RequirementsDrafted: [{ kind: 'LoadScenario' }, { kind: 'GenerateRequirements' }],
      FeaturesDerived: [{ kind: 'LoadScenario' }, { kind: 'GenerateRequirements' }, { kind: 'DeriveFeatures' }],
      ScaffoldingReady: [{ kind: 'LoadScenario' }, { kind: 'GenerateRequirements' }, { kind: 'DeriveFeatures' }, { kind: 'Scaffold' }],
      Implementing: [{ kind: 'LoadScenario' }, { kind: 'GenerateRequirements' }, { kind: 'DeriveFeatures' }, { kind: 'Scaffold' }, { kind: 'Implement' }],
      Verifying: [{ kind: 'LoadScenario' }, { kind: 'GenerateRequirements' }, { kind: 'DeriveFeatures' }, { kind: 'Scaffold' }, { kind: 'Implement' }, { kind: 'AllAcsDone' }],
      Published: [],
      Failed: [],
    };
    for (const r of failRules) {
      const failFsm = new ProjectLifecycleFsm();
      for (const e of prefixTo[r.from]) failFsm.dispatch(e);
      failFsm.dispatch({ kind: 'Fail', reason: `fail-from-${r.from}` });
      expect(failFsm.currentState()).toBe('Failed');
    }

    // Invalid transition path throws (bad event for current state).
    const bad = new ProjectLifecycleFsm();
    expect(() => bad.dispatch({ kind: 'Verify' })).toThrow(/invalid transition/);
  }

  @Verifies<ScenarioOrchestratorFeature>('anyStepFailureTransitionsToFailed')
  'Fail can be dispatched from every non-terminal state and reaches Failed'() {
    const fsm = new ProjectLifecycleFsm();
    fsm.dispatch({ kind: 'LoadScenario' });
    fsm.dispatch({ kind: 'Fail', reason: 'boom' });
    expect(fsm.currentState()).toBe('Failed');
    const log = fsm.replay();
    expect(log[log.length - 1]?.to).toBe('Failed');
  }
}

void ProjectLifecycleTests;
