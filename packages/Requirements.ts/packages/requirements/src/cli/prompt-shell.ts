/**
 * Real Prompt adapter — thin wrapper around `@clack/prompts`.
 *
 * Pure boundary layer: every method maps 1:1 to a clack named export, then
 * normalises cancellation (Ctrl+C) into a typed `PromptCancelledError`.
 *
 * Stream D deliverable (@FeatureTest: FeatureNewCommandFeature —
 * primary cross-border: REQ-TUI-MODERN / REQ-PARALLEL-DELIVERABLE / REQ-DOG-FOOD).
 *
 * No readline, no direct `process.*` / `child_process.*` usage — the sole I/O
 * boundaries are `@clack/prompts` and the injected `CommandRunner` port.
 */

import {
  text as clackText,
  select as clackSelect,
  multiselect as clackMultiselect,
  confirm as clackConfirm,
  note as clackNote,
  spinner as clackSpinner,
  isCancel,
  type Option as ClackOption,
} from '@clack/prompts';

import type {
  Prompt,
  PromptChoice,
  PromptSpinner,
  PromptTextOptions,
  CommandRunner,
} from '../ports/external.js';

/** Thrown when the user hits Ctrl+C on any prompt — distinguishes from other Errors. */
export class PromptCancelledError extends Error {
  constructor(message = 'Prompt cancelled by user') {
    super(message);
    this.name = 'PromptCancelledError';
  }
}

/** Internal helper — throws PromptCancelledError if clack signalled cancel, else returns value. */
function unwrap<T>(value: T | symbol): T {
  if (isCancel(value)) {
    throw new PromptCancelledError();
  }
  return value as T;
}

/** Factory — returns a real `Prompt` backed by `@clack/prompts`. */
export function realPrompt(): Prompt {
  return {
    async text(question: string, opts: PromptTextOptions = {}): Promise<string> {
      const result = await clackText({
        message: question,
        placeholder: opts.placeholder,
        initialValue: opts.default,
        // clack hands `undefined` to validate when the field is submitted
        // empty; the port contract is total over strings, so normalise first.
        validate: opts.validate
          ? (value: string | undefined): string | undefined => opts.validate!(value ?? '')
          : undefined,
      });
      return unwrap(result) as string;
    },

    async select<T extends string>(
      question: string,
      choices: readonly PromptChoice<T>[],
      dflt?: T,
    ): Promise<T> {
      const result = await clackSelect<T>({
        message: question,
        options: choices.map(c => ({
  value: c.value,
  label: c.label,
  ...(c.hint !== undefined ? { hint: c.hint } : {}),
})) as ClackOption<T>[],
        initialValue: dflt,
      });
      return unwrap(result) as T;
    },

    async multiselect<T extends string>(
      question: string,
      choices: readonly PromptChoice<T>[],
      dflt?: readonly T[],
    ): Promise<readonly T[]> {
      const result = await clackMultiselect<T>({
        message: question,
        options: choices.map(c => ({
  value: c.value,
  label: c.label,
  ...(c.hint !== undefined ? { hint: c.hint } : {}),
})) as ClackOption<T>[],
        initialValues: dflt ? [...dflt] : undefined,
        required: false,
      });
      return unwrap(result) as readonly T[];
    },

    async confirm(question: string, dflt?: boolean): Promise<boolean> {
      const result = await clackConfirm({
        message: question,
        initialValue: dflt,
      });
      return unwrap(result) as boolean;
    },

    note(message: string, title?: string): void {
      clackNote(message, title);
    },

    spinner(): PromptSpinner {
      const s = clackSpinner();
      return {
        start(msg: string): void {
          s.start(msg);
        },
        stop(msg: string): void {
          s.stop(msg);
        },
      };
    },
  };
}

/**
 * Open the given files in VS Code by shelling out `code <paths>` via the
 * injected `CommandRunner`. Silently swallows errors — VS Code may not be
 * installed, or the shim may not be on PATH; neither is fatal to a wizard.
 */
export async function openInEditor(
  paths: readonly string[],
  runner: CommandRunner,
): Promise<void> {
  if (paths.length === 0) return;
  const args = paths.map(p => JSON.stringify(p)).join(' ');
  try {
    await runner.exec(`code ${args}`);
  } catch {
    // Editor absent or not on PATH — non-fatal; the user will see the written files.
  }
}
