import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
const runId=process.env.TEST_RUN_ID || new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);

// Local tests instrument this package's source. The older cross-package tests
// in requirements-lib also exercise its public compiled exports, but their
// lib-only coverage scope does not measure spec-io.
export default defineConfig({
  // The RaC test DSL uses TypeScript legacy decorators, including external fixtures.
  oxc: { decorator: { legacy: true } },
  resolve: {
    conditions: ['source', 'import', 'module', 'node', 'default'],
    alias: [
      { find: /^@frenchexdev2\/requirements-spec-io\/(.+)$/, replacement: fileURLToPath(new URL('./src/', import.meta.url)).replace(/\\/g, '/') + '$1.ts' },
    ],
  },
  test: {
    reporters: ['default', 'json'],
    outputFile: { json: `./test-results/${runId}/tests.json` },
    globals: true,
    environment: 'node',
    include: ['test/unit/**/*.test.ts'],
    pool: 'threads',
    coverage: {
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/*.d.ts'],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: `./test-results/${process.env.TEST_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}/coverage`,
    },
  },
});
