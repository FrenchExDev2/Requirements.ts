/**
 * orchestrator-port — tests for the class→port adapter and the live-event
 * forwarding path through `playScenario`.
 *
 * The adapter reconciles two intentionally-divergent contracts: the concrete
 * `ScenarioOrchestrator` class (event-emitting, stateful) and the
 * `Orchestrator` port consumed by CLI cores (stateless, call-scoped). These
 * tests verify that the adapter:
 *
 *   1. Delegates `plan()` to the fallback planner without constructing an
 *      instance (no deps surgery for read-only operations).
 *   2. Constructs a fresh instance per `run()`, threads the AI flag through,
 *      and normalises the event log into plan-step shape.
 *   3. Wires the optional `onEvent` listener in run options and tears it
 *      down on return (no leaked subscriptions between runs).
 *   4. Surfaces the first `Error` event as the `failure` field when the
 *      scenario does not reach `Published`.
 *
 * Bound to:
 *   - ScenarioOrchestratorFeature.orchestratorCrossCouplingIsEventsOnly
 *     (the port surface is where cross-coupling leaves the class)
 *   - ScenarioPlayCommandFeature.scenarioPlayDispatchesToOrchestrator
 *     (the live-event path is what `play` dispatches through)
 */

import { expect, vi } from 'vitest';
import { ScenarioOrchestrator } from '../../../src/orchestrator.js';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ScenarioOrchestratorFeature } from '../../../requirements/features/scenario/scenario-orchestrator';
import { ScenarioPlayCommandFeature } from '../../../requirements/features/scenario/scenario-play-command';
import {
  makeScenarioOrchestratorPort,
  normaliseEventsToPlanSteps,
} from '../../../src/orchestrator-port';
import { playScenario, type Orchestrator } from '../../../src/commands';
import type { AiAdapter } from '../../../src/ai-adapter';
import type { OrchestratorEvent as OrchEvent } from '../../../src/orchestrator';
import type { UiEvent } from '../../../src/event-bridge';
import type { Scenario } from '../../../src/types';
import type { Clock, FileSystem, Logger, Prompt } from '@frenchexdev2/requirements-core/ports';
import type { runFeatureWizard, runRequirementWizard } from '@frenchexdev2/requirements-wizards';
import { SCHEMA_VERSION } from '@frenchexdev2/requirements-core/types';

// ── Shared fixtures ─────────────────────────────────────────────────────────

function makeDeps() {
  const fs: FileSystem = {
    readFile: async () => '', writeFile: async () => undefined,
    exists: async () => false, mkdir: async () => undefined,
    readdir: async () => [],
    stat: async () => ({ mtimeMs: 0, isDirectory: () => false, size: 0 }),
  };
  const clock: Clock = { now: () => 0 };
  const logger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
  const prompt: Prompt = {
    text: async () => '',
    select: async <T extends string>(_q: string, choices: readonly { value: T }[], d?: T) => d ?? choices[0]!.value,
    multiselect: async () => [],
    confirm: async () => true,
    note: () => undefined,
    spinner: () => ({ start: () => undefined, stop: () => undefined }),
  };
  const aiAdapter: AiAdapter = {
    kind: 'stub',
    implementAc: async (p: string) => ({ ok: true, generatedCode: `/* impl: ${p} */` }),
  };
  const stubWizard = (async (_ctx: unknown, seed: unknown) => seed) as unknown as typeof runFeatureWizard;
  const stubReqWizard = (async (_ctx: unknown, seed: unknown) => seed) as unknown as typeof runRequirementWizard;
  return {
    fs, clock, logger, prompt, aiAdapter,
    runFeatureWizard: stubWizard,
    runRequirementWizard: stubReqWizard,
  };
}

