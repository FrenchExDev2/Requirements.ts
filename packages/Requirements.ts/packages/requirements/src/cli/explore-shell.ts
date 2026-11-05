/**
 * Interactive trace explorer — TTY shell.
 *
 * Thin wrapper around `explore-core.ts`. Prompt and driver ports make terminal
 * behavior testable without an interactive console.
 *
 * Feature: FEATURE-TRACE-EXPLORER-TUI.
 */



import type { FileSystem, OutputSink, Prompt } from '../ports/external.js';
import {
  buildTraceGraph,
  DEFAULT_KEY,
  EMPTY_LINE,
  EXIT_MESSAGE,
  formatActionPrompt,
  formatErrorMessage,
  initialState,
  KEY_CHOICES,
  keyToEvent,
  listAt,
  loadSpecsViaFileSystem,
  readTestRegistry,
  renderHeader,
  renderListLine,
  step,
  TTY_REQUIRED_MSG,
  viewTitle,
  type ExploreEvent,
  type ExploreState,
  type TraceGraph,
} from '@frenchexdev2/requirements-core/explore-core';
import { buildSatisfiedByIndex } from '@frenchexdev2/requirements-wizards';
import { PromptCancelledError, realPrompt } from './prompt-shell.js';

export interface ExploreShellDeps {
  readonly fs: FileSystem;
  readonly stdout: OutputSink;
  readonly stderr: OutputSink;
  readonly prompt: Prompt;
}

export interface ExploreShellOptions {
  readonly featuresDir: string;
  readonly requirementsDir: string;
}

/**
 * Drive the explorer until the user exits. Designed to be called by
 * `src/bin/requirements.ts`. Non-TTY guard + Ctrl+C teardown are in the
 * caller entrypoint (`runExploreCli`) so that the driver stays testable.
 */
export async function runExploreInteractive(
  deps: ExploreShellDeps,
  opts: ExploreShellOptions,
): Promise<void> {
  const { features, requirements } = await loadSpecsViaFileSystem(
    deps.fs,
    opts.featuresDir,
    opts.requirementsDir,
  );
  const graph = buildTraceGraph(requirements, features, readTestRegistry(), buildSatisfiedByIndex());

  let state: ExploreState = initialState();
  while (!state.exited) {
    renderView(state, graph, deps.stdout);
    const event = await readEvent(state, graph, deps.prompt);
    if (event === null) {
      state = step(state, { type: 'Exit' }, graph);
      continue;
    }
    state = step(state, event, graph);
  }
  deps.stdout.write(EXIT_MESSAGE);
}

function renderView(state: ExploreState, graph: TraceGraph, out: OutputSink): void {
  out.write(renderHeader(viewTitle(state)));
  const list = listAt(state, graph);
  if (list.length === 0) {
    out.write(EMPTY_LINE);
    return;
  }
  list.forEach((line, i) => {
    out.write(renderListLine(line, i === state.cursor));
  });
}

async function readEvent(
  state: ExploreState,
  graph: TraceGraph,
  prompt: Prompt,
): Promise<ExploreEvent | null> {
  const list = listAt(state, graph);
  try {
    const key = await prompt.select<string>(
      formatActionPrompt(list.length),
      KEY_CHOICES,
      DEFAULT_KEY,
    );
    return keyToEvent(key);
  } catch (e) {
    if (e instanceof PromptCancelledError) return null;
    throw e;
  }
}

/**
 * Top-level CLI entrypoint — called from `src/bin/requirements.ts`.
 * Handles non-TTY refusal + Ctrl+C teardown + error formatting.
 */
export async function runExploreCli(
  args: { featuresDir: string; requirementsDir: string },
  deps: {
    fs: FileSystem;
    stdout: { write: (s: string) => void; isTTY: boolean };
    stderr: { write: (s: string) => void };
    exit: (code: number) => void;
    /** Optional prompt port for embedded callers and deterministic interaction. */
    prompt?: Prompt;
    /** Optional terminal driver; defaults to the interactive trace explorer. */
    runInteractive?: typeof runExploreInteractive;
  },
): Promise<void> {
  if (!deps.stdout.isTTY) {
    deps.stderr.write(TTY_REQUIRED_MSG);
    deps.exit(1);
    return;
  }

  try {
    await (deps.runInteractive ?? runExploreInteractive)(
      {
        fs: deps.fs,
        stdout: { write: deps.stdout.write, isTty: () => true },
        stderr: { write: deps.stderr.write, isTty: () => false },
        prompt: deps.prompt ?? realPrompt(),
      },
      { featuresDir: args.featuresDir, requirementsDir: args.requirementsDir },
    );
    deps.exit(0);
  } catch (e) {
    if (e instanceof PromptCancelledError) {
      deps.stdout.write('\n');
      deps.exit(0);
      return;
    }
    deps.stderr.write(formatErrorMessage((e as Error).message));
    deps.exit(1);
  }
}


