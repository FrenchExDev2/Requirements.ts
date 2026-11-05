/**
 * Unit tests for `explore-core.ts` — pure navigation FSM + graph builder.
 *
 * Covers every AC of FeatureTraceExplorerTuiFeature that is expressible
 * without a real TTY. TTY-bound ACs (non-TTY refusal, Ctrl+C teardown,
 * prompt-port-for-interaction) are exercised through the shell-layer
 * integration path below by stubbing `process.stdout.isTTY` and injecting
 * a mock Prompt.
 */

import { expect } from 'vitest';
import { FeatureTest, Verifies } from '../../src';
import { Priority } from '../../src';
import { FeatureTraceExplorerTuiFeature } from '@frenchexdev2/requirements-requirements';
import {
  SCHEMA_VERSION,
  featureId,
  isoDate,
  requirementId,
  sentence,
  type AcName,
  type FeatureId,
  type FeatureSpec,
  type RequirementSpec,
} from '@frenchexdev2/requirements-core/types';
import {
  buildTraceGraph,
  EMPTY_LINE,
  formatActionPrompt,
  formatErrorMessage,
  HELP_LINES,
  initialState,
  KEY_CHOICES,
  keyToEvent,
  listAt,
  loadSpecsViaFileSystem,
  readTestRegistry,
  renderListLine,
  step,
  viewTitle,
  type ExploreState,
  type TestRef,
  type TraceGraph,
} from '@frenchexdev2/requirements-core/explore-core';
import { runExploreCli, runExploreInteractive } from '../../src/cli/explore-shell';
import { PromptCancelledError } from '../../src/cli/prompt-shell';
import type { FileSystem, Prompt, PromptChoice } from '../../src/ports/external';

// ══════════════════════════════════════════════════════════════════════════════
// Fixtures
// ══════════════════════════════════════════════════════════════════════════════

function mkReq(id: string, title = id): RequirementSpec {
  return {
    $schemaVersion: SCHEMA_VERSION,
    kind: 'requirement',
    id: requirementId(id),
    title,
    statement: { pattern: 'ubiquitous', response: sentence('Shall.') },
    requirementKind: 'Functional',
    priority: Priority.High,
    status: 'Approved',
    source: { type: 'stakeholder', role: 'x', date: isoDate('2026-04-14') },
    rationale: { claim: sentence('Because.'), kind: 'principle', evidence: [] },
    fitCriteria: [{ kind: 'narrative', text: sentence('OK.') }],
    verificationMethod: 'Test',
    risk: { level: 'Low', ifNotMet: sentence('Meh.') },
    satisfiedBy: [],
  };
}

function mkFeat(id: string, acs: readonly string[], satisfies: readonly string[] = []): FeatureSpec {
  return {
    $schemaVersion: SCHEMA_VERSION,
    kind: 'feature',
    id: featureId(id),
    title: id,
    priority: Priority.High,
    acs: acs.map((n) => ({ name: n as unknown as AcName, expects: ['unit' as never] })),
    ...(satisfies.length > 0 ? { satisfies: satisfies.map((s) => requirementId(s)) } : {}),
  };
}

function mkTestRef(feature: string, ac: string, testClass: string, testMethod: string): TestRef {
  return {
    feature: feature as unknown as FeatureId,
    ac: ac as unknown as AcName,
    testClass,
    testMethod,
  };
}

/** Small corpus covering the REQ → FEAT → AC → TEST chain. */
function mkGraph(): TraceGraph {
  const reqs = [mkReq('REQ-A'), mkReq('REQ-B')];
  const feats = [mkFeat('FEAT-1', ['alpha', 'beta'], ['REQ-A']), mkFeat('FEAT-2', [], ['REQ-A'])];
  const tests: TestRef[] = [
    mkTestRef('FEAT-1', 'alpha', 'AlphaTests', 'works'),
    mkTestRef('FEAT-1', 'alpha', 'AlphaTests', 'alsoWorks'),
  ];
  return buildTraceGraph(reqs, feats, tests);
}

// ══════════════════════════════════════════════════════════════════════════════
// Scripted Prompt — for integration tests
// ══════════════════════════════════════════════════════════════════════════════

function mkPrompt(keys: readonly string[]): Prompt {
  const q = [...keys];
  return {
    async text() { throw new Error('unexpected text'); },
    async select<T extends string>(_q: string, _choices: readonly PromptChoice<T>[], dflt?: T): Promise<T> {
      const next = q.shift();
      if (next === undefined) return (dflt ?? 'q') as T;
      return next as T;
    },
    async multiselect() { throw new Error('unexpected multiselect'); },
    async confirm() { return false; },
    note() {},
    spinner() { return { start() {}, stop() {} }; },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// In-memory FileSystem
// ══════════════════════════════════════════════════════════════════════════════

function mkFs(files: Record<string, string>, dirs: Record<string, string[]>): FileSystem {
  return {
    async readFile(p: string) {
      if (!(p in files)) throw new Error(`ENOENT ${p}`);
      return files[p]!;
    },
    async writeFile() {},
    async exists(p: string) { return p in files; },
    async readdir(p: string) {
      if (!(p in dirs)) throw new Error(`ENOENT ${p}`);
      return dirs[p]!;
    },
    async stat() { return { mtimeMs: 0, isDirectory() { return false; }, size: 0 }; },
    async mkdir() {},
  };
}

@FeatureTest(FeatureTraceExplorerTuiFeature)
class ExplorerTerminalTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerHandlesArrowKeyNavigation')
  async emptyViewsAndUnknownKeysExitCleanly() {
    let output = '';
    await runExploreInteractive({
      fs: mkFs({}, { '/feats': [], '/reqs': [] }),
      stdout: { write: text => { output += text; }, isTty: () => true },
      stderr: { write() {}, isTty: () => false },
      prompt: mkPrompt(['unmapped']),
    }, { featuresDir: '/feats', requirementsDir: '/reqs' });
    expect(output).toContain(EMPTY_LINE);
    expect(output).toContain('bye.');
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerHandlesArrowKeyNavigation')
  async cancellationExitsWhileUnexpectedPromptFailuresPropagate() {
    for (const error of [new PromptCancelledError(), new Error('prompt unavailable')]) {
      const prompt = { ...mkPrompt([]), select: async () => { throw error; } };
      const pending = runExploreInteractive({
        fs: mkFs({}, { '/feats': [], '/reqs': [] }),
        stdout: { write() {}, isTty: () => true },
        stderr: { write() {}, isTty: () => false }, prompt,
      }, { featuresDir: '/feats', requirementsDir: '/reqs' });
      if (error instanceof PromptCancelledError) await expect(pending).resolves.toBeUndefined();
      else await expect(pending).rejects.toThrow('prompt unavailable');
    }
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerHandlesArrowKeyNavigation')
  async cliRunsTheInteractiveDriverAndReportsSuccess() {
    const exits: number[] = [];
    let output = '';
    await runExploreCli({ featuresDir: '/feats', requirementsDir: '/reqs' }, {
      fs: mkFs({}, { '/feats': [], '/reqs': [] }),
      stdout: { write: text => { output += text; }, isTTY: true },
      stderr: { write() {} }, exit: code => { exits.push(code); }, prompt: mkPrompt(['q']),
    });
    expect(exits).toEqual([0]);
    expect(output).toContain('bye.');
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerHandlesArrowKeyNavigation')
  async cliForwardsTerminalPortsAndFormatsCancellationAndFailure() {
    for (const error of [new PromptCancelledError(), new Error('driver unavailable')]) {
      const exits: number[] = [];
      let output = '', diagnostics = '';
      const options = { featuresDir: '/feats', requirementsDir: '/reqs' };
      const fs = mkFs({}, {});
      await runExploreCli(options, {
        fs,
        stdout: { write: text => { output += text; }, isTTY: true },
        stderr: { write: text => { diagnostics += text; } },
        exit: code => { exits.push(code); },
        runInteractive: async (ports, forwarded) => {
          expect(forwarded).toEqual(options);
          expect(ports.fs).toBe(fs);
          expect(ports.stdout.isTty()).toBe(true);
          expect(ports.stderr.isTty()).toBe(false);
          ports.stdout.write('stdout');
          ports.stderr.write('stderr');
          expect(typeof ports.prompt.select).toBe('function');
          throw error;
        },
      });
      expect(output).toContain('stdout');
      expect(diagnostics).toContain('stderr');
      if (error instanceof PromptCancelledError) {
        expect(output).toBe('stdout\n');
        expect(exits).toEqual([0]);
      } else {
        expect(diagnostics).toContain(formatErrorMessage('driver unavailable'));
        expect(exits).toEqual([1]);
      }
    }
  }
}
void ExplorerTerminalTests;

// ══════════════════════════════════════════════════════════════════════════════
// Graph construction
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class BuildsGraphTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerBuildsGraph')
  'buildTraceGraph assembles reqToFeatures, featureToAcs, acToTests'() {
    const g = mkGraph();
    expect(g.requirements.map((r) => r.id)).toEqual(['REQ-A', 'REQ-B']);
    expect(g.reqToFeatures.get(requirementId('REQ-A'))).toEqual(['FEAT-1', 'FEAT-2']);
    expect(g.reqToFeatures.get(requirementId('REQ-B'))).toEqual([]);
    expect(g.featureToAcs.get(featureId('FEAT-1'))!.map((a) => a.ac as string)).toEqual(['alpha', 'beta']);
    expect(g.featureToAcs.get(featureId('FEAT-2'))).toEqual([]);
    expect(g.acToTests.get('FEAT-1/alpha')).toHaveLength(2);
    expect(g.acToTests.get('FEAT-1/beta')).toBeUndefined();
    expect(g.acs).toHaveLength(2);
    expect(g.tests).toHaveLength(2);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerBuildsGraph')
  'buildTraceGraph dedupes when spec + runtime registry overlap'() {
    const g = buildTraceGraph(
      [mkReq('REQ-DUP')],
      [mkFeat('FEAT-D', ['x'], ['REQ-DUP'])],
      [],
    );
    expect(g.reqToFeatures.get(requirementId('REQ-DUP'))).toEqual(['FEAT-D']);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerBuildsGraph')
  'buildTraceGraph tolerates Features with missing satisfies[] field'() {
    // Feature without `satisfies` → `f.satisfies ?? []` fallback branch.
    const featNoSat = mkFeat('FEAT-NOSAT', ['a']); // no satisfies
    // And force the dedupe `seen.has` branch by supplying a spec-linked feature
    // that also appears in the runtime satisfiedBy index (here empty, so we use
    // two identical feature ids to trigger the seen-check on the second pass).
    const featA = mkFeat('FEAT-SAME', ['a'], ['REQ-NS']);
    const featADup = mkFeat('FEAT-SAME', ['a'], ['REQ-NS']);
    const g = buildTraceGraph(
      [mkReq('REQ-NS')],
      [featA, featADup, featNoSat],
      [],
    );
    // FEAT-SAME appears once in reqToFeatures despite two spec entries.
    const links = g.reqToFeatures.get(requirementId('REQ-NS'));
    expect(links).toEqual(['FEAT-SAME']);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerBuildsGraph')
  'readTestRegistry returns a TestRef[] view of the runtime registry'() {
    // This test file itself populates the registry via @Verifies — so the
    // registry is non-empty. We just assert shape.
    const refs = readTestRegistry();
    expect(Array.isArray(refs)).toBe(true);
    for (const r of refs) {
      expect(typeof r.feature).toBe('string');
      expect(typeof r.ac).toBe('string');
      expect(typeof r.testClass).toBe('string');
      expect(typeof r.testMethod).toBe('string');
    }
  }
}
void BuildsGraphTests;

// ══════════════════════════════════════════════════════════════════════════════
// Arrow-key navigation (SelectNode events)
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class ArrowKeyNavigationTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerHandlesArrowKeyNavigation')
  'SelectNode down advances cursor, clamped at list end'() {
    const g = mkGraph();
    let s: ExploreState = initialState();
    s = step(s, { type: 'SelectNode', delta: 1 }, g);
    expect(s.cursor).toBe(1);
    s = step(s, { type: 'SelectNode', delta: 1 }, g);
    expect(s.cursor).toBe(1); // clamped (2 reqs → max 1)
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerHandlesArrowKeyNavigation')
  'SelectNode up never goes below zero'() {
    const g = mkGraph();
    let s: ExploreState = initialState();
    s = step(s, { type: 'SelectNode', delta: -5 }, g);
    expect(s.cursor).toBe(0);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerHandlesArrowKeyNavigation')
  'SelectNode on empty list resets cursor to zero'() {
    const g = mkGraph();
    // Drill into FEAT-2 (no ACs) so the current list is empty.
    let s: ExploreState = initialState();
    s = step(s, { type: 'SelectNode', delta: 1 }, g); // cursor 1 → REQ-B (empty reqToFeatures)
    s = step(s, { type: 'DrillDown' }, g); // view=Feats, empty
    s = step(s, { type: 'SelectNode', delta: 1 }, g);
    expect(s.cursor).toBe(0);
  }
}
void ArrowKeyNavigationTests;

// ══════════════════════════════════════════════════════════════════════════════
// Drill-down
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class DrillDownTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerDrillsDownFromAnyNode')
  'DrillDown Req → Feat → Ac → Test'() {
    const g = mkGraph();
    let s = initialState();
    // cursor=0 → REQ-A
    s = step(s, { type: 'DrillDown' }, g);
    expect(s.view).toBe('ViewingFeats');
    expect(listAt(s, g)).toEqual(['FEAT-1', 'FEAT-2']);
    s = step(s, { type: 'DrillDown' }, g);
    expect(s.view).toBe('ViewingAcs');
    expect(listAt(s, g)).toEqual(['alpha', 'beta']);
    s = step(s, { type: 'DrillDown' }, g);
    expect(s.view).toBe('ViewingTests');
    expect(listAt(s, g)).toEqual(['AlphaTests.works', 'AlphaTests.alsoWorks']);
    // Leaf: further drill is a no-op
    const before = s;
    s = step(s, { type: 'DrillDown' }, g);
    expect(s).toBe(before);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerDrillsDownFromAnyNode')
  'DrillDown on empty list is a no-op'() {
    const g = mkGraph();
    let s = initialState();
    s = step(s, { type: 'SelectNode', delta: 1 }, g);
    s = step(s, { type: 'DrillDown' }, g); // ViewingFeats (empty for REQ-B)
    const before = s;
    s = step(s, { type: 'DrillDown' }, g);
    expect(s).toBe(before);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerDrillsDownFromAnyNode')
  'DrillDown Feat → Ac on Feature without ACs is a no-op'() {
    // Feature FEAT-2 has no ACs: when we land on ViewingAcs, list is empty,
    // and a second DrillDown is swallowed. The initial Feat→Ac transition is
    // valid because we pick index 0.
    const g = buildTraceGraph(
      [mkReq('REQ-X')],
      [mkFeat('FX', [], ['REQ-X'])],
      [],
    );
    let s = initialState();
    s = step(s, { type: 'DrillDown' }, g); // ViewingFeats
    s = step(s, { type: 'DrillDown' }, g); // ViewingAcs (empty)
    expect(s.view).toBe('ViewingAcs');
    expect(listAt(s, g)).toEqual([]);
    const before = s;
    s = step(s, { type: 'DrillDown' }, g);
    expect(s).toBe(before);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerDrillsDownFromAnyNode')
  'DrillDown ViewingFeats with crumb pointing at an unknown REQ returns state unchanged'() {
    // Synthetic: path references REQ-ZZZ which has no entry in reqToFeatures.
    // Exercises the `?? []` and `if (!fid)` defensive branches.
    const g = buildTraceGraph([mkReq('REQ-Z')], [], []);
    const synthetic: ExploreState = {
      view: 'ViewingFeats',
      cursor: 0,
      path: [{ kind: 'req', id: requirementId('REQ-UNKNOWN') }],
      exited: false,
    };
    const next = step(synthetic, { type: 'DrillDown' }, g);
    // Empty list → step short-circuits before the lookup, returning state.
    expect(next).toBe(synthetic);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerDrillsDownFromAnyNode')
  'DrillDown ViewingAcs with crumb pointing at unknown FEAT returns state unchanged'() {
    const g = buildTraceGraph([mkReq('REQ-U')], [mkFeat('FKNOWN', ['a'], ['REQ-U'])], []);
    const synthetic: ExploreState = {
      view: 'ViewingAcs',
      cursor: 0,
      path: [
        { kind: 'req', id: requirementId('REQ-U') },
        { kind: 'feat', id: featureId('FUNKNOWN') },
      ],
      exited: false,
    };
    const next = step(synthetic, { type: 'DrillDown' }, g);
    expect(next).toBe(synthetic);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerDrillsDownFromAnyNode')
  'DrillDown guards against cursor past end of list'() {
    // Force a state where cursor >= list.length via Back (resets cursor to 0),
    // then drill — we still land deterministically.
    const g = mkGraph();
    // Simulate: ViewingFeats with cursor=99 artificially — defensive path
    const synthetic: ExploreState = {
      view: 'ViewingReqs',
      cursor: 99,
      path: [],
      exited: false,
    };
    const next = step(synthetic, { type: 'DrillDown' }, g);
    // cursor clamped to 0 inside step → drills into REQ-A
    expect(next.view).toBe('ViewingFeats');
    expect(next.path[0]).toEqual({ kind: 'req', id: 'REQ-A' });
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerDrillsDownFromAnyNode')
  'DrillDown Ac → Tests on AC without tests produces empty Tests view'() {
    // FEAT-1.beta has no tests
    const g = mkGraph();
    let s = initialState();
    s = step(s, { type: 'DrillDown' }, g); // Feats
    s = step(s, { type: 'DrillDown' }, g); // Acs (cursor=0 → alpha)
    s = step(s, { type: 'SelectNode', delta: 1 }, g); // cursor=1 → beta
    s = step(s, { type: 'DrillDown' }, g); // Tests view, empty
    expect(s.view).toBe('ViewingTests');
    expect(listAt(s, g)).toEqual([]);
  }
}
void DrillDownTests;

// ══════════════════════════════════════════════════════════════════════════════
// Help overlay on ?
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class HelpOverlayTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerOpensHelpOverlayOnQuestionMark')
  'OpenHelp transitions to HelpOverlay and remembers previous view'() {
    const g = mkGraph();
    let s = initialState();
    s = step(s, { type: 'SelectNode', delta: 1 }, g);
    s = step(s, { type: 'OpenHelp' }, g);
    expect(s.view).toBe('HelpOverlay');
    expect(s.previousView).toBe('ViewingReqs');
    expect(s.previousCursor).toBe(1);
    expect(listAt(s, g)).toBe(HELP_LINES);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerOpensHelpOverlayOnQuestionMark')
  'OpenHelp while already in HelpOverlay is a no-op'() {
    const g = mkGraph();
    let s = step(initialState(), { type: 'OpenHelp' }, g);
    const before = s;
    s = step(s, { type: 'OpenHelp' }, g);
    expect(s).toBe(before);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerOpensHelpOverlayOnQuestionMark')
  'CloseHelp returns to previous view + cursor'() {
    const g = mkGraph();
    let s = initialState();
    s = step(s, { type: 'SelectNode', delta: 1 }, g);
    s = step(s, { type: 'OpenHelp' }, g);
    s = step(s, { type: 'CloseHelp' }, g);
    expect(s.view).toBe('ViewingReqs');
    expect(s.cursor).toBe(1);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerOpensHelpOverlayOnQuestionMark')
  'CloseHelp outside HelpOverlay is a no-op'() {
    const g = mkGraph();
    const s = initialState();
    const next = step(s, { type: 'CloseHelp' }, g);
    expect(next).toBe(s);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerOpensHelpOverlayOnQuestionMark')
  'Back inside HelpOverlay also closes it'() {
    const g = mkGraph();
    let s = step(initialState(), { type: 'OpenHelp' }, g);
    s = step(s, { type: 'Back' }, g);
    expect(s.view).toBe('ViewingReqs');
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerOpensHelpOverlayOnQuestionMark')
  'DrillDown in HelpOverlay is a no-op'() {
    const g = mkGraph();
    const s = step(initialState(), { type: 'OpenHelp' }, g);
    const next = step(s, { type: 'DrillDown' }, g);
    expect(next).toBe(s);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerOpensHelpOverlayOnQuestionMark')
  'CloseHelp falls back to ViewingReqs when no previousView recorded'() {
    const g = mkGraph();
    // Synthesise a HelpOverlay state with no previousView (defensive path).
    const synthetic: ExploreState = {
      view: 'HelpOverlay',
      cursor: 0,
      path: [],
      exited: false,
    };
    const s = step(synthetic, { type: 'CloseHelp' }, g);
    expect(s.view).toBe('ViewingReqs');
    expect(s.cursor).toBe(0);
    // Back from HelpOverlay with no previousView → same default
    const s2 = step(synthetic, { type: 'Back' }, g);
    expect(s2.view).toBe('ViewingReqs');
  }
}
void HelpOverlayTests;

// ══════════════════════════════════════════════════════════════════════════════
// Backspace — jump up
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class BackspaceTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerJumpsBackUpWithBackspace')
  'Back at each level pops one crumb'() {
    const g = mkGraph();
    let s = initialState();
    s = step(s, { type: 'DrillDown' }, g); // Feats
    s = step(s, { type: 'DrillDown' }, g); // Acs
    s = step(s, { type: 'DrillDown' }, g); // Tests
    expect(s.view).toBe('ViewingTests');
    s = step(s, { type: 'Back' }, g);
    expect(s.view).toBe('ViewingAcs');
    s = step(s, { type: 'Back' }, g);
    expect(s.view).toBe('ViewingFeats');
    s = step(s, { type: 'Back' }, g);
    expect(s.view).toBe('ViewingReqs');
    // Back at root is a no-op
    const before = s;
    s = step(s, { type: 'Back' }, g);
    expect(s).toBe(before);
  }
}
void BackspaceTests;

// ══════════════════════════════════════════════════════════════════════════════
// Exit
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class ExitTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerExitsCleanlyOnCtrlC')
  'Exit sets exited=true and further events become no-ops'() {
    const g = mkGraph();
    let s = step(initialState(), { type: 'Exit' }, g);
    expect(s.exited).toBe(true);
    const before = s;
    s = step(s, { type: 'SelectNode', delta: 1 }, g);
    expect(s).toBe(before);
    s = step(s, { type: 'DrillDown' }, g);
    expect(s).toBe(before);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerExitsCleanlyOnCtrlC')
  'keyToEvent maps q and ctrl+c to Exit'() {
    expect(keyToEvent('q')).toEqual({ type: 'Exit' });
    expect(keyToEvent('ctrl+c')).toEqual({ type: 'Exit' });
    expect(keyToEvent('C-c')).toEqual({ type: 'Exit' });
  }
}
void ExitTests;

// ══════════════════════════════════════════════════════════════════════════════
// Non-TTY refusal — shell-layer concern, but the check is plain
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class NonTtyRefusalTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerRefusesToStartOnNonTty')
  async 'runExploreCli exits 1 with a clear message when stdout is not a TTY'() {
    let exitCode: number | undefined;
    let errMsg = '';
    await runExploreCli(
      { featuresDir: '/x', requirementsDir: '/y' },
      {
        fs: mkFs({}, {}),
        stdout: { write() {}, isTTY: false },
        stderr: { write(s: string) { errMsg += s; } },
        exit(code: number) { exitCode = code; },
      },
    );
    expect(exitCode).toBe(1);
    expect(errMsg).toMatch(/TTY/);
  }
}
void NonTtyRefusalTests;

// ══════════════════════════════════════════════════════════════════════════════
// FileSystem port usage for discovery
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class FileSystemPortTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerUsesFileSystemPortForDiscovery')
  async 'loadSpecsViaFileSystem reads spec.json files via the port only'() {
    const reqSpec = JSON.stringify(mkReq('REQ-FS'));
    const featSpec = JSON.stringify(mkFeat('FF', ['a'], ['REQ-FS']));
    const fs = mkFs(
      {
        '/reqs/req-a.spec.json': reqSpec,
        '/reqs/not-a-spec.txt': 'ignored',
        '/reqs/malformed.spec.json': '{not json',
        '/feats/f.spec.json': featSpec,
      },
      {
        '/reqs': ['req-a.spec.json', 'not-a-spec.txt', 'malformed.spec.json'],
        '/feats': ['f.spec.json'],
      },
    );
    const { features, requirements } = await loadSpecsViaFileSystem(fs, '/feats', '/reqs');
    expect(requirements.map((r) => r.id)).toEqual(['REQ-FS']);
    expect(features.map((f) => f.id)).toEqual(['FF']);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerUsesFileSystemPortForDiscovery')
  async 'loadSpecsViaFileSystem returns empty when a directory is absent'() {
    const fs = mkFs({}, {}); // readdir throws for any dir
    const out = await loadSpecsViaFileSystem(fs, '/missing/feats', '/missing/reqs');
    expect(out.features).toEqual([]);
    expect(out.requirements).toEqual([]);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerUsesFileSystemPortForDiscovery')
  async 'loadSpecsViaFileSystem filters specs whose kind does not match the dir'() {
    // A requirement.spec.json mislabeled under featuresDir should be dropped.
    const reqInFeatsDir = JSON.stringify(mkReq('REQ-MIX'));
    const fs = mkFs(
      { '/feats/req-mix.spec.json': reqInFeatsDir },
      { '/feats': ['req-mix.spec.json'] },
    );
    const { features } = await loadSpecsViaFileSystem(fs, '/feats', '/nowhere');
    expect(features).toEqual([]);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerUsesFileSystemPortForDiscovery')
  async 'loadSpecsViaFileSystem handles trailing-slash directories'() {
    const featSpec = JSON.stringify(mkFeat('FS', ['x']));
    const fs = mkFs(
      { '/feats/f.spec.json': featSpec },
      { '/feats/': ['f.spec.json'] },
    );
    const { features } = await loadSpecsViaFileSystem(fs, '/feats/', '/nowhere');
    expect(features.map((f) => f.id)).toEqual(['FS']);
  }
}
void FileSystemPortTests;

// ══════════════════════════════════════════════════════════════════════════════
// Prompt port wiring
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class PromptPortTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerUsesPromptPortForInteraction')
  async 'runExploreInteractive drives state via the injected Prompt port only'() {
    // Script: down, enter, ?, escape/backspace... q
    const prompt = mkPrompt(['down', 'enter', '?', 'backspace', 'q']);
    const reqSpec = JSON.stringify(mkReq('REQ-P'));
    const featSpec = JSON.stringify(mkFeat('FP', ['a'], ['REQ-P']));
    const fs = mkFs(
      {
        '/reqs/r.spec.json': reqSpec,
        '/feats/f.spec.json': featSpec,
      },
      { '/reqs': ['r.spec.json'], '/feats': ['f.spec.json'] },
    );
    let output = '';
    await runExploreInteractive(
      {
        fs,
        stdout: { write(s: string) { output += s; }, isTty: () => true },
        stderr: { write() {}, isTty: () => false },
        prompt,
      },
      { featuresDir: '/feats', requirementsDir: '/reqs' },
    );
    // We rendered at least one view and exited cleanly.
    expect(output).toMatch(/Requirements/);
    expect(output).toMatch(/bye\./);
  }
}
void PromptPortTests;

// ══════════════════════════════════════════════════════════════════════════════
// End-to-end navigation REQ → FEAT → AC → TEST
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class EndToEndTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('endToEndNavigatesReqToFeatToAcToTest')
  'Drill REQ-A → FEAT-1 → alpha → AlphaTests, then Back all the way'() {
    const g = mkGraph();
    let s = initialState();

    expect(listAt(s, g)).toEqual(['REQ-A', 'REQ-B']);
    expect(viewTitle(s)).toBe('Requirements');

    s = step(s, { type: 'DrillDown' }, g);
    expect(listAt(s, g)).toEqual(['FEAT-1', 'FEAT-2']);
    expect(viewTitle(s)).toContain('REQ-A');

    s = step(s, { type: 'DrillDown' }, g);
    expect(listAt(s, g)).toEqual(['alpha', 'beta']);
    expect(viewTitle(s)).toContain('FEAT-1');

    s = step(s, { type: 'DrillDown' }, g);
    expect(listAt(s, g)).toEqual(['AlphaTests.works', 'AlphaTests.alsoWorks']);
    expect(viewTitle(s)).toContain('FEAT-1.alpha');

    // Now walk all the way back.
    s = step(s, { type: 'Back' }, g);
    expect(s.view).toBe('ViewingAcs');
    s = step(s, { type: 'Back' }, g);
    expect(s.view).toBe('ViewingFeats');
    s = step(s, { type: 'Back' }, g);
    expect(s.view).toBe('ViewingReqs');
    expect(s.path).toEqual([]);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('endToEndNavigatesReqToFeatToAcToTest')
  'viewTitle produces a meaningful label for every view including HelpOverlay'() {
    const g = mkGraph();
    let s = initialState();
    expect(viewTitle(s)).toBe('Requirements');
    s = step(s, { type: 'OpenHelp' }, g);
    expect(viewTitle(s)).toMatch(/Help/);
  }
}
void EndToEndTests;

// ══════════════════════════════════════════════════════════════════════════════
// Keybinding matrix — ensures every lazygit-style key maps
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class KeybindingsTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerHandlesArrowKeyNavigation')
  'keyToEvent maps j/k and arrow keys to SelectNode'() {
    expect(keyToEvent('j')).toEqual({ type: 'SelectNode', delta: 1 });
    expect(keyToEvent('down')).toEqual({ type: 'SelectNode', delta: 1 });
    expect(keyToEvent('ArrowDown')).toEqual({ type: 'SelectNode', delta: 1 });
    expect(keyToEvent('k')).toEqual({ type: 'SelectNode', delta: -1 });
    expect(keyToEvent('up')).toEqual({ type: 'SelectNode', delta: -1 });
    expect(keyToEvent('ArrowUp')).toEqual({ type: 'SelectNode', delta: -1 });
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerDrillsDownFromAnyNode')
  'keyToEvent maps l/right/enter to DrillDown'() {
    expect(keyToEvent('l')).toEqual({ type: 'DrillDown' });
    expect(keyToEvent('right')).toEqual({ type: 'DrillDown' });
    expect(keyToEvent('ArrowRight')).toEqual({ type: 'DrillDown' });
    expect(keyToEvent('return')).toEqual({ type: 'DrillDown' });
    expect(keyToEvent('enter')).toEqual({ type: 'DrillDown' });
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerJumpsBackUpWithBackspace')
  'keyToEvent maps h/left/backspace to Back'() {
    expect(keyToEvent('h')).toEqual({ type: 'Back' });
    expect(keyToEvent('left')).toEqual({ type: 'Back' });
    expect(keyToEvent('ArrowLeft')).toEqual({ type: 'Back' });
    expect(keyToEvent('backspace')).toEqual({ type: 'Back' });
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerOpensHelpOverlayOnQuestionMark')
  'keyToEvent maps ? and escape to help toggles'() {
    expect(keyToEvent('?')).toEqual({ type: 'OpenHelp' });
    expect(keyToEvent('escape')).toEqual({ type: 'CloseHelp' });
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerHandlesArrowKeyNavigation')
  'keyToEvent returns null for unmapped keys'() {
    expect(keyToEvent('x')).toBe(null);
    expect(keyToEvent('')).toBe(null);
  }
}
void KeybindingsTests;

// ══════════════════════════════════════════════════════════════════════════════
// Render primitives — pure data + templates extracted from explore-shell into
// explore-core, so the shell stays plumbing-only.
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class RenderPrimitivesTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerKeyChoicesIncludeAllNavigationActions')
  'KEY_CHOICES exposes the six navigation actions in display order, each with a non-empty label'() {
    const choices = KEY_CHOICES as readonly PromptChoice<string>[];
    expect(choices.map((c) => c.value)).toEqual([
      'down', 'up', 'enter', 'backspace', '?', 'q',
    ]);
    for (const c of choices) {
      expect(c.label.length).toBeGreaterThan(0);
    }
    // Every value must be routable through keyToEvent (no dead menu entries).
    for (const c of choices) {
      expect(keyToEvent(c.value)).not.toBe(null);
    }
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerEmptyStateRendersHelpfulMessage')
  'EMPTY_LINE is a single indented line ending with a newline and contains the word "empty"'() {
    expect(EMPTY_LINE).toBe('  (empty)\n');
    expect(EMPTY_LINE.endsWith('\n')).toBe(true);
    expect(EMPTY_LINE.startsWith('  ')).toBe(true);
    expect(EMPTY_LINE).toMatch(/empty/i);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerCursorMarkerHighlightsActiveLine')
  'renderListLine emits the cursor glyph only for the active line'() {
    const active = renderListLine('item A', true);
    const inactive = renderListLine('item B', false);
    expect(active).toBe('  › item A\n');
    expect(inactive).toBe('    item B\n');
    expect(active).not.toBe(inactive);
    // Active and inactive renderings differ ONLY in the cursor column.
    expect(active.replace('›', ' ').replace('item A', 'item B')).toBe(inactive);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerActionPromptPluralizesItemCount')
  'formatActionPrompt uses singular for 1 and plural for 0/2/N'() {
    expect(formatActionPrompt(0)).toBe('(0 items) — action?');
    expect(formatActionPrompt(1)).toBe('(1 item) — action?');
    expect(formatActionPrompt(2)).toBe('(2 items) — action?');
    expect(formatActionPrompt(42)).toBe('(42 items) — action?');
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerErrorMessagePrefixesWithCommandName')
  'formatErrorMessage prefixes with "requirements explore:" and ends with newline'() {
    expect(formatErrorMessage('boom')).toBe('requirements explore: boom\n');
    expect(formatErrorMessage('')).toBe('requirements explore: \n');
    // Multi-line errors keep their internal newlines intact and still end with \n.
    const out = formatErrorMessage('line one\nline two');
    expect(out.startsWith('requirements explore: ')).toBe(true);
    expect(out.endsWith('\n')).toBe(true);
  }
}
void RenderPrimitivesTests;
