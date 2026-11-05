import { defineConfig } from 'vitest/config';

const runId = process.env.TEST_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const runDir = `./test-results/${runId}`;

export default defineConfig({
  resolve: { conditions: ['source', 'import', 'module', 'node', 'default'] },
  // The RaC test DSL uses TypeScript legacy decorators, including external fixtures.
  oxc: { decorator: { legacy: true } },
  test: {
    reporters: ['default', 'json'],
    outputFile: { json: `./test-results/${runId}/tests.json` },
    globals: true,
    environment: 'node',
    include: ['test/unit/**/*.test.ts', 'test/integration/**/*.test.ts'],
    pool: 'threads',
    // Evidence fault injection performs real filesystem I/O under concurrent campaigns.
    testTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/index.ts',
        // Requirement declarations are abstract spec data (typed properties only).
        'src/req-*.ts',
      ],
      reporter: ['text', 'html', 'json-summary', 'json'],
      reportsDirectory: `${runDir}/coverage`,
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
