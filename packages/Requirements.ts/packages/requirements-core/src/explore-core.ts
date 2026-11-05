/**
 * Interactive trace explorer — pure core.
 *
 * Graph-builder + navigation state machine, fully decoupled from clack / stdin /
 * TTY. Consumed by `explore-shell.ts` (thin TTY wrapper) and exhaustively unit
 * tested via `test/unit/explore-core.test.ts`.
 *
 * Feature: FEATURE-TRACE-EXPLORER-TUI.
 *
 * Design:
 *   - `buildTraceGraph` reads specs (already parsed — the `FileSystem` port is
 *     the caller's responsibility, same pattern as compliance-core). Given the
 *     four tiers REQ / FEAT / AC / TEST we produce an adjacency index.
 *   - `ExploreState` is a deterministic FSM: (view, selected-node, history-stack).
 *   - `step(state, event, graph)` is pure — produces the next state. All
 *     keybindings collapse to six logical events: SelectNode, DrillDown, Back,
 *     OpenHelp, CloseHelp, Exit.
 */

import type { FileSystem, PromptChoice } from './ports/index.js';
import type {
  AcName,
  FeatureId,
  FeatureSpec,
  RequirementId,
  RequirementSpec,
} from './types.js';
import { getRequirementRegistry } from './index.js';

// Inversion of dependency on tier-2 wizards: the runtime `@Satisfies` registry
// is computed by `buildSatisfiedByIndex()` (in `@frenchexdev2/requirements-wizards`),
// but `buildTraceGraph` doesn't import it directly — callers pass the index in.
// This lets explore-core live in `@frenchexdev2/requirements-core` without a cycle.
export type SatisfiedByIndex = ReadonlyMap<RequirementId, readonly FeatureId[]>;

// ══════════════════════════════════════════════════════════════════════════════
// Graph model
// ══════════════════════════════════════════════════════════════════════════════

export interface TestRef {
  readonly feature: FeatureId;
  readonly ac: AcName;
  readonly testClass: string;
  readonly testMethod: string;
}

export interface AcNode {
  readonly feature: FeatureId;
  readonly ac: AcName;
}

export interface TraceGraph {
  readonly requirements: readonly RequirementSpec[];
  readonly features: readonly FeatureSpec[];
  readonly acs: readonly AcNode[];
  readonly tests: readonly TestRef[];
  /** requirementId → featureIds that satisfy it. */
  readonly reqToFeatures: ReadonlyMap<RequirementId, readonly FeatureId[]>;
  /** featureId → AC nodes. */
  readonly featureToAcs: ReadonlyMap<FeatureId, readonly AcNode[]>;
  /** "<featureId>/<acName>" → tests. */
  readonly acToTests: ReadonlyMap<string, readonly TestRef[]>;
}

/** Pure — build the graph from already-loaded specs and a flat test-registry. */
export function buildTraceGraph(
  requirements: readonly RequirementSpec[],
  features: readonly FeatureSpec[],
  tests: readonly TestRef[],
  satisfiedBy: SatisfiedByIndex = new Map(),
): TraceGraph {
  const reqToFeatures = new Map<RequirementId, readonly FeatureId[]>();
  for (const r of requirements) {
    // Spec-declared satisfiers first; fall back to runtime registry.
    const specLinks = features
      .filter((f) => (f.satisfies ?? []).includes(r.id))
      .map((f) => f.id);
    const runtimeLinks = satisfiedBy.get(r.id) ?? [];
    // Union — preserve order, dedupe.
    const seen = new Set<string>();
    const merged: FeatureId[] = [];
    for (const fid of [...specLinks, ...runtimeLinks]) {
      if (!seen.has(fid)) {
        seen.add(fid);
        merged.push(fid);
      }
    }
    reqToFeatures.set(r.id, merged);
  }

  const featureToAcs = new Map<FeatureId, readonly AcNode[]>();
  const acNodes: AcNode[] = [];
  for (const f of features) {
    const nodes: AcNode[] = f.acs.map((a) => ({ feature: f.id, ac: a.name }));
    featureToAcs.set(f.id, nodes);
    acNodes.push(...nodes);
  }

  const acToTests = new Map<string, TestRef[]>();
  for (const t of tests) {
    const key = `${t.feature}/${t.ac}`;
    const list = acToTests.get(key) ?? [];
    list.push(t);
    acToTests.set(key, list);
  }

  return {
    requirements,
    features,
    acs: acNodes,
    tests,
    reqToFeatures,
    featureToAcs,
    acToTests: acToTests as ReadonlyMap<string, readonly TestRef[]>,
  };
}

