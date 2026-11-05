import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';

// Vitest config dedicated to Stryker mutation runs.
// Why: prod config (vitest.config.ts) enables v8 coverage + HTML/JSON reporters
// with 100% thresholds. Stryker re-runs the suite per mutant — collecting and
// writing that coverage on every mutant is the dominant cost on the spike.
// Stryker has its own coverage path (coverageAnalysis: 'perTest') from the dry run.
export default mergeConfig(
  base,
  defineConfig({
  resolve: { conditions: ['source', 'import', 'module', 'node', 'default'] },
    test: {
      coverage: { enabled: false },
      reporters: ['default'],
      pool: 'forks',
      maxWorkers: 1,
      fileParallelism: false,
    },
  }),
);
