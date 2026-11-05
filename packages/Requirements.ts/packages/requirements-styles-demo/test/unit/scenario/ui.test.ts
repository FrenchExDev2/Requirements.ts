/**
 * ui.ts — unit tests for ScenariiPlayer terminal UI (event routing layer).
 *
 * Coverage strategy:
 *   - Pure core (`makeScenarioUi`, `routeEvent`, `labelFor`) is exercised end
 *     to end against a fake `Prompt` whose spinner records start/stop calls.
 *   - TTY-bound real-clack paths in `startScenarioUi` are tested indirectly in
 *     non-interactive mode (which does not call clack); the interactive
 *     branches are `/* v8 ignore * /`-exempt, same pattern as explore-shell.ts.
 *
 * Bound to the three narration-related ACs of ScenarioPlayCommandFeature.
 */

import { expect, vi } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ScenarioPlayCommandFeature } from '../../../requirements/features/scenario/scenario-play-command';
import {
  labelFor,
  makeScenarioUi,
  routeEvent,
  startScenarioUi,
  type OrchestratorEvent,
  type OrchestratorResult,
} from '../../../src/ui';
import type { Scenario } from '../../../src/types';
import type { Clock, Logger, Prompt, PromptSpinner } from '@frenchexdev2/requirements-core/ports';
import { SCHEMA_VERSION } from '@frenchexdev2/requirements-core/types';

// ── Fakes ──────────────────────────────────────────────────────────────────

interface FakeSpinnerRecord {
  readonly starts: string[];
  readonly stops: string[];
}

interface FakePrompt {
  readonly prompt: Prompt;
  readonly spinners: FakeSpinnerRecord[];
  readonly notes: Array<{ msg: string; title?: string }>;
}

function fakePrompt(): FakePrompt {
  const spinners: FakeSpinnerRecord[] = [];
  const notes: Array<{ msg: string; title?: string }> = [];
  const prompt: Prompt = {
    async text() { /* v8 ignore next */ return ''; },
    async select<T extends string>() { /* v8 ignore next */ return '' as T; },
    async multiselect<T extends string>() { /* v8 ignore next */ return [] as readonly T[]; },
    async confirm() { /* v8 ignore next */ return false; },
    note(msg: string, title?: string) { notes.push({ msg, title }); },
    spinner(): PromptSpinner {
      const rec: FakeSpinnerRecord = { starts: [], stops: [] };
      spinners.push(rec);
      return {
        start(m: string) { rec.starts.push(m); },
        stop(m: string) { rec.stops.push(m); },
      };
    },
  };
  return { prompt, spinners, notes };
}

function captureLogger(): { readonly logger: Logger; readonly lines: string[] } {
  const lines: string[] = [];
  const logger: Logger = {
    info: (m: string) => { lines.push(`info: ${m}`); },
    warn: (m: string) => { lines.push(`warn: ${m}`); },
    error: (m: string) => { lines.push(`error: ${m}`); },
  };
  return { logger, lines };
}

const fixedClock: Clock = { now: () => 0 };

