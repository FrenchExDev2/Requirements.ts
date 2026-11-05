import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const runId = process.env.TEST_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const runDir = `./test-results/${runId}`;

export default defineConfig({
  resolve: { conditions: ['source', 'import', 'module', 'node', 'default'] },
  // The RaC test DSL uses TypeScript legacy decorators, including external fixtures.
  oxc: { decorator: { legacy: true } },
  test: {
    // Each native Vitest process owns its cache; concurrent invalidation must not remove another run's files.
    fsModuleCachePath: fileURLToPath(new URL(`./node_modules/.vitest-cache/${runId}`, import.meta.url)),
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
        'src/**/*.d.ts',
        'src/**/index.ts',
        // explore-core.test.ts lives in @frenchexdev2/requirements (wrapper) because
        // it also exercises explore-shell.ts (the TTY implementation stays there).
        'src/explore-core.ts',
      ],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: `${runDir}/coverage`,
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
