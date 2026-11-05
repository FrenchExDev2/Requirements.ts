/**
 * Clack-adapter tests — every method mapped under its own AC.
 *
 * We vi.mock @clack/prompts so every clack entry-point becomes a controllable
 * spy. Coverage then reaches every line of realPrompt() without needing a TTY.
 * Dog-fooded on ClackAdapterFeature (17 distinct ACs, one per mapping + per
 * cancellation path + per cross-cutting invariant).
 */

import { readFileSync } from 'node:fs';
import { expect, vi } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ClackAdapterFeature } from '@frenchexdev2/requirements-requirements';
import type { CommandRunner } from '@frenchexdev2/requirements-core/ports';

// ── Mock @clack/prompts BEFORE importing the adapter ────────────────────────

const CANCEL = Symbol('clack.cancel');
const state: {
  textLast?: Record<string, unknown>;     textResult: unknown;
  selectLast?: Record<string, unknown>;   selectResult: unknown;
  multiLast?: Record<string, unknown>;    multiResult: unknown;
  confirmLast?: Record<string, unknown>;  confirmResult: unknown;
  noteCalls: Array<[string, string | undefined]>;
  spinnerStarts: string[];
  spinnerStops: string[];
} = {
  textResult: 'ok',
  selectResult: 'ok',
  multiResult: ['ok'],
  confirmResult: true,
  noteCalls: [],
  spinnerStarts: [],
  spinnerStops: [],
};

vi.mock('@clack/prompts', () => ({
  text: vi.fn(async (o: Record<string, unknown>) => { state.textLast = o; return state.textResult; }),
  select: vi.fn(async (o: Record<string, unknown>) => { state.selectLast = o; return state.selectResult; }),
  multiselect: vi.fn(async (o: Record<string, unknown>) => { state.multiLast = o; return state.multiResult; }),
  confirm: vi.fn(async (o: Record<string, unknown>) => { state.confirmLast = o; return state.confirmResult; }),
  note: vi.fn((m: string, t?: string) => { state.noteCalls.push([m, t]); }),
  spinner: vi.fn(() => ({
    start: (msg: string) => { state.spinnerStarts.push(msg); },
    stop: (msg: string) => { state.spinnerStops.push(msg); },
  })),
  isCancel: (v: unknown) => v === CANCEL,
}));

// Static import — vi.mock above is auto-hoisted by vitest, so the mock is
// installed before this module evaluates @clack/prompts. Static import lets
// the requirements binding-scanner link this test to src/cli/prompt-shell.ts.
import { realPrompt, openInEditor, PromptCancelledError } from '../../src/prompt-shell';

// ── Fakes ──────────────────────────────────────────────────────────────────

interface FakeRunner {
  readonly runner: CommandRunner;
  readonly calls: ReadonlyArray<{ readonly cmd: string }>;
  fail(err: Error): void;
}

function fakeRunner(): FakeRunner {
  const calls: Array<{ cmd: string }> = [];
  let failWith: Error | undefined;
  const runner: CommandRunner = {
    async exec(cmd: string) {
      calls.push({ cmd });
      if (failWith) throw failWith;
      return { stdout: '', stderr: '', code: 0 };
    },
  };
  return { runner, calls, fail: (e: Error) => { failWith = e; } };
}

const promptShellSource = readFileSync(
  new URL('../../src/prompt-shell.ts', import.meta.url),
  'utf8',
);

function resetState(): void {
  state.textResult = 'ok';
  state.selectResult = 'ok';
  state.multiResult = ['ok'];
  state.confirmResult = true;
  state.textLast = state.selectLast = state.multiLast = state.confirmLast = undefined;
  state.noteCalls = [];
  state.spinnerStarts = [];
  state.spinnerStops = [];
}

// ── Tests ──────────────────────────────────────────────────────────────────

@FeatureTest(ClackAdapterFeature)
class ClackAdapterTests {
  @Verifies<ClackAdapterFeature>('realPromptExposesAllPromptMethods')
  'realPrompt returns an object with all six Prompt methods as functions'() {
    const p = realPrompt();
    expect(typeof p.text).toBe('function');
    expect(typeof p.select).toBe('function');
    expect(typeof p.multiselect).toBe('function');
    expect(typeof p.confirm).toBe('function');
    expect(typeof p.note).toBe('function');
    expect(typeof p.spinner).toBe('function');
  }