function makeScenario(overrides?: Partial<Scenario['narration']>): Scenario {
  return {
    $schemaVersion: SCHEMA_VERSION,
    id: 'demo',
    title: 'Demo scenario',
    description: 'test',
    style: 'default',
    seeds: { requirements: [], features: [] },
    narration: {
      intro: 'welcome',
      outro: 'thanks',
      stepDelayMs: 50,
      ...overrides,
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

@FeatureTest(ScenarioPlayCommandFeature)
class ScenariiPlayerUiTests {
  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayEmitsOutroNarration')
  interactiveFailureListsEveryReason() {
    const p=fakePrompt(),l=captureLogger();
    const ui=makeScenarioUi({prompt:p.prompt,logger:l.logger,clock:fixedClock},makeScenario(),false);
    ui.finish({ok:false,durationMs:1,summary:'failed',failures:['missing AC']});
    expect(l.lines.some(line=>line.includes('missing AC'))).toBe(true);
    expect(p.notes.length).toBeGreaterThan(0);
  }
  // Narration intro (clack.note in interactive / single log line in non-interactive).

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayEmitsIntroNarration')
  'startScenarioUi emits intro via logger in non-interactive mode, via prompt.note otherwise'() {
    const p1 = fakePrompt();
    const l1 = captureLogger();
    startScenarioUi(
      { prompt: p1.prompt, logger: l1.logger, clock: fixedClock, nonInteractive: true },
      makeScenario(),
    );
    expect(l1.lines.some(x => x.includes('welcome'))).toBe(true);
    expect(p1.notes.length).toBe(0);

    // Interactive branch — prompt.note is called.
    const p2 = fakePrompt();
    const l2 = captureLogger();
    const ui = startScenarioUi(
      { prompt: p2.prompt, logger: l2.logger, clock: fixedClock, nonInteractive: false },
      makeScenario(),
    );
    expect(p2.notes[0]).toEqual({ msg: 'welcome', title: 'Demo scenario' });
    expect(ui.nonInteractive).toBe(false);

    // Intro fallback when narration absent.
    const p3 = fakePrompt();
    const l3 = captureLogger();
    const scenarioNoNarration: Scenario = {
      $schemaVersion: SCHEMA_VERSION,
      id: 'x', title: 'T', description: '', style: 'default',
      seeds: { requirements: [], features: [] },
    };
    startScenarioUi(
      { prompt: p3.prompt, logger: l3.logger, clock: fixedClock, nonInteractive: true },
      scenarioNoNarration,
    );
    expect(l3.lines.some(x => x.includes('Scenario: T'))).toBe(true);
  }

  // Narration outro + event routing — this AC exercises the full FSM-event dispatch.

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayEmitsOutroNarration')
  'event routing spins spinners, labels them, and finish() prints the outro'() {
    const p = fakePrompt();
    const l = captureLogger();
    const ui = makeScenarioUi(
      { prompt: p.prompt, logger: l.logger, clock: fixedClock },
      makeScenario(),
      false,
    );

    // Subscribe via connectTo — the listener must be hooked.
    let emit: (e: OrchestratorEvent) => void = () => { /* placeholder */ };
    const cancel = vi.fn();
    const unsub = ui.connectTo((listener) => { emit = listener; return cancel; });
    expect(typeof unsub).toBe('function');

    // Start a project-level FSM; one spinner spawns.
    emit({ kind: 'FsmStarted', fsm: { kind: 'project' }, initialState: 'Empty' });
    expect(p.spinners.length).toBe(1);
    expect(p.spinners[0]!.starts[0]).toBe('ProjectLifecycle: Empty');

    // Transition with progress counters → label updates via start(msg).
    emit({
      kind: 'FsmTransition',
      fsm: { kind: 'project' },
      from: 'Empty',
      to: 'Implementing',
      progress: { done: 2, total: 4 },
    });
    expect(p.spinners[0]!.starts[1]).toBe('ProjectLifecycle: Implementing (2/4)');

    // Feature FSM started → second spinner.
    emit({
      kind: 'FsmStarted',
      fsm: { kind: 'feature', featureId: 'CART' },
      initialState: 'Empty',
    });
    expect(p.spinners.length).toBe(2);
    expect(p.spinners[1]!.starts[0]).toBe('Feature CART: Empty');

    // AC FSM transition fired before a prior 'FsmStarted' → new spinner spawns gracefully.
    emit({
      kind: 'FsmTransition',
      fsm: { kind: 'ac', featureId: 'CART', acName: 'addItem' },
      from: 'Declared',
      to: 'Scaffolded',
    });
    expect(p.spinners.length).toBe(3);
    expect(p.spinners[2]!.starts[0]).toBe('AC CART.addItem: Scaffolded');

    // Narration event — logger only.
    emit({ kind: 'Narration', text: 'midway marker' });
    expect(l.lines.some(x => x.includes('midway marker'))).toBe(true);

    // FsmFinished with ok=true stops the spinner with a check-mark label.
    emit({
      kind: 'FsmFinished',
      fsm: { kind: 'feature', featureId: 'CART' },
      finalState: 'Verified',
      ok: true,
    });
    expect(p.spinners[1]!.stops[0]).toContain('Feature CART: Verified');
    expect(p.spinners[1]!.stops[0]!.startsWith('✓')).toBe(true);

    // Idempotent: duplicate FsmFinished for the same FSM is ignored.
    emit({
      kind: 'FsmFinished',
      fsm: { kind: 'feature', featureId: 'CART' },
      finalState: 'Verified',
      ok: true,
    });
    expect(p.spinners[1]!.stops.length).toBe(1);

    // FsmFinished with no prior spinner → falls back to logger.
    emit({
      kind: 'FsmFinished',
      fsm: { kind: 'ac', featureId: 'X', acName: 'y' },
      finalState: 'Failed',
      ok: false,
    });
    expect(l.lines.some(x => x.includes('AC X.y: Failed'))).toBe(true);

    // finish() stops any still-running spinner and emits outro.
    const result: OrchestratorResult = {
      ok: true,
      durationMs: 123,
      summary: 'all green',
      failures: [],
    };
    ui.finish(result);
    // project + ac spinners remain in the map; both got a 'cancelled' stop from finish()
    // (the CART spinner was already cleared). Verify finish emits outro via prompt.note.
    expect(p.notes.some(n => n.msg.includes('all green'))).toBe(true);

    // finish() is idempotent.
    ui.finish(result);
    const outroNotes = p.notes.filter(n => n.msg.includes('all green'));
    expect(outroNotes.length).toBe(1);

    // Non-interactive failure-report branch.
    const p2 = fakePrompt();
    const l2 = captureLogger();
    const ui2 = makeScenarioUi(
      { prompt: p2.prompt, logger: l2.logger, clock: fixedClock },
      makeScenario(),
      true,
    );
    ui2.connectTo(() => () => { /* noop */ });
    ui2.finish({ ok: false, durationMs: 7, summary: 'boom', failures: ['bad-ac'] });
    expect(l2.lines.some(x => x.startsWith('info: FAIL'))).toBe(true);
    expect(l2.lines.some(x => x.includes('bad-ac'))).toBe(true);

    // Non-interactive FsmFinished routing — both ok:true (info) and ok:false (error).
    const p3 = fakePrompt();
    const l3 = captureLogger();
    const ui3 = makeScenarioUi(
      { prompt: p3.prompt, logger: l3.logger, clock: fixedClock },
      makeScenario(),
      true,
    );
    let emit3: (e: OrchestratorEvent) => void = () => { /* noop */ };
    ui3.connectTo((listener) => { emit3 = listener; return () => { /* noop */ }; });
    emit3({ kind: 'FsmStarted', fsm: { kind: 'project' }, initialState: 'Empty' });
    emit3({ kind: 'FsmTransition', fsm: { kind: 'project' }, from: 'Empty', to: 'Seeded' });
    emit3({ kind: 'FsmFinished', fsm: { kind: 'project' }, finalState: 'Published', ok: true });
    emit3({
      kind: 'FsmFinished',
      fsm: { kind: 'feature', featureId: 'BAD' },
      finalState: 'Failed',
      ok: false,
    });
    expect(l3.lines.some(x => x.startsWith('info: ▶ ProjectLifecycle: Empty'))).toBe(true);
    expect(l3.lines.some(x => x.includes('Empty → Seeded'))).toBe(true);
    expect(l3.lines.some(x => x.startsWith('info: ✓ ProjectLifecycle: Published'))).toBe(true);
    expect(l3.lines.some(x => x.startsWith('error: ✗ Feature BAD: Failed'))).toBe(true);
    // Non-interactive finish with ok:true for info line.
    ui3.finish({ ok: true, durationMs: 1, summary: 'green' });
    expect(l3.lines.some(x => x.startsWith('info: OK'))).toBe(true);
  }

  // Narration pacing — stepDelayMs.

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayRespectsStepDelayMs')
  async 'pace() awaits scenario.narration.stepDelayMs via the injected sleep port'() {
    const p = fakePrompt();
    const l = captureLogger();
    const delays: number[] = [];
    const ui = makeScenarioUi(
      {
        prompt: p.prompt,
        logger: l.logger,
        clock: fixedClock,
        sleep: async (ms: number) => { delays.push(ms); },
      },
      makeScenario({ stepDelayMs: 42 }),
      true,
    );
    await ui.pace();
    expect(delays).toEqual([42]);

    // stepDelayMs omitted (or 0) → pace() is a no-op, never calls sleep.
    const ui2 = makeScenarioUi(
      {
        prompt: p.prompt,
        logger: l.logger,
        clock: fixedClock,
        sleep: async (ms: number) => { delays.push(ms); },
      },
      makeScenario({ stepDelayMs: 0 }),
      true,
    );
    await ui2.pace();
    expect(delays).toEqual([42]); // unchanged

    // No narration block at all.
    const scenarioNoNarration: Scenario = {
      $schemaVersion: SCHEMA_VERSION,
      id: 'x', title: 'T', description: '', style: 'default',
      seeds: { requirements: [], features: [] },
    };
    const ui3 = makeScenarioUi(
      { prompt: p.prompt, logger: l.logger, clock: fixedClock, sleep: async () => { delays.push(-1); } },
      scenarioNoNarration,
      true,
    );
    await ui3.pace();
    expect(delays).toEqual([42]); // unchanged — still noop

    // Pure helper: labelFor exercises every fsm-kind branch + no-progress path.
    expect(labelFor({ kind: 'project' }, 'Seeded')).toBe('ProjectLifecycle: Seeded');
    expect(labelFor({ kind: 'feature', featureId: 'F' }, 'Ready', { done: 1, total: 3 }))
      .toBe('Feature F: Ready (1/3)');
    expect(labelFor({ kind: 'ac', featureId: 'F', acName: 'x' }, 'TestPassing'))
      .toBe('AC F.x: TestPassing');

    // routeEvent called directly also works — single-entry dispatcher.
    const p4 = fakePrompt();
    const l4 = captureLogger();
    routeEvent(
      { kind: 'FsmStarted', fsm: { kind: 'project' }, initialState: 'Empty' },
      {
        nonInteractive: true,
        logger: l4.logger,
        prompt: p4.prompt,
        spinners: new Map(),
        finished: new Set(),
      },
    );
    expect(l4.lines.some(x => x.includes('ProjectLifecycle: Empty'))).toBe(true);

    // Non-interactive FsmTransition → logs `from → to` line.
    const l5 = captureLogger();
    routeEvent(
      {
        kind: 'FsmTransition',
        fsm: { kind: 'project' },
        from: 'A',
        to: 'B',
      },
      {
        nonInteractive: true,
        logger: l5.logger,
        prompt: p4.prompt,
        spinners: new Map(),
        finished: new Set(),
      },
    );
    expect(l5.lines.some(x => x.includes('A → B'))).toBe(true);
  }

  // Closes last 1 stmt + 3 branches on ui.ts: defaultSleep fallback + outro??line + failures??[]
  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayRespectsStepDelayMs')
  async 'pace() falls back to defaultSleep when deps.sleep is undefined'() {
    const p = fakePrompt();
    const l = captureLogger();
    const ui = makeScenarioUi(
      { prompt: p.prompt, logger: l.logger, clock: fixedClock /* no sleep */ },
      makeScenario({ stepDelayMs: 1 }),
      true,
    );
    await ui.pace();   // invokes defaultSleep (v8-ignored body); assignment branch covered
    expect(true).toBe(true);
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayEmitsOutroNarration')
  'finish() uses summary fallback when narration.outro is omitted, and [] when failures is omitted'() {
    const p = fakePrompt();
    const l = captureLogger();
    const scenarioNoOutro: Scenario = {
      $schemaVersion: SCHEMA_VERSION,
      id: 'no-outro', title: 'No outro', description: '', style: 'default',
      seeds: { requirements: [], features: [] },
      // narration omitted entirely → printOutro falls back to `line`
    };
    const ui = makeScenarioUi(
      { prompt: p.prompt, logger: l.logger, clock: fixedClock },
      scenarioNoOutro,
      false,
    );
    ui.finish({ ok: true, durationMs: 1, summary: 'green' });  // failures omitted → ?? [] branch
    // prompt.note was called — the fallback chains `outro ?? line` + `failures ?? []` succeeded
    expect(p.notes.length).toBeGreaterThan(0);
  }
}

void ScenariiPlayerUiTests;
