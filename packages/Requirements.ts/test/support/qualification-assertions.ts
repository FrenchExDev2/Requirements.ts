/** Runtime backstop: an assertion appearing in dead code is not execution proof. */
import { afterEach, expect } from 'vitest';

afterEach(() => {
  const state = expect.getState();
  const key = JSON.stringify([state.testPath, state.currentTestName]);
  const recorded = (globalThis as unknown as Record<symbol, Map<string, number> | undefined>)[Symbol.for('requirements.executed-property-assertions')];
  const samples = recorded?.get(key) ?? 0;
  recorded?.delete(key);
  if (state.assertionCalls === 0 && samples === 0) throw new Error('Complete qualification requires at least one executed assertion per test.');
});
