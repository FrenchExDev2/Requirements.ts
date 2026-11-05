/**
 * Tests for ScenarioOrchestrator — verifies the remaining 4 ACs of
 * ScenarioOrchestratorFeature (event bus + replay + cross-coupling + determinism).
 */

import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ScenarioOrchestratorFeature } from '../../../requirements/features/scenario/scenario-orchestrator';
import {
  ScenarioOrchestrator,
  type AiAdapter,
  type OrchestratorDeps,
  type OrchestratorEvent,
} from '../../../src/orchestrator';
import type { Scenario } from '../../../src/types';
import type { runFeatureWizard, runRequirementWizard } from '@frenchexdev2/requirements-wizards';
import type { Clock, FileSystem, Logger, Prompt } from '@frenchexdev2/requirements-core/ports';

// ── Stub ports ──────────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  const fs: FileSystem = {
    readFile: async () => '',
    writeFile: async () => undefined,
    exists: async () => false,
    mkdir: async () => undefined,
    readdir: async () => [],
    stat: async () => ({ mtimeMs: 0, isDirectory: () => false, size: 0 }),
  };
  const clock: Clock = { now: () => 0 };
  const logger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
  const prompt: Prompt = {
    text: async () => '',
    select: async <T extends string>(_q: string, choices: readonly { value: T }[], d?: T) => (d ?? choices[0]!.value),
    multiselect: async () => [],
    confirm: async () => true,
    note: () => undefined,
    spinner: () => ({ start: () => undefined, stop: () => undefined }),
  };
  const aiAdapter: AiAdapter = {
    kind: 'stub',
    implementAc: async (prompt_: string) => ({ ok: true, generatedCode: `/* impl: ${prompt_} */` }),
  };

  const stubRunFeatureWizard = (async (_ctx: unknown, seed: unknown) => seed) as unknown as typeof runFeatureWizard;
  const stubRunRequirementWizard = (async (_ctx: unknown, seed: unknown) => seed) as unknown as typeof runRequirementWizard;

  return {
    fs, clock, logger, prompt, aiAdapter,
    runFeatureWizard: stubRunFeatureWizard,
    runRequirementWizard: stubRunRequirementWizard,
    ai: false,
    ...overrides,
  };
}

function makeScenario(): Scenario {
  return {
    $schemaVersion: '2026-04-14',
    id: 'scenario-test',
    title: 'Test Scenario',
    description: 'deterministic fixture',
    style: 'default',
    seeds: {
      requirements: [
        { id: 'REQ-A', title: 'Requirement A' },
      ],
      features: [
        {
          id: 'FEAT-A',
          title: 'Feature A',
          acs: [
            { name: 'ac1', expects: ['unit'] },
            { name: 'ac2', expects: ['unit'] },
          ],
        },
        {
          id: 'FEAT-B',
          title: 'Feature B',
          acs: [
            { name: 'ac1', expects: ['unit'] },
          ],
        },
      ],
    },
    narration: { intro: 'hello', outro: 'bye' },
  };
}

@FeatureTest(ScenarioOrchestratorFeature)
class OrchestratorTests {
  @Verifies<ScenarioOrchestratorFeature>('orchestratorAppendsEveryEventToReplayLog')
  async doesNotDispatchFailureAgainAfterTerminalStates() {
    const failed = new ScenarioOrchestrator(makeDeps({
      runFeatureWizard: (async () => { throw new Error('wizard unavailable'); }) as typeof runFeatureWizard,
    }), makeScenario());
    expect((await failed.run()).finalState).toBe('Failed');
    const second = await failed.run();
    expect(second.published).toBe(false);
    expect(second.events.filter(event => event.kind === 'ProjectLifecycle' && event.event === 'Fail')).toHaveLength(1);

    const published = new ScenarioOrchestrator(makeDeps(), makeScenario());
    published.onEvent(event => {
      if (event.kind === 'ProjectLifecycle' && event.to === 'Published') throw new Error('observer unavailable');
    });
    const result = await published.run();
    expect(result.finalState).toBe('Published');
    expect(result.published).toBe(false);
    expect(result.events).toContainEqual({ kind: 'Error', reason: 'observer unavailable' });
  }
  @Verifies<ScenarioOrchestratorFeature>('orchestratorAppendsEveryEventToReplayLog')
  async optionalExpectedLevelsDefaultToEmpty() {
    const scenario=makeScenario();
    Reflect.deleteProperty(scenario.seeds.features[0]!.acs[0]!,'expects');
    const observed:string[][]=[];
    const deps=makeDeps({ai:true,aiAdapter:{kind:'stub',implementAc:async(_prompt,context)=>{observed.push([...(context?.expectedLevels??[])]);return {ok:true,generatedCode:'/* fixture */'};}}});
    const result=await new ScenarioOrchestrator(deps,scenario).run();
    expect(result.published).toBe(true);
    expect(observed[0]).toEqual([]);
  }
  @Verifies<ScenarioOrchestratorFeature>('orchestratorAppendsEveryEventToReplayLog')
  'run() appends a lifecycle trace + per-feature + per-ac events + narration to the replay log'() {
    return (async () => {
      const orch = new ScenarioOrchestrator(makeDeps(), makeScenario());
      const observed: OrchestratorEvent[] = [];
      const cancel = orch.onEvent((e) => observed.push(e));
      const result = await orch.run();
      cancel();
      cancel(); // idempotent removal

      expect(result.published).toBe(true);
      expect(result.finalState).toBe('Published');

      const log = orch.replay();
      expect(log.length).toBeGreaterThan(0);
      expect(log).toEqual(observed);

      // Narration intro + outro recorded.
      const narration = log.filter((e) => e.kind === 'Narration');
      expect(narration.map((n) => n.kind === 'Narration' ? n.message : '')).toEqual(['hello', 'bye']);

      // Every ProjectLifecycle transition recorded (7 forward).
      const lifecycle = log.filter((e) => e.kind === 'ProjectLifecycle');
      expect(lifecycle.map((e) => e.kind === 'ProjectLifecycle' ? e.to : '')).toEqual([
        'Seeded', 'RequirementsDrafted', 'FeaturesDerived',
        'ScaffoldingReady', 'Implementing', 'Verifying', 'Published',
      ]);

      // PerAc events: each ac has ScaffoldEmitted + ImplementStub + TestRunPass = 3.
      const perAc = log.filter((e) => e.kind === 'PerAc');
      expect(perAc.length).toBe(3 * 3);

      // PerFeature events present.
      const perFeat = log.filter((e) => e.kind === 'PerFeature');
      expect(perFeat.length).toBeGreaterThan(0);
    })();
  }

