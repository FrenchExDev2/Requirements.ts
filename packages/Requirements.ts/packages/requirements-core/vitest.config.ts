import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const runId = process.env.TEST_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const runDir = `./test-results/${runId}`;

const src = (p: string) => resolve(__dirname, 'src', p);

// requirements-core hosts the kernel (base classes, decorators, style
// abstractions, ports, types, id-naming) AND tier-2 utilities (audit-hooks,
// toggling, explore-core, rename-core, watch-core). Tests cover everything in
// src/. Self-Features describing the impl live in @frenchexdev2/requirements-requirements
// (vocabulary, impl-less) and are imported by these tests.
//
// Self-aliases route self-imports of @frenchexdev2/requirements-core/<sub> to
// src/, so v8 coverage measures the source files (not the compiled dist).
export default defineConfig({
  // The RaC test DSL uses TypeScript legacy decorators, including external fixtures.
  oxc: { decorator: { legacy: true } },
  resolve: {
    conditions: ['source', 'import', 'module', 'node', 'default'],
    alias: {
      '@frenchexdev2/requirements-core/audit-hooks': src('audit-hooks.ts'),
      '@frenchexdev2/requirements-core/toggling': src('toggling.ts'),
      '@frenchexdev2/requirements-core/explore-core': src('explore-core.ts'),
      '@frenchexdev2/requirements-core/rename-core': src('rename-core.ts'),
      '@frenchexdev2/requirements-core/watch-core': src('watch-core.ts'),
      '@frenchexdev2/requirements-core/ports': src('ports/index.ts'),
      '@frenchexdev2/requirements-core/types': src('types.ts'),
      '@frenchexdev2/requirements-core': src('index.ts'),
    },
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
      exclude: [
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/ports/**',
        // Requirement declarations are abstract spec data (typed properties only).
        'src/req-*.ts',
      ],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: `${runDir}/coverage`,
    },
  },
});
