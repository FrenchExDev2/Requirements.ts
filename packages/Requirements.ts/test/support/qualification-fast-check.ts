/** Test-framework adapter: retain actual fast-check runs, seeds and minimized failures. */
import * as native from 'fast-check';
import { afterAll, expect } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { getRequirementRegistry } from '@frenchexdev2/requirements';

export * from 'fast-check';
const root = fileURLToPath(new URL('../../', import.meta.url));
const pending: Promise<void>[] = [];
afterAll(async () => { await Promise.all(pending); });

export function assert<Ts>(property: native.IAsyncProperty<Ts>, parameters?: native.Parameters<Ts>): Promise<void>;
export function assert<Ts>(property: native.IProperty<Ts>, parameters?: native.Parameters<Ts>): void;
export function assert<Ts>(property: native.IProperty<Ts> | native.IAsyncProperty<Ts>, parameters?: native.Parameters<Ts>): void | Promise<void> {
  const state = expect.getState();
  const file = relative(root, state.testPath ?? '').replaceAll('\\', '/');
  const strategy = /fuzz/i.test(file) ? 'fuzz' : 'property';
  const minimum = strategy === 'fuzz' ? 10000 : 1000;
  const full = process.env.QUALIFICATION_FULL === '1';
  const options: native.Parameters<Ts> = {
    ...parameters, seed: parameters?.seed ?? 42,
    numRuns: full ? Math.max(parameters?.numRuns ?? 0, minimum) : parameters?.numRuns ?? 1000,
    reporter(details) {
      if (!details.failed && !details.interrupted && details.numRuns > 0) {
        const key = Symbol.for('requirements.executed-property-assertions');
        const context = globalThis as unknown as Record<symbol, Map<string, number>>;
        const recorded = context[key] ??= new Map<string, number>();
        const test = JSON.stringify([state.testPath, state.currentTestName]);
        recorded.set(test, (recorded.get(test) ?? 0) + details.numRuns);
      }
      if (process.env.TEST_RUN_ID) {
        const current = state.currentTestName ?? '';
        const ref = getRequirementRegistry().find(r => current.includes(r.testClass) && current.endsWith(r.testMethod));
        if (!ref) throw new Error(`Cannot identify the decorated property test: ${current}`);
        const dir = resolve(root, 'test-results', process.env.TEST_RUN_ID, 'strategies');
        const record = { testId: JSON.stringify([file, ref.testClass, ref.testMethod]), strategy,
          runs: details.numRuns, seed: details.seed, status: details.failed || details.interrupted ? 'failed' : 'passed',
          ...(details.failed ? { counterexample: details.counterexample, path: details.counterexamplePath } : {}),
        };
        pending.push(mkdir(dir, { recursive: true }).then(() => writeFile(resolve(dir, `${randomUUID()}.json`), JSON.stringify(record, (_key, value: unknown) => typeof value === 'bigint' ? { bigint: value.toString() } : value) + '\n', 'utf8')));
      }
      if (details.failed || details.interrupted) throw new Error(native.defaultReportMessage(details) ?? 'Property campaign interrupted.');
    },
  };
  return native.assert(property as native.IProperty<Ts>, options);
}