  @Verifies<ClackAdapterFeature>('realPromptTextDelegatesToClackText')
  async 'text() forwards question/placeholder/default/validate to clackText'() {
    resetState();
    const p = realPrompt();
    state.textResult = 'answer';
    const result = await p.text('pick one', {
      default: 'def',
      placeholder: 'hint',
      validate: (s: string) => s.length === 0 ? 'empty' : undefined,
    });
    expect(result).toBe('answer');
    expect(state.textLast).toMatchObject({ message: 'pick one', placeholder: 'hint', initialValue: 'def' });
    // validate is wrapped; assert the wrapper delegates
    const wrapped = state.textLast!.validate as (s: string) => string | undefined;
    expect(wrapped('')).toBe('empty');
    expect(wrapped(undefined as unknown as string)).toBe('empty');
    expect(wrapped('ok')).toBeUndefined();
  }

  @Verifies<ClackAdapterFeature>('realPromptTextDelegatesToClackText')
  async 'text() with no opts still forwards the message'() {
    resetState();
    await realPrompt().text('bare');
    expect(state.textLast).toMatchObject({ message: 'bare' });
    expect(state.textLast!.validate).toBeUndefined();
  }

  @Verifies<ClackAdapterFeature>('realPromptSelectDelegatesToClackSelect')
  async 'select() maps choices to {value,label} and preserves hints only when defined'() {
    resetState();
    state.selectResult = 'b';
    const result = await realPrompt().select('pick', [
      { value: 'a', label: 'A', hint: 'with hint' },
      { value: 'b', label: 'B' },
    ], 'a');
    expect(result).toBe('b');
    expect(state.selectLast!.initialValue).toBe('a');
    const opts = state.selectLast!.options as Array<Record<string, unknown>>;
    expect(opts[0]).toEqual({ value: 'a', label: 'A', hint: 'with hint' });
    expect(opts[1]).toEqual({ value: 'b', label: 'B' });
    expect('hint' in opts[1]!).toBe(false);
  }

  @Verifies<ClackAdapterFeature>('realPromptMultiselectDelegatesToClackMultiselect')
  async 'multiselect() forwards choices + initialValues + required=false'() {
    resetState();
    state.multiResult = ['a', 'b'];
    const result = await realPrompt().multiselect('pick many',
      [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', hint: 'x' }],
      ['a'],
    );
    expect(result).toEqual(['a', 'b']);
    expect(state.multiLast).toMatchObject({ message: 'pick many', required: false });
    expect(state.multiLast!.initialValues).toEqual(['a']);
  }

  @Verifies<ClackAdapterFeature>('realPromptMultiselectDelegatesToClackMultiselect')
  async 'multiselect() omits initialValues when no default is passed'() {
    resetState();
    state.multiResult = [];
    await realPrompt().multiselect('no default', [{ value: 'a', label: 'A' }]);
    expect(state.multiLast!.initialValues).toBeUndefined();
  }

  @Verifies<ClackAdapterFeature>('realPromptConfirmDelegatesToClackConfirm')
  async 'confirm() forwards question + initialValue'() {
    resetState();
    state.confirmResult = true;
    const r = await realPrompt().confirm('really?', false);
    expect(r).toBe(true);
    expect(state.confirmLast).toMatchObject({ message: 'really?', initialValue: false });
  }

  @Verifies<ClackAdapterFeature>('realPromptNoteDelegatesToClackNote')
  'note() forwards message + title to clackNote'() {
    resetState();
    realPrompt().note('hello', 'title');
    expect(state.noteCalls).toEqual([['hello', 'title']]);

    realPrompt().note('solo');
    expect(state.noteCalls).toEqual([['hello', 'title'], ['solo', undefined]]);
  }

  @Verifies<ClackAdapterFeature>('realPromptSpinnerDelegatesToClackSpinner')
  'spinner() returns an object whose start/stop forward to clack spinner'() {
    resetState();
    const sp = realPrompt().spinner();
    sp.start('working…');
    sp.stop('done');
    expect(state.spinnerStarts).toEqual(['working…']);
    expect(state.spinnerStops).toEqual(['done']);
  }

  @Verifies<ClackAdapterFeature>('textCancellationThrowsPromptCancelledError')
  async 'text() throws PromptCancelledError when clack returns the cancel symbol'() {
    resetState();
    state.textResult = CANCEL;
    await expect(realPrompt().text('q')).rejects.toBeInstanceOf(PromptCancelledError);
  }

  @Verifies<ClackAdapterFeature>('selectCancellationThrowsPromptCancelledError')
  async 'select() throws PromptCancelledError on cancel'() {
    resetState();
    state.selectResult = CANCEL;
    await expect(realPrompt().select('q', [{ value: 'a', label: 'A' }])).rejects.toBeInstanceOf(PromptCancelledError);
  }

  @Verifies<ClackAdapterFeature>('multiselectCancellationThrowsPromptCancelledError')
  async 'multiselect() throws PromptCancelledError on cancel'() {
    resetState();
    state.multiResult = CANCEL;
    await expect(realPrompt().multiselect('q', [{ value: 'a', label: 'A' }])).rejects.toBeInstanceOf(PromptCancelledError);
  }

  @Verifies<ClackAdapterFeature>('confirmCancellationThrowsPromptCancelledError')
  async 'confirm() throws PromptCancelledError on cancel'() {
    resetState();
    state.confirmResult = CANCEL;
    await expect(realPrompt().confirm('q')).rejects.toBeInstanceOf(PromptCancelledError);
  }

  // ── openInEditor ────────────────────────────────────────────────────────

  @Verifies<ClackAdapterFeature>('openInEditorShellsThroughCommandRunnerPort')
  async 'openInEditor dispatches exactly one exec call through CommandRunner'() {
    const { runner, calls } = fakeRunner();
    await openInEditor(['/tmp/foo.ts'], runner);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.cmd.startsWith('code ')).toBe(true);
  }

