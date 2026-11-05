import { defineConfig } from 'vitest/config';

const runId=process.env.TEST_RUN_ID || new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
export default defineConfig({
  resolve: { conditions: ['source', 'import', 'module', 'node', 'default'] },
  oxc: { decorator: { legacy: true } },
  test: {
    reporters: ['default','json'],
    outputFile: { json: `./test-results/${runId}/smoke-tests.json` },
    globals: true,
    environment: 'node',
    include: ['test/smoke/**/*.test.ts'],
    pool: 'threads',
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