/**
 * Snapshot the runtime `@Verifies` registry as a TestRef[].
 * Pure wrt inputs; the registry is global (design of decorators module).
 */
export function readTestRegistry(): readonly TestRef[] {
  return getRequirementRegistry().map((r) => ({
    feature: r.feature as unknown as FeatureId,
    ac: r.ac as unknown as AcName,
    testClass: r.testClass,
    testMethod: r.testMethod,
  }));
}

// ══════════════════════════════════════════════════════════════════════════════
// Discovery via FileSystem port — mirrors compliance-core.readFeatures shape.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Load feature + requirement spec.json blobs via the `FileSystem` port.
 * Keeps `explore-core` independent from `fs/promises` for testability
 * (satisfies AC `traceExplorerUsesFileSystemPortForDiscovery`).
 */
export async function loadSpecsViaFileSystem(
  fs: FileSystem,
  featuresDir: string,
  requirementsDir: string,
): Promise<{ features: FeatureSpec[]; requirements: RequirementSpec[] }> {
  const features = await loadKindFromDir<FeatureSpec>(fs, featuresDir, 'feature');
  const requirements = await loadKindFromDir<RequirementSpec>(fs, requirementsDir, 'requirement');
  return { features, requirements };
}

async function loadKindFromDir<T extends { kind: string }>(
  fs: FileSystem,
  dir: string,
  kind: 'feature' | 'requirement',
): Promise<T[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: T[] = [];
  for (const name of entries) {
    if (!name.endsWith('.spec.json')) continue;
    try {
      const raw = await fs.readFile(joinPath(dir, name), 'utf8');
      const parsed = JSON.parse(raw) as T;
      if (parsed.kind === kind) out.push(parsed);
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

function joinPath(a: string, b: string): string {
  if (a.endsWith('/') || a.endsWith('\\')) return a + b;
  return `${a}/${b}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// Navigation state machine
// ══════════════════════════════════════════════════════════════════════════════

export type ViewKind = 'ViewingReqs' | 'ViewingFeats' | 'ViewingAcs' | 'ViewingTests' | 'HelpOverlay';

export interface ExploreState {
  readonly view: ViewKind;
  /** Cursor index into the current list. Clamped; 0 when list is empty. */
  readonly cursor: number;
  /** Crumbs — each entry is the selected parent node for the next-deeper view. */
  readonly path: readonly ExploreCrumb[];
  /** Previous non-help view; used when returning from HelpOverlay. */
  readonly previousView?: ViewKind;
  readonly previousCursor?: number;
  /** True once the FSM has processed an Exit event. */
  readonly exited: boolean;
}

export type ExploreCrumb =
  | { readonly kind: 'req'; readonly id: RequirementId }
  | { readonly kind: 'feat'; readonly id: FeatureId }
  | { readonly kind: 'ac'; readonly feature: FeatureId; readonly ac: AcName };

export type ExploreEvent =
  | { readonly type: 'SelectNode'; readonly delta: number }
  | { readonly type: 'DrillDown' }
  | { readonly type: 'Back' }
  | { readonly type: 'OpenHelp' }
  | { readonly type: 'CloseHelp' }
  | { readonly type: 'Exit' };

/** Initial state — root list of Requirements. */
export function initialState(): ExploreState {
  return { view: 'ViewingReqs', cursor: 0, path: [], exited: false };
}

/** List rendered at a given state. Pure projection over the graph. */
export function listAt(state: ExploreState, graph: TraceGraph): readonly string[] {
  switch (state.view) {
    case 'ViewingReqs':
      return graph.requirements.map((r) => r.id);
    case 'ViewingFeats': {
      const parent = state.path[state.path.length - 1];
      
      if (!parent || parent.kind !== 'req') return [];
      const feats = graph.reqToFeatures.get(parent.id) ?? [];
      return feats as readonly string[];
    }
    case 'ViewingAcs': {
      const parent = state.path[state.path.length - 1];
      
      if (!parent || parent.kind !== 'feat') return [];
      const acs = graph.featureToAcs.get(parent.id) ?? [];
      return acs.map((a) => a.ac as unknown as string);
    }
    case 'ViewingTests': {
      const parent = state.path[state.path.length - 1];
      
      if (!parent || parent.kind !== 'ac') return [];
      const tests = graph.acToTests.get(`${parent.feature}/${parent.ac}`) ?? [];
      return tests.map((t) => `${t.testClass}.${t.testMethod}`);
    }
    case 'HelpOverlay':
      return HELP_LINES;
  }
}

export const HELP_LINES: readonly string[] = [
  'j / ↓       move down',
  'k / ↑       move up',
  'Enter / l   drill down',
  'Backspace / h   go up',
  '?           toggle help',
  'q / Ctrl+C  exit',
];

/** Pure transition function. Invalid events for the current view are no-ops. */
export function step(
  state: ExploreState,
  event: ExploreEvent,
  graph: TraceGraph,
): ExploreState {
  if (state.exited) return state;

  switch (event.type) {
    case 'Exit':
      return { ...state, exited: true };

    case 'OpenHelp':
      if (state.view === 'HelpOverlay') return state;
      return {
        ...state,
        previousView: state.view,
        previousCursor: state.cursor,
        view: 'HelpOverlay',
        cursor: 0,
      };

    case 'CloseHelp':
      if (state.view !== 'HelpOverlay') return state;
      return {
        view: state.previousView ?? 'ViewingReqs',
        cursor: state.previousCursor ?? 0,
        path: state.path,
        exited: false,
      };

    case 'SelectNode': {
      const list = listAt(state, graph);
      if (list.length === 0) return { ...state, cursor: 0 };
      const next = clamp(state.cursor + event.delta, 0, list.length - 1);
      return { ...state, cursor: next };
    }

    case 'DrillDown': {
      if (state.view === 'HelpOverlay') return state;
      const list = listAt(state, graph);
      if (list.length === 0) return state;
      const selected = state.cursor < list.length ? state.cursor : 0;

      if (state.view === 'ViewingReqs') {
        const req = graph.requirements[selected]!;
        return {
          view: 'ViewingFeats',
          cursor: 0,
          path: [...state.path, { kind: 'req', id: req.id }],
          exited: false,
        };
      }
      if (state.view === 'ViewingFeats') {
        // A non-empty listAt result already established this parent kind.
        const parent = state.path[state.path.length - 1]! as Extract<ExploreCrumb, { kind: 'req' }>;
        
        // list.length > 0 guaranteed by the early return above, so reqToFeatures
        // has an entry and selected < feats.length — no defensive fallback needed.
        const fid = graph.reqToFeatures.get(parent.id)![selected]!;
        return {
          view: 'ViewingAcs',
          cursor: 0,
          path: [...state.path, { kind: 'feat', id: fid }],
          exited: false,
        };
      }
      if (state.view === 'ViewingAcs') {
        const parent = state.path[state.path.length - 1]! as Extract<ExploreCrumb, { kind: 'feat' }>;
        
        const node = graph.featureToAcs.get(parent.id)![selected]!;
        return {
          view: 'ViewingTests',
          cursor: 0,
          path: [...state.path, { kind: 'ac', feature: node.feature, ac: node.ac }],
          exited: false,
        };
      }
      // ViewingTests — leaf. Drill is a no-op.
      return state;
    }

    case 'Back': {
      if (state.view === 'HelpOverlay') {
        return {
          view: state.previousView ?? 'ViewingReqs',
          cursor: state.previousCursor ?? 0,
          path: state.path,
          exited: false,
        };
      }
      if (state.path.length === 0) return state;
      const nextPath = state.path.slice(0, -1);
      const nextView: ViewKind =
        nextPath.length === 0
          ? 'ViewingReqs'
          : nextPath[nextPath.length - 1]!.kind === 'req'
            ? 'ViewingFeats'
            : nextPath[nextPath.length - 1]!.kind === 'feat'
              ? 'ViewingAcs'
              :  'ViewingTests';
      return { view: nextView, cursor: 0, path: nextPath, exited: false };
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Keybinding → event dispatch (lazygit conventions).
// Callable from both unit tests and the TTY shell.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Translate a key name (as would be emitted by clack / readline) into an event.
 * Returns `null` for unmapped keys (caller ignores them).
 */
export function keyToEvent(key: string): ExploreEvent | null {
  switch (key) {
    case 'j':
    case 'down':
    case 'ArrowDown':
      return { type: 'SelectNode', delta: 1 };
    case 'k':
    case 'up':
    case 'ArrowUp':
      return { type: 'SelectNode', delta: -1 };
    case 'l':
    case 'right':
    case 'ArrowRight':
    case 'return':
    case 'enter':
      return { type: 'DrillDown' };
    case 'h':
    case 'left':
    case 'ArrowLeft':
    case 'backspace':
      return { type: 'Back' };
    case '?':
      return { type: 'OpenHelp' };
    case 'escape':
      return { type: 'CloseHelp' };
    case 'q':
    case 'ctrl+c':
    case 'C-c':
      return { type: 'Exit' };
    default:
      return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Utilities
// ══════════════════════════════════════════════════════════════════════════════

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/** Human label for a view — used by the shell to render a title bar. */
export function viewTitle(state: ExploreState): string {
  switch (state.view) {
    case 'ViewingReqs':
      return 'Requirements';
    case 'ViewingFeats':
      return `Features satisfying ${crumbLabel(state.path[state.path.length - 1])}`;
    case 'ViewingAcs':
      return `ACs of ${crumbLabel(state.path[state.path.length - 1])}`;
    case 'ViewingTests':
      return `Tests verifying ${crumbLabel(state.path[state.path.length - 1])}`;
    case 'HelpOverlay':
      return 'Help — keybindings';
  }
}

function crumbLabel(c: ExploreCrumb | undefined): string {
  
  if (!c) return '(root)';
  if (c.kind === 'req') return c.id;
  if (c.kind === 'feat') return c.id;
  return `${c.feature}.${c.ac}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// Render primitives — pure templates, glyphs, labels and key bindings.
// Lives here so the TTY shell stays plumbing-only.
// ══════════════════════════════════════════════════════════════════════════════

export const EXIT_MESSAGE = 'bye.\n';
export const EMPTY_LINE = '  (empty)\n';
export const CURSOR_ACTIVE = '›';
export const CURSOR_INACTIVE = ' ';
export const TTY_REQUIRED_MSG = 'requirements explore requires a TTY\n';
export const DEFAULT_KEY = 'down';

export const KEY_CHOICES: readonly PromptChoice<string>[] = [
  { value: 'down', label: '↓ / j  next' },
  { value: 'up', label: '↑ / k  prev' },
  { value: 'enter', label: '→ / Enter  drill' },
  { value: 'backspace', label: '← / Backspace  back' },
  { value: '?', label: '?  help' },
  { value: 'q', label: 'q  exit' },
];

export function renderHeader(title: string): string {
  return `\n── ${title} ──\n`;
}

export function renderListLine(line: string, isActive: boolean): string {
  const marker = isActive ? CURSOR_ACTIVE : CURSOR_INACTIVE;
  return `  ${marker} ${line}\n`;
}

export function formatActionPrompt(itemCount: number): string {
  return `(${itemCount} item${itemCount === 1 ? '' : 's'}) — action?`;
}

export function formatErrorMessage(msg: string): string {
  return `requirements explore: ${msg}\n`;
}
