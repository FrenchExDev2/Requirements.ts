/**
 * explore-core tests — pure FSM + graph-builder for `requirements explore`.
 * Every assertion is bound to an AC of FeatureTraceExplorerTuiFeature via
 * @FeatureTest / @Verifies. TTY-only ACs (refusesToStartOnNonTty,
 * usesPromptPortForInteraction, exitsCleanlyOnCtrlC at the SIGINT-wiring level)
 * are covered by explore-shell tests in @frenchexdev2/requirements package.
 */

import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { FeatureTraceExplorerTuiFeature } from '@frenchexdev2/requirements-requirements';
import {
  buildTraceGraph,
  initialState,
  keyToEvent,
  listAt,
  loadSpecsViaFileSystem,
  readTestRegistry,
  step,
  viewTitle,
  CURSOR_ACTIVE,
  CURSOR_INACTIVE,
  EMPTY_LINE,
  EXIT_MESSAGE,
  HELP_LINES,
  KEY_CHOICES,
  TTY_REQUIRED_MSG,
  formatActionPrompt,
  formatErrorMessage,
  renderHeader,
  renderListLine,
  type TestRef,
  type ExploreState,
  type ExploreCrumb,
} from '@frenchexdev2/requirements-core/explore-core';
import type { FileSystem } from '@frenchexdev2/requirements-core/ports';
import type { FeatureSpec, RequirementSpec } from '@frenchexdev2/requirements-core/types';

// ── Fixtures ────────────────────────────────────────────────────────────────

const MINIMAL_STATEMENT = { pattern: 'ubiquitous' as const, response: 'x' as any };
const MINIMAL_RATIONALE = { claim: 'x' as any, kind: 'precedent' as const, evidence: [] };
const MINIMAL_SOURCE = { type: 'stakeholder' as const, role: 'r' };
const MINIMAL_RISK = { level: 'Low' as const, ifNotMet: 'x' as any };

function mkFeatureSpec(
  id: string,
  satisfies: readonly string[] = [],
  acs: readonly string[] = [],
): FeatureSpec {
  return {
    $schemaVersion: '1.0.0' as any,
    $schema: './feature-spec.schema.json',
    kind: 'feature',
    id: id as any,
    title: `feat ${id}`,
    priority: 'Medium' as any,
    satisfies: satisfies as any,
    acs: acs.map((name) => ({ name: name as any, expects: ['unit' as any] })),
  } as unknown as FeatureSpec;
}

function mkRequirementSpec(id: string): RequirementSpec {
  return {
    $schemaVersion: '1.0.0' as any,
    $schema: './requirement-spec.schema.json',
    kind: 'requirement',
    id: id as any,
    title: `req ${id}`,
    requirementKind: 'Functional' as any,
    priority: 'Medium' as any,
    status: 'Approved',
    statement: MINIMAL_STATEMENT,
    rationale: MINIMAL_RATIONALE,
    source: MINIMAL_SOURCE,
    risk: MINIMAL_RISK,
    verificationMethod: 'Test' as any,
    fitCriteria: [],
    satisfiedBy: [],
  } as unknown as RequirementSpec;
}

function mkTest(feature: string, ac: string, klass = 'Tests', method = 't'): TestRef {
  return {
    feature: feature as any,
    ac: ac as any,
    testClass: klass,
    testMethod: method,
  };
}

// A small but exhaustive trace: REQ-1 ← F1{acA, acB}, REQ-2 ← F2{acC}; tests on acA + acC.
function mkGraph() {
  const reqs = [mkRequirementSpec('REQ-1'), mkRequirementSpec('REQ-2')];
  const feats = [
    mkFeatureSpec('F1', ['REQ-1'], ['acA', 'acB']),
    mkFeatureSpec('F2', ['REQ-2'], ['acC']),
  ];
  const tests = [
    mkTest('F1', 'acA', 'F1Tests', 'verifiesAcA'),
    mkTest('F2', 'acC', 'F2Tests', 'verifiesAcC'),
  ];
  return buildTraceGraph(reqs, feats, tests);
}

// ── In-memory FileSystem port ──────────────────────────────────────────────

