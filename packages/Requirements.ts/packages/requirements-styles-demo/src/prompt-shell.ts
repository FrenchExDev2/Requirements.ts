/**
 * Real Prompt adapter — thin wrapper around `@clack/prompts`.
 * Copy of packages/requirements/src/cli/prompt-shell.ts, kept standalone so
 * the demo package (and its `rsd` bin) can run without depending on the
 * thin CLI wrapper.
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
} from '@frenchexdev2/requirements-core/ports';

export class PromptCancelledError extends Error {
  constructor(message = 'Prompt cancelled by user') {
    super(message);
    this.name = 'PromptCancelledError';
  }
}

function unwrap<T>(value: T | symbol): T {
  if (isCancel(value)) {
    throw new PromptCancelledError();
  }
  return value as T;
}

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
        options: choices.map((c) => ({
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
        options: choices.map((c) => ({
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

export async function openInEditor(
  paths: readonly string[],
  runner: CommandRunner,
): Promise<void> {
  if (paths.length === 0) return;
  const args = paths.map((p) => JSON.stringify(p)).join(' ');
  try {
    await runner.exec(`code ${args}`);
  } catch {
    // Editor absent or not on PATH — non-fatal.
  }
}