  @Verifies<ScenarioOrchestratorFeature>('orchestratorReplaysFromLogProducesIdenticalFinalStates')
  'two identical runs produce byte-identical replay logs (determinism on same input)'() {
    return (async () => {
      const scn = makeScenario();
      const a = new ScenarioOrchestrator(makeDeps(), scn);
      const b = new ScenarioOrchestrator(makeDeps(), scn);
      const [ra, rb] = await Promise.all([a.run(), b.run()]);
      expect(ra.finalState).toBe(rb.finalState);
      expect(ra.events).toEqual(rb.events);
      expect(JSON.stringify(a.replay())).toBe(JSON.stringify(b.replay()));
    })();
  }

  @Verifies<ScenarioOrchestratorFeature>('orchestratorCrossCouplingIsEventsOnly')
  'PerAcFsm completion flows to PerFeatureFsm strictly through AcImplemented events in the replay log'() {
    return (async () => {
      const orch = new ScenarioOrchestrator(makeDeps(), makeScenario());
      await orch.run();
      const log = orch.replay();

      // For each feature, AcImplemented PerFeature events follow the last
      // TestPassing PerAc event for that feature — never before.
      const acImpls = log
        .map((e, idx) => ({ e, idx }))
        .filter(({ e }) => e.kind === 'PerFeature' && e.event === 'AcImplemented');
      expect(acImpls.length).toBeGreaterThan(0);
      for (const { e, idx } of acImpls) {
        if (e.kind !== 'PerFeature') throw new Error('type narrowing');
        // Look for a preceding PerAc TestRunPass event for the same feature+ac.
        const predecessor = log.slice(0, idx).find(
          (x) => x.kind === 'PerAc' && x.featureId === e.featureId && x.acName === e.acName && x.event === 'TestRunPass',
        );
        expect(predecessor).toBeTruthy();
      }
    })();
  }

  @Verifies<ScenarioOrchestratorFeature>('orchestratorIsDeterministicUnderFixedSeed')
  'AI branch + failure handling + empty narration paths produce deterministic logs; failures route through Fail edge and return published=false'() {
    return (async () => {
      // AI branch: deterministic adapter.
      const deps = makeDeps({
        ai: true,
        aiAdapter: {
          kind: 'stub',
          implementAc: async (p, ctx) => ({ ok: true, generatedCode: `ai:${ctx.featureId}.${ctx.acName}:${p}` }),
        },
      });
      const scn1: Scenario = {
        ...makeScenario(),
        // Remove narration to hit the "no intro/outro" branches.
        narration: undefined,
        targets: { aiPrompts: { 'FEAT-A.ac1': 'custom prompt' } },
      };
      const a = new ScenarioOrchestrator(deps, scn1);
      const b = new ScenarioOrchestrator(makeDeps({ ai: true, aiAdapter: deps.aiAdapter }), scn1);
      const [ra, rb] = await Promise.all([a.run(), b.run()]);
      expect(ra.events).toEqual(rb.events);
      expect(ra.published).toBe(true);

      // Confirm AiImplement events appear (not ImplementStub).
      const aiEvents = ra.events.filter((e) => e.kind === 'PerAc' && e.event === 'AiImplement');
      expect(aiEvents.length).toBe(3);

      // Failure path: a wizard throws.
      const failing = makeDeps({
        runFeatureWizard: (async () => { throw new Error('boom'); }) as unknown as typeof runFeatureWizard,
      });
      const orch = new ScenarioOrchestrator(failing, makeScenario());
      const result = await orch.run();
      expect(result.published).toBe(false);
      expect(result.finalState).toBe('Failed');
      const errorEvents = result.events.filter((e) => e.kind === 'Error');
      expect(errorEvents.length).toBe(1);

      // Failure at verify-time is idempotent (Fail not re-dispatched when already Failed/Published).
      // Simulate a failure during implement by making AiAdapter throw.
      const crashAi = makeDeps({
        ai: true,
        aiAdapter: { kind: 'stub', implementAc: async () => { throw new Error('ai crash'); } },
      });
      const orch2 = new ScenarioOrchestrator(crashAi, makeScenario());
      const r2 = await orch2.run();
      expect(r2.published).toBe(false);
      expect(r2.finalState).toBe('Failed');

      // Non-Error throw value is coerced via String(err).
      const stringThrow = makeDeps({
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        runFeatureWizard: (async () => { throw 'raw-string-reason'; }) as unknown as typeof runFeatureWizard,
      });
      const orch3 = new ScenarioOrchestrator(stringThrow, makeScenario());
      const r3 = await orch3.run();
      expect(r3.published).toBe(false);
      const err3 = r3.events.find((e) => e.kind === 'Error');
      expect(err3 && err3.kind === 'Error' && err3.reason).toBe('raw-string-reason');
    })();
  }
}

void OrchestratorTests;