function mkFs(seed: Record<string, string>): FileSystem {
  const files = new Map(Object.entries(seed));
  return {
    readFile: async (p: string) => {
      const f = files.get(p);
      if (f === undefined) throw new Error(`ENOENT ${p}`);
      return f;
    },
    writeFile: async () => {},
    exists: async (p: string) => files.has(p),
    mkdir: async () => {},
    readdir: async (p: string) => {
      const prefix = p.endsWith('/') ? p : p + '/';
      const names = new Set<string>();
      for (const k of files.keys()) {
        if (k.startsWith(prefix)) names.add(k.slice(prefix.length).split('/')[0]!);
      }
      return [...names];
    },
    stat: async () => ({ mtimeMs: 0, isDirectory: () => false, size: 0 }),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Graph construction
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class GraphBuildingTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerBuildsGraph')
  'buildTraceGraph indexes reqs→features via spec.satisfies'() {
    const g = mkGraph();
    expect(g.requirements).toHaveLength(2);
    expect(g.features).toHaveLength(2);
    expect(g.reqToFeatures.get('REQ-1' as any)).toEqual(['F1']);
    expect(g.reqToFeatures.get('REQ-2' as any)).toEqual(['F2']);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerBuildsGraph')
  'buildTraceGraph indexes feature→ACs preserving order'() {
    const g = mkGraph();
    const acs = g.featureToAcs.get('F1' as any)!;
    expect(acs.map((a) => a.ac)).toEqual(['acA', 'acB']);
    expect(g.acs).toHaveLength(3);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerBuildsGraph')
  'buildTraceGraph keys acToTests as "<featureId>/<acName>"'() {
    const g = mkGraph();
    expect(g.acToTests.get('F1/acA')).toHaveLength(1);
    expect(g.acToTests.get('F2/acC')).toHaveLength(1);
    expect(g.acToTests.get('F1/acB')).toBeUndefined();
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerBuildsGraph')
  'buildTraceGraph merges runtime @Satisfies registry without duplicating spec links'() {
    const reqs = [mkRequirementSpec('REQ-X')];
    const feats = [mkFeatureSpec('FX', ['REQ-X'], [])];
    const runtimeIdx = new Map([
      ['REQ-X' as any, ['FX' as any, 'FY' as any]] as const,
    ]);
    const g = buildTraceGraph(reqs, feats, [], runtimeIdx as any);
    expect(g.reqToFeatures.get('REQ-X' as any)).toEqual(['FX', 'FY']);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerBuildsGraph')
  'buildTraceGraph defaults satisfiedBy to empty map when omitted'() {
    const reqs = [mkRequirementSpec('REQ-LONELY')];
    const g = buildTraceGraph(reqs, [], []);
    expect(g.reqToFeatures.get('REQ-LONELY' as any)).toEqual([]);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerBuildsGraph')
  'buildTraceGraph treats a feature with no satisfies[] as linking to no requirement'() {
    const reqs = [mkRequirementSpec('REQ-1')];
    const featNoSatisfies = { ...mkFeatureSpec('FX', [], []), satisfies: undefined } as unknown as FeatureSpec;
    const g = buildTraceGraph(reqs, [featNoSatisfies], []);
    expect(g.reqToFeatures.get('REQ-1' as any)).toEqual([]);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerBuildsGraph')
  'buildTraceGraph dedupes when the same feature id appears in spec and runtime links'() {
    const reqs = [mkRequirementSpec('REQ-DUP')];
    const feats = [mkFeatureSpec('F-DUP', ['REQ-DUP'], [])];
    const runtimeIdx = new Map([['REQ-DUP' as any, ['F-DUP' as any]] as const]);
    const g = buildTraceGraph(reqs, feats, [], runtimeIdx as any);
    expect(g.reqToFeatures.get('REQ-DUP' as any)).toEqual(['F-DUP']);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Test-registry snapshot
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class TestRegistrySnapshotTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerBuildsGraph')
  'readTestRegistry returns an array snapshot of @Verifies-registered tests'() {
    const snap = readTestRegistry();
    expect(Array.isArray(snap)).toBe(true);
    // The current test file registers @Verifies refs — snapshot must surface them.
    expect(snap.length).toBeGreaterThan(0);
    for (const t of snap) {
      expect(typeof t.feature).toBe('string');
      expect(typeof t.ac).toBe('string');
      expect(typeof t.testClass).toBe('string');
      expect(typeof t.testMethod).toBe('string');
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Keybinding → event dispatch
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class KeybindingTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerHandlesArrowKeyNavigation')
  'down / j / ArrowDown all dispatch SelectNode(+1)'() {
    for (const k of ['j', 'down', 'ArrowDown']) {
      expect(keyToEvent(k)).toEqual({ type: 'SelectNode', delta: 1 });
    }
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerHandlesArrowKeyNavigation')
  'up / k / ArrowUp all dispatch SelectNode(-1)'() {
    for (const k of ['k', 'up', 'ArrowUp']) {
      expect(keyToEvent(k)).toEqual({ type: 'SelectNode', delta: -1 });
    }
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerDrillsDownFromAnyNode')
  'l / right / ArrowRight / return / enter all dispatch DrillDown'() {
    for (const k of ['l', 'right', 'ArrowRight', 'return', 'enter']) {
      expect(keyToEvent(k)).toEqual({ type: 'DrillDown' });
    }
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerJumpsBackUpWithBackspace')
  'h / left / ArrowLeft / backspace all dispatch Back'() {
    for (const k of ['h', 'left', 'ArrowLeft', 'backspace']) {
      expect(keyToEvent(k)).toEqual({ type: 'Back' });
    }
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerOpensHelpOverlayOnQuestionMark')
  '? dispatches OpenHelp and escape dispatches CloseHelp'() {
    expect(keyToEvent('?')).toEqual({ type: 'OpenHelp' });
    expect(keyToEvent('escape')).toEqual({ type: 'CloseHelp' });
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerExitsCleanlyOnCtrlC')
  'q / ctrl+c / C-c all dispatch Exit'() {
    for (const k of ['q', 'ctrl+c', 'C-c']) {
      expect(keyToEvent(k)).toEqual({ type: 'Exit' });
    }
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerHandlesArrowKeyNavigation')
  'unmapped keys return null'() {
    expect(keyToEvent('x')).toBeNull();
    expect(keyToEvent('')).toBeNull();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// FSM transitions
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class FsmTransitionTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerBuildsGraph')
  'initialState is ViewingReqs with cursor 0 and empty path'() {
    const s = initialState();
    expect(s.view).toBe('ViewingReqs');
    expect(s.cursor).toBe(0);
    expect(s.path).toEqual([]);
    expect(s.exited).toBe(false);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerHandlesArrowKeyNavigation')
  'SelectNode(+1) advances cursor and clamps at the last index'() {
    const g = mkGraph();
    let s: ExploreState = initialState();
    s = step(s, { type: 'SelectNode', delta: 1 }, g);
    expect(s.cursor).toBe(1);
    s = step(s, { type: 'SelectNode', delta: 99 }, g);
    expect(s.cursor).toBe(g.requirements.length - 1);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerHandlesArrowKeyNavigation')
  'SelectNode(-1) clamps cursor to 0 when at the top'() {
    const g = mkGraph();
    let s: ExploreState = initialState();
    s = step(s, { type: 'SelectNode', delta: -5 }, g);
    expect(s.cursor).toBe(0);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerHandlesArrowKeyNavigation')
  'SelectNode on an empty list resets cursor to 0'() {
    const g = buildTraceGraph([], [], []);
    let s: ExploreState = initialState();
    s = step(s, { type: 'SelectNode', delta: 3 }, g);
    expect(s.cursor).toBe(0);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerDrillsDownFromAnyNode')
  'DrillDown from ViewingReqs lands in ViewingFeats with the chosen req in path'() {
    const g = mkGraph();
    let s = initialState();
    s = step(s, { type: 'DrillDown' }, g);
    expect(s.view).toBe('ViewingFeats');
    expect(s.path).toHaveLength(1);
    expect(s.path[0]).toEqual({ kind: 'req', id: 'REQ-1' });
    expect(s.cursor).toBe(0);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerDrillsDownFromAnyNode')
  'DrillDown from ViewingFeats lands in ViewingAcs'() {
    const g = mkGraph();
    let s = initialState();
    s = step(s, { type: 'DrillDown' }, g);
    s = step(s, { type: 'DrillDown' }, g);
    expect(s.view).toBe('ViewingAcs');
    expect(s.path[s.path.length - 1]).toEqual({ kind: 'feat', id: 'F1' });
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerDrillsDownFromAnyNode')
  'DrillDown from ViewingAcs lands in ViewingTests'() {
    const g = mkGraph();
    let s = initialState();
    s = step(s, { type: 'DrillDown' }, g);
    s = step(s, { type: 'DrillDown' }, g);
    s = step(s, { type: 'DrillDown' }, g);
    expect(s.view).toBe('ViewingTests');
    const tail = s.path[s.path.length - 1] as { kind: 'ac'; feature: string; ac: string };
    expect(tail.kind).toBe('ac');
    expect(tail.feature).toBe('F1');
    expect(tail.ac).toBe('acA');
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerDrillsDownFromAnyNode')
  'DrillDown at ViewingTests (leaf) is a no-op'() {
    const g = mkGraph();
    let s = initialState();
    s = step(s, { type: 'DrillDown' }, g);
    s = step(s, { type: 'DrillDown' }, g);
    s = step(s, { type: 'DrillDown' }, g);
    const leaf = s;
    s = step(s, { type: 'DrillDown' }, g);
    expect(s).toBe(leaf);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerDrillsDownFromAnyNode')
  'DrillDown on an empty list does not change state'() {
    const g = buildTraceGraph([], [], []);
    const s0 = initialState();
    const s1 = step(s0, { type: 'DrillDown' }, g);
    expect(s1).toBe(s0);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerJumpsBackUpWithBackspace')
  'Back from ViewingTests returns to ViewingAcs / Feats / Reqs in order'() {
    const g = mkGraph();
    let s = initialState();
    s = step(s, { type: 'DrillDown' }, g);
    s = step(s, { type: 'DrillDown' }, g);
    s = step(s, { type: 'DrillDown' }, g);
    expect(s.view).toBe('ViewingTests');
    s = step(s, { type: 'Back' }, g);
    expect(s.view).toBe('ViewingAcs');
    s = step(s, { type: 'Back' }, g);
    expect(s.view).toBe('ViewingFeats');
    s = step(s, { type: 'Back' }, g);
    expect(s.view).toBe('ViewingReqs');
    expect(s.path).toEqual([]);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerJumpsBackUpWithBackspace')
  'Back at the root (empty path) is a no-op'() {
    const g = mkGraph();
    const s0 = initialState();
    const s1 = step(s0, { type: 'Back' }, g);
    expect(s1).toBe(s0);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerOpensHelpOverlayOnQuestionMark')
  'OpenHelp enters HelpOverlay and remembers prior view/cursor'() {
    const g = mkGraph();
    let s = initialState();
    s = step(s, { type: 'SelectNode', delta: 1 }, g);
    s = step(s, { type: 'OpenHelp' }, g);
    expect(s.view).toBe('HelpOverlay');
    expect(s.previousView).toBe('ViewingReqs');
    expect(s.previousCursor).toBe(1);
    expect(s.cursor).toBe(0);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerOpensHelpOverlayOnQuestionMark')
  'OpenHelp while already in HelpOverlay is a no-op'() {
    const g = mkGraph();
    let s = step(initialState(), { type: 'OpenHelp' }, g);
    const s2 = step(s, { type: 'OpenHelp' }, g);
    expect(s2).toBe(s);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerOpensHelpOverlayOnQuestionMark')
  'CloseHelp restores the prior view + cursor'() {
    const g = mkGraph();
    let s = initialState();
    s = step(s, { type: 'SelectNode', delta: 1 }, g);
    s = step(s, { type: 'OpenHelp' }, g);
    s = step(s, { type: 'CloseHelp' }, g);
    expect(s.view).toBe('ViewingReqs');
    expect(s.cursor).toBe(1);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerOpensHelpOverlayOnQuestionMark')
  'CloseHelp outside of HelpOverlay is a no-op'() {
    const g = mkGraph();
    const s0 = initialState();
    const s1 = step(s0, { type: 'CloseHelp' }, g);
    expect(s1).toBe(s0);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerOpensHelpOverlayOnQuestionMark')
  'CloseHelp falls back to ViewingReqs / cursor 0 when no previous view was recorded'() {
    const g = mkGraph();
    const orphanHelp: ExploreState = {
      view: 'HelpOverlay',
      cursor: 0,
      path: [],
      exited: false,
    };
    const after = step(orphanHelp, { type: 'CloseHelp' }, g);
    expect(after.view).toBe('ViewingReqs');
    expect(after.cursor).toBe(0);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerJumpsBackUpWithBackspace')
  'Back from HelpOverlay restores prior view'() {
    const g = mkGraph();
    let s = step(initialState(), { type: 'OpenHelp' }, g);
    s = step(s, { type: 'Back' }, g);
    expect(s.view).toBe('ViewingReqs');
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerExitsCleanlyOnCtrlC')
  'Exit marks state.exited and freezes subsequent transitions'() {
    const g = mkGraph();
    let s = step(initialState(), { type: 'Exit' }, g);
    expect(s.exited).toBe(true);
    const s2 = step(s, { type: 'DrillDown' }, g);
    expect(s2).toBe(s);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerDrillsDownFromAnyNode')
  'DrillDown while HelpOverlay is open is a no-op'() {
    const g = mkGraph();
    const help = step(initialState(), { type: 'OpenHelp' }, g);
    const after = step(help, { type: 'DrillDown' }, g);
    expect(after).toBe(help);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerHandlesArrowKeyNavigation')
  'DrillDown re-selects index 0 when cursor exceeds the current list length'() {
    const g = mkGraph();
    const s: ExploreState = { ...initialState(), cursor: 99 };
    const after = step(s, { type: 'DrillDown' }, g);
    expect(after.view).toBe('ViewingFeats');
    expect(after.path[0]).toEqual({ kind: 'req', id: 'REQ-1' });
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerJumpsBackUpWithBackspace')
  'Back from HelpOverlay falls back to ViewingReqs when no previous view was recorded'() {
    const g = mkGraph();
    const orphanHelp: ExploreState = {
      view: 'HelpOverlay',
      cursor: 0,
      path: [],
      exited: false,
    };
    const after = step(orphanHelp, { type: 'Back' }, g);
    expect(after.view).toBe('ViewingReqs');
    expect(after.cursor).toBe(0);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// listAt projection + viewTitle
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class ProjectionTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerBuildsGraph')
  'listAt returns requirement ids at root'() {
    const g = mkGraph();
    expect(listAt(initialState(), g)).toEqual(['REQ-1', 'REQ-2']);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerBuildsGraph')
  'listAt returns feature ids after drilling into a requirement'() {
    const g = mkGraph();
    let s = step(initialState(), { type: 'DrillDown' }, g);
    expect(listAt(s, g)).toEqual(['F1']);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerBuildsGraph')
  'listAt returns ac names after drilling into a feature'() {
    const g = mkGraph();
    let s = step(initialState(), { type: 'DrillDown' }, g);
    s = step(s, { type: 'DrillDown' }, g);
    expect(listAt(s, g)).toEqual(['acA', 'acB']);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerBuildsGraph')
  'listAt returns test labels after drilling into an ac'() {
    const g = mkGraph();
    let s = step(initialState(), { type: 'DrillDown' }, g);
    s = step(s, { type: 'DrillDown' }, g);
    s = step(s, { type: 'DrillDown' }, g);
    expect(listAt(s, g)).toEqual(['F1Tests.verifiesAcA']);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerOpensHelpOverlayOnQuestionMark')
  'listAt in HelpOverlay returns HELP_LINES verbatim'() {
    const g = mkGraph();
    const s = step(initialState(), { type: 'OpenHelp' }, g);
    expect(listAt(s, g)).toBe(HELP_LINES);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerBuildsGraph')
  'viewTitle reflects the current view and crumb'() {
    const g = mkGraph();
    let s = initialState();
    expect(viewTitle(s)).toBe('Requirements');
    s = step(s, { type: 'DrillDown' }, g);
    expect(viewTitle(s)).toBe('Features satisfying REQ-1');
    s = step(s, { type: 'DrillDown' }, g);
    expect(viewTitle(s)).toBe('ACs of F1');
    s = step(s, { type: 'DrillDown' }, g);
    expect(viewTitle(s)).toBe('Tests verifying F1.acA');
    s = step(s, { type: 'OpenHelp' }, g);
    expect(viewTitle(s)).toBe('Help — keybindings');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Discovery via FileSystem port
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class DiscoveryTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerUsesFileSystemPortForDiscovery')
  'loadSpecsViaFileSystem reads features + requirements via the fs port'() {
    const fs = mkFs({
      'features/f.spec.json': JSON.stringify(mkFeatureSpec('F1', ['REQ-1'], ['acA'])),
      'requirements/r.spec.json': JSON.stringify(mkRequirementSpec('REQ-1')),
    });
    return loadSpecsViaFileSystem(fs, 'features', 'requirements').then((out) => {
      expect(out.features).toHaveLength(1);
      expect(out.features[0]!.id).toBe('F1');
      expect(out.requirements).toHaveLength(1);
      expect(out.requirements[0]!.id).toBe('REQ-1');
    });
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerUsesFileSystemPortForDiscovery')
  'loadSpecsViaFileSystem returns empty arrays when the directories do not exist'() {
    const fs = mkFs({});
    return loadSpecsViaFileSystem(fs, 'no/feats', 'no/reqs').then((out) => {
      expect(out.features).toEqual([]);
      expect(out.requirements).toEqual([]);
    });
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerUsesFileSystemPortForDiscovery')
  'loadSpecsViaFileSystem swallows fs.readdir errors and returns []'() {
    const fs: FileSystem = {
      readFile: async () => '',
      writeFile: async () => {},
      exists: async () => false,
      mkdir: async () => {},
      readdir: async () => { throw new Error('readdir EACCES'); },
      stat: async () => ({ mtimeMs: 0, isDirectory: () => false, size: 0 }),
    };
    return loadSpecsViaFileSystem(fs, 'features', 'requirements').then((out) => {
      expect(out.features).toEqual([]);
      expect(out.requirements).toEqual([]);
    });
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerUsesFileSystemPortForDiscovery')
  'loadSpecsViaFileSystem ignores non-spec.json entries and malformed JSON'() {
    const fs = mkFs({
      'features/f.spec.json': JSON.stringify(mkFeatureSpec('F1', [], [])),
      'features/notes.md': '# ignored',
      'features/broken.spec.json': '{not json',
    });
    return loadSpecsViaFileSystem(fs, 'features', 'requirements').then((out) => {
      expect(out.features).toHaveLength(1);
      expect(out.features[0]!.id).toBe('F1');
    });
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerUsesFileSystemPortForDiscovery')
  'loadSpecsViaFileSystem ignores spec.json blobs whose kind does not match the requested dir'() {
    const fs = mkFs({
      // requirement spec mistakenly placed under features/ — must be filtered out
      'features/cross.spec.json': JSON.stringify(mkRequirementSpec('REQ-X')),
    });
    return loadSpecsViaFileSystem(fs, 'features', 'requirements').then((out) => {
      expect(out.features).toEqual([]);
    });
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerUsesFileSystemPortForDiscovery')
  'loadSpecsViaFileSystem accepts a featuresDir with trailing slash'() {
    const fs = mkFs({
      'features/f.spec.json': JSON.stringify(mkFeatureSpec('F1', [], [])),
    });
    return loadSpecsViaFileSystem(fs, 'features/', 'requirements').then((out) => {
      expect(out.features).toHaveLength(1);
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// End-to-end navigation
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class EndToEndTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('endToEndNavigatesReqToFeatToAcToTest')
  'walk: req → feat → ac → test surfaces the expected test label'() {
    const g = mkGraph();
    let s = initialState();
    expect(listAt(s, g)).toEqual(['REQ-1', 'REQ-2']);
    s = step(s, { type: 'SelectNode', delta: 1 }, g);   // REQ-2
    s = step(s, { type: 'DrillDown' }, g);
    expect(listAt(s, g)).toEqual(['F2']);
    s = step(s, { type: 'DrillDown' }, g);
    expect(listAt(s, g)).toEqual(['acC']);
    s = step(s, { type: 'DrillDown' }, g);
    expect(listAt(s, g)).toEqual(['F2Tests.verifiesAcC']);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Render primitives + constants
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureTraceExplorerTuiFeature)
class RenderPrimitiveTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerKeyChoicesIncludeAllNavigationActions')
  'KEY_CHOICES includes every navigation action (down/up/enter/backspace/?/q)'() {
    const values = KEY_CHOICES.map((c) => c.value);
    for (const need of ['down', 'up', 'enter', 'backspace', '?', 'q']) {
      expect(values).toContain(need);
    }
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerEmptyStateRendersHelpfulMessage')
  'EMPTY_LINE renders a parenthesised "(empty)" marker'() {
    expect(EMPTY_LINE).toMatch(/\(empty\)/);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerCursorMarkerHighlightsActiveLine')
  'renderListLine uses CURSOR_ACTIVE for the selected row and CURSOR_INACTIVE otherwise'() {
    const active = renderListLine('REQ-1', true);
    const inactive = renderListLine('REQ-1', false);
    expect(active).toContain(CURSOR_ACTIVE);
    expect(inactive).toContain(CURSOR_INACTIVE);
    expect(inactive).not.toContain(CURSOR_ACTIVE);
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerActionPromptPluralizesItemCount')
  'formatActionPrompt pluralises item count'() {
    expect(formatActionPrompt(1)).toBe('(1 item) — action?');
    expect(formatActionPrompt(0)).toBe('(0 items) — action?');
    expect(formatActionPrompt(7)).toBe('(7 items) — action?');
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerErrorMessagePrefixesWithCommandName')
  'formatErrorMessage prefixes every error with "requirements explore:"'() {
    expect(formatErrorMessage('boom')).toBe('requirements explore: boom\n');
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerBuildsGraph')
  'renderHeader frames the title with a leading newline and the box-drawing rule'() {
    expect(renderHeader('Requirements')).toBe('\n── Requirements ──\n');
  }

  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerExitsCleanlyOnCtrlC')
  'EXIT_MESSAGE and TTY_REQUIRED_MSG are defined constants the shell can emit verbatim'() {
    expect(EXIT_MESSAGE).toBe('bye.\n');
    expect(TTY_REQUIRED_MSG).toMatch(/TTY/);
  }
}

// Keep classes referenced so v8 marks them executed at import.
void GraphBuildingTests;
void TestRegistrySnapshotTests;
void KeybindingTests;
void FsmTransitionTests;
void ProjectionTests;
void DiscoveryTests;
void EndToEndTests;
void RenderPrimitiveTests;
@FeatureTest(FeatureTraceExplorerTuiFeature)
class MissingTraceNodeTests {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerDrillsDownFromAnyNode')
  missingMappingsProduceEmptyLists() {
    const graph=buildTraceGraph([],[],[]);
    const base=initialState();
    expect(listAt({...base,view:'ViewingFeats',path:[{kind:'req',id:'REQ-ABSENT' as never}]},graph)).toEqual([]);
    expect(listAt({...base,view:'ViewingAcs',path:[{kind:'feat',id:'ABSENT' as never}]},graph)).toEqual([]);
    expect(listAt({...base,view:'ViewingTests',path:[{kind:'ac',feature:'ABSENT' as never,ac:'missing' as never}]},graph)).toEqual([]);
  }
}
void MissingTraceNodeTests;

@FeatureTest(FeatureTraceExplorerTuiFeature)
class RestoredNavigationStateContracts {
  @Verifies<FeatureTraceExplorerTuiFeature>('traceExplorerHandlesIncompleteRestoredPaths')
  restoredPathsHaveSafeEmptyProjectionsAndBoundedBackNavigation() {
    const graph = mkGraph();
    const req: ExploreCrumb = { kind: 'req', id: graph.requirements[0]!.id };
    const feat: ExploreCrumb = { kind: 'feat', id: graph.features[0]!.id };
    const ac: ExploreCrumb = { kind: 'ac', feature: graph.features[0]!.id, ac: graph.features[0]!.acs[0]!.name };
    const expected = { ViewingFeats: 'req', ViewingAcs: 'feat', ViewingTests: 'ac' };
    for (const view of ['ViewingFeats', 'ViewingAcs', 'ViewingTests'] as const) {
      const empty: ExploreState = { ...initialState(), view };
      expect(listAt(empty, graph)).toEqual([]);
      expect(viewTitle(empty)).toContain('(root)');
      expect(step(empty, { type: 'DrillDown' }, graph)).toBe(empty);
      for (const crumb of [req, feat, ac].filter(crumb => crumb.kind !== expected[view])) {
        const stale: ExploreState = { ...empty, path: [crumb] };
        expect(listAt(stale, graph)).toEqual([]);
        expect(step(stale, { type: 'DrillDown' }, graph)).toBe(stale);
      }
    }
    const staleDepth: ExploreState = { ...initialState(), view: 'ViewingTests', path: [req, feat, ac, ac] };
    expect(step(staleDepth, { type: 'Back' }, graph)).toEqual({ ...initialState(), view: 'ViewingTests', path: [req, feat, ac] });
  }
}