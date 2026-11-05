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
    include: ['test/unit/**/*.test.ts'],
    pool: 'threads',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/bin/**',
        'src/cli/index.ts',
        'src/cli/scenario/**',
        'src/analysis/index.ts',
        'src/ports/**',
        // Kernel + lib re-export shims — real code and tests live in
        // @frenchexdev2/requirements-core and @frenchexdev2/requirements-lib.
        'src/base.ts',
        'src/decorators.ts',
        'src/style.ts',
        'src/analysis/compliance-core.ts',
        'src/analysis/compliance-report.ts',
        'src/analysis/test-bindings-scanner.ts',
        'src/cli/ac-suggester.ts',
        'src/cli/audit-hooks.ts',
        'src/cli/bidi-sync-core.ts',
        'src/cli/explore-core.ts',
        'src/cli/feature-new-core.ts',
        'src/cli/rename-core.ts',
        'src/cli/requirement-core.ts',
        'src/cli/scaffold-core.ts',
        'src/cli/scaffolders/**',
        'src/cli/schema-generate.ts',
        'src/cli/schema-register.ts',
        'src/cli/spec-from-source.ts',
        'src/cli/spec-to-source.ts',
        'src/cli/sync-core.ts',
        'src/cli/toggling.ts',
        'src/cli/trace-core.ts',
        'src/cli/trace-graph.ts',
        'src/cli/types.ts',
        'src/cli/versioning.ts',
        'src/cli/watch-core.ts',
        // Styles shims — real code + tests in @frenchexdev2/requirements-styles.
        'src/styles/**',
      ],
      reporter: ['text', 'html', 'json-summary'],
      // Layout the compliance scanner expects: test-results/<runId>/coverage/coverage-summary.json
      reportsDirectory: `${runDir}/coverage`,
      // Self-dog-fooding: the requirements package enforces 100% coverage on itself.
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