  @Verifies<ClackAdapterFeature>('openInEditorQuotesPathsForShellSafety')
  async 'openInEditor double-quotes every path to survive shell spaces'() {
    const { runner, calls } = fakeRunner();
    await openInEditor(['/tmp/foo.ts', '/tmp/bar spaces.ts'], runner);
    expect(calls[0]!.cmd).toBe('code "/tmp/foo.ts" "/tmp/bar spaces.ts"');
  }

  @Verifies<ClackAdapterFeature>('openInEditorIsNoOpOnEmptyPathList')
  async 'openInEditor does not call the runner when paths is empty'() {
    const { runner, calls } = fakeRunner();
    await openInEditor([], runner);
    expect(calls).toEqual([]);
  }

  @Verifies<ClackAdapterFeature>('openInEditorSilentlySwallowsRunnerFailures')
  async 'openInEditor resolves cleanly even when the runner throws (editor absent)'() {
    const { runner, calls, fail } = fakeRunner();
    fail(new Error('code: command not found'));
    await expect(openInEditor(['/tmp/x.ts'], runner)).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  }

  // ── Error class ─────────────────────────────────────────────────────────

  @Verifies<ClackAdapterFeature>('promptCancelledErrorExtendsError')
  'PromptCancelledError is an Error subclass with a canonical name'() {
    const err = new PromptCancelledError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PromptCancelledError);
    expect(err.name).toBe('PromptCancelledError');
  }

  @Verifies<ClackAdapterFeature>('promptCancelledErrorAcceptsCustomMessage')
  'PromptCancelledError carries a custom message verbatim'() {
    const err = new PromptCancelledError('user aborted AC loop');
    expect(err.message).toBe('user aborted AC loop');
  }

  // ── Source-file invariants ──────────────────────────────────────────────

  @Verifies<ClackAdapterFeature>('moduleHasNoReadlineImport')
  'prompt-shell.ts does not import node:readline or readline'() {
    expect(promptShellSource).not.toMatch(/from\s+['"]node:readline['"]/);
    expect(promptShellSource).not.toMatch(/from\s+['"]readline['"]/);
  }

  @Verifies<ClackAdapterFeature>('moduleHasNoDirectProcessOrChildProcessImport')
  'prompt-shell.ts does not import child_process or touch process.* directly'() {
    expect(promptShellSource).not.toMatch(/from\s+['"]node:child_process['"]/);
    expect(promptShellSource).not.toMatch(/from\s+['"]child_process['"]/);
    expect(promptShellSource).not.toMatch(/\bprocess\.(stdin|stdout|stderr|argv)\b/);
  }
}

void ClackAdapterTests;
