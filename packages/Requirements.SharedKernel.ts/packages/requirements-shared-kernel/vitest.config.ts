import { defineConfig } from 'vitest/config';
const runId=process.env.TEST_RUN_ID || new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
export default defineConfig({
  oxc: { decorator: { legacy: true } },
  resolve: {
    conditions: ['source', 'import', 'module', 'node', 'default'],
  },
  test: {
    reporters: ['default', 'json'],
    outputFile: { json: `./test-results/${runId}/tests.json` },
    globals: true,
    include: ['test/unit/**/*.test.ts'],
    coverage: {
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
      provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/index.ts','src/ports/**','src/style.ts'],
      reporter: ['text','html','json-summary'], reportsDirectory: `test-results/${runId}/coverage`,
    },
  },
});