function makeScenario(): Scenario {
  return {
    $schemaVersion: SCHEMA_VERSION,
    id: 'demo',
    title: 'Demo',
    description: 'test',
    style: 'default',
    seeds: {
      requirements: [{ id: 'REQ-A', title: 'Req A', satisfiedByFeatureIds: ['FEAT-A'] }],
      features: [{
        id: 'FEAT-A', title: 'Feature A', priority: 'high', satisfies: ['REQ-A'],
        acs: [{ name: 'acOne', expects: ['unit'] }],
      }],
    },
    narration: { intro: 'go', outro: 'done' },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Port adapter tests
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(ScenarioOrchestratorFeature)
class OrchestratorPortTests {
  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  async finalStateWithoutErrorEventStillReportsFailure() {
    const spy=vi.spyOn(ScenarioOrchestrator.prototype,'run').mockResolvedValue({finalState:'Failed',published:false,events:[]});
    try {
      const result=await makeScenarioOrchestratorPort(makeDeps()).run(makeScenario(),{ai:false,seed:0,dryRun:false,cwd:'/tmp'});
      expect(result.complianceOk).toBe(false);
      expect(result.failure).toBe('Final state: Failed');
    } finally {spy.mockRestore();}
  }
  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  async 'port.plan() returns fallback plan without instantiating the class'() {
    const port = makeScenarioOrchestratorPort(makeDeps());
    const steps = port.plan(makeScenario());
    expect(steps.length).toBeGreaterThan(0);
    // Fallback plan starts with LoadScenario.
    expect(steps[0]?.event).toBe('LoadScenario');
  }

  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  async 'port.run() threads AI flag + normalises events into plan steps + surfaces narration'() {
    const port = makeScenarioOrchestratorPort(makeDeps());
    const s = makeScenario();
    const result = await port.run(s, { ai: false, seed: 0, dryRun: false, cwd: '/tmp' });
    expect(result.complianceOk).toBe(true);
    expect(result.complianceOutput).toBe('PASS');
    expect(result.narrationIntro).toBe('go');
    expect(result.narrationOutro).toBe('done');
    // Every transition has the canonical shape { fsm, from, to, event }.
    for (const step of result.transitions) {
      expect(step.fsm).toMatch(/^(ProjectLifecycle|PerFeature|PerAc)$/);
      expect(typeof step.from).toBe('string');
      expect(typeof step.to).toBe('string');
      expect(typeof step.event).toBe('string');
    }
    // PerFeature step carries { feature } payload; PerAc carries { feature, ac }.
    const pf = result.transitions.find(t => t.fsm === 'PerFeature');
    expect(pf?.payload).toMatchObject({ feature: 'FEAT-A' });
    const pa = result.transitions.find(t => t.fsm === 'PerAc');
    expect(pa?.payload).toMatchObject({ feature: 'FEAT-A', ac: 'acOne' });
  }

  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  async 'port.run() forwards raw events to opts.onEvent during execution'() {
    const port = makeScenarioOrchestratorPort(makeDeps());
    const received: OrchEvent[] = [];
    const r = await port.run(makeScenario(), {
      ai: false, seed: 0, dryRun: false, cwd: '/tmp',
      onEvent: (e) => received.push(e),
    });
    expect(r.complianceOk).toBe(true);
    expect(received.length).toBeGreaterThan(0);
    // Every event must have a recognised kind.
    for (const e of received) {
      expect(['ProjectLifecycle', 'PerFeature', 'PerAc', 'Narration', 'Error']).toContain(e.kind);
    }
    // The Narration intro shows up early in the stream.
    expect(received.some(e => e.kind === 'Narration' && e.message === 'go')).toBe(true);
  }

  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  async 'two sequential runs do not share subscriber state (fresh instance per call)'() {
    const port = makeScenarioOrchestratorPort(makeDeps());
    const a: OrchEvent[] = [];
    const b: OrchEvent[] = [];
    await port.run(makeScenario(), { ai: false, seed: 0, dryRun: false, cwd: '/tmp', onEvent: (e) => a.push(e) });
    await port.run(makeScenario(), { ai: false, seed: 0, dryRun: false, cwd: '/tmp', onEvent: (e) => b.push(e) });
    // Each call's listener sees a full, independent stream — no leakage.
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    // Sanity: the first event of each run is the Narration intro (same content).
    expect(a.find(e => e.kind === 'Narration')).toEqual(b.find(e => e.kind === 'Narration'));
  }

  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  async 'port.run() surfaces Error.reason as failure field when not Published'() {
    const base = makeDeps();
    const exploding = {
      ...base,
      runFeatureWizard: (async () => { throw new Error('wizard boom'); }) as unknown as typeof runFeatureWizard,
    };
    const port = makeScenarioOrchestratorPort(exploding);
    const r = await port.run(makeScenario(), { ai: false, seed: 0, dryRun: false, cwd: '/tmp' });
    expect(r.complianceOk).toBe(false);
    expect(r.complianceOutput).toBe('FAIL');
    expect(r.failure).toContain('wizard boom');
  }

  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  'normaliseEventsToPlanSteps drops Narration + Error, keeps FSM transitions in order'() {
    const events: OrchEvent[] = [
      { kind: 'Narration', message: 'hi' },
      { kind: 'ProjectLifecycle', from: 'Empty', to: 'Seeded', event: 'LoadScenario' },
      { kind: 'PerFeature', featureId: 'F', from: 'Empty', to: 'HasSpec', event: 'SpecWritten', acName: 'x' },
      { kind: 'PerAc', featureId: 'F', acName: 'x', from: 'Declared', to: 'Scaffolded', event: 'ScaffoldEmitted' },
      { kind: 'Error', reason: 'nope' },
    ];
    const steps = normaliseEventsToPlanSteps(events);
    expect(steps).toHaveLength(3);
    expect(steps[0]?.fsm).toBe('ProjectLifecycle');
    expect(steps[1]?.fsm).toBe('PerFeature');
    expect(steps[1]?.payload).toEqual({ feature: 'F', ac: 'x' });
    expect(steps[2]?.fsm).toBe('PerAc');
    expect(steps[2]?.payload).toEqual({ feature: 'F', ac: 'x' });
  }

  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  'normaliseEventsToPlanSteps omits ac key on PerFeature events that lack acName'() {
    const events: OrchEvent[] = [
      { kind: 'PerFeature', featureId: 'F', from: 'HasSpec', to: 'HasScaffold', event: 'ScaffoldWritten' },
    ];
    const steps = normaliseEventsToPlanSteps(events);
    expect(steps[0]?.payload).toEqual({ feature: 'F' });
  }
}

void OrchestratorPortTests;

// ══════════════════════════════════════════════════════════════════════════════
// playScenario live-event forwarding tests
// ══════════════════════════════════════════════════════════════════════════════

function stubValidator() {
  return { validate: async () => ({ ok: true as const, errors: [] as const }) };
}

@FeatureTest(ScenarioPlayCommandFeature)
class PlayScenarioLiveEventsTests {
  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayDispatchesToOrchestrator')
  async 'playScenario with onUiEvent forwards bridged UI events while orchestrator runs'() {
    const port = makeScenarioOrchestratorPort(makeDeps());
    const fs: FileSystem = {
      readFile: async () => '', writeFile: async () => undefined,
      exists: async () => true, // expectedArtifacts pass
      mkdir: async () => undefined, readdir: async () => [],
      stat: async () => ({ mtimeMs: 0, isDirectory: () => false, size: 0 }),
    };
    const ui: UiEvent[] = [];
    const r = await playScenario(
      JSON.stringify(makeScenario()),
      stubValidator(),
      port,
      fs,
      { ai: false, seed: 0, dryRun: false, cwd: '/tmp' },
      (e) => ui.push(e),
    );
    expect(r.ok).toBe(true);
    // UI stream has at least one FsmStarted, several transitions, and narration.
    expect(ui.some(e => e.kind === 'FsmStarted')).toBe(true);
    expect(ui.filter(e => e.kind === 'FsmTransition').length).toBeGreaterThan(0);
    expect(ui.some(e => e.kind === 'Narration' && e.text === 'go')).toBe(true);
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayDispatchesToOrchestrator')
  async 'playScenario without onUiEvent passes no onEvent sink to orchestrator (headless)'() {
    // Custom port that records whether onEvent was set.
    let onEventWasSet = false;
    const port: Orchestrator = {
      plan: () => [],
      run: async (_s, opts) => {
        onEventWasSet = opts.onEvent !== undefined;
        return { transitions: [], artifacts: [], complianceOk: true, complianceOutput: 'PASS' };
      },
    };
    const fs: FileSystem = {
      readFile: async () => '', writeFile: async () => undefined, exists: async () => true,
      mkdir: async () => undefined, readdir: async () => [],
      stat: async () => ({ mtimeMs: 0, isDirectory: () => false, size: 0 }),
    };
    await playScenario(
      JSON.stringify(makeScenario()),
      stubValidator(),
      port,
      fs,
      { ai: false, seed: 0, dryRun: false, cwd: '/tmp' },
      // No onUiEvent — headless mode.
    );
    expect(onEventWasSet).toBe(false);
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayDispatchesToOrchestrator')
  async 'playScenario dry-run skips event forwarding even if onUiEvent is provided'() {
    const port = makeScenarioOrchestratorPort(makeDeps());
    const fs: FileSystem = {
      readFile: async () => '', writeFile: async () => undefined, exists: async () => false,
      mkdir: async () => undefined, readdir: async () => [],
      stat: async () => ({ mtimeMs: 0, isDirectory: () => false, size: 0 }),
    };
    const ui: UiEvent[] = [];
    const r = await playScenario(
      JSON.stringify(makeScenario()),
      stubValidator(),
      port,
      fs,
      { ai: false, seed: 0, dryRun: true, cwd: '/tmp' },
      (e) => ui.push(e),
    );
    expect(r.exitCode).toBe(0);
    // Dry-run takes the plan()-only branch; no orchestrator.run() → no events.
    expect(ui).toHaveLength(0);
  }
}

void PlayScenarioLiveEventsTests;
