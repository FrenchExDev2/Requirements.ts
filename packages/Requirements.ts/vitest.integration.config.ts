import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const runId = process.env.TEST_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

export default defineConfig({
  resolve: { conditions: ['source', 'import', 'module', 'node', 'default'] },
  oxc: { decorator: { legacy: true } },
  test: {
    // Each native Vitest process owns its cache; concurrent invalidation must not remove another run's files.
    fsModuleCachePath: fileURLToPath(new URL(`./node_modules/.vitest-cache/${runId}`, import.meta.url)),
    globals: true,
    reporters: ['default', 'json'],
    outputFile: { json: `test-results/${process.env.TEST_RUN_ID || 'integration'}/integration-tests.json` },
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 60_000,
    maxWorkers: 1,
  },
});
