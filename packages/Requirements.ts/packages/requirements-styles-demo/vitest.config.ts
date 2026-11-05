import { defineConfig } from 'vitest/config';

const runId = process.env.TEST_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const runDir = `./test-results/${runId}`;

export default defineConfig({
  resolve: { conditions: ['source', 'import', 'module', 'node', 'default'] },
  // Self-Feature files outside tsconfig's include set still use legacy decorators.
  oxc: { decorator: { legacy: true } },
  test: {
    reporters: ['default', 'json'],
    outputFile: { json: `./test-results/${runId}/tests.json` },
    globals: true,
    environment: 'node',
    include: ['test/unit/**/*.test.ts'],
    pool: 'threads',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        // Interfaces and type aliases emit no executable application code.
        'src/types.ts',
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/bin/**',
      ],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: `${runDir}/coverage`,
      // Enforce the observed local baseline; future changes may raise these floors.
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
