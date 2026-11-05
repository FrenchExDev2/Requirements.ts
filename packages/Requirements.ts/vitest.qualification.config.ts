import { defineConfig } from 'vitest/config';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/** Qualify source implementations, including imports through workspace package facades. */
export default defineConfig(async () => {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const alias: { find: string; replacement: string }[] = [];
  // The workspace root does not directly depend on Ajv. Resolve the same owner
  // for source imports and vi.doMock('ajv') in cross-package contract suites.
  alias.push({ find: 'ajv', replacement: createRequire(resolve(root, 'packages/requirements-spec-io/package.json')).resolve('ajv') });
  for (const entry of await readdir(resolve(root, 'packages'), { withFileTypes: true })) if (entry.isDirectory()) {
    const directory = resolve(root, 'packages', entry.name);
    const manifest = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
    for (const [key, value] of Object.entries(manifest.exports ?? {})) {
      const target = typeof value === 'string' ? value : (value as { import?: string; default?: string }).import ?? (value as { default?: string }).default;
      if (target) alias.push({ find: manifest.name + (key === '.' ? '' : key.slice(1)), replacement: resolve(directory, target.replace(/^\.\/dist\//, 'src/').replace(/\.js$/, '.ts')) });
    }
  }
  alias.sort((a, b) => b.find.length - a.find.length);
  const runId = process.env.TEST_RUN_ID || 'qualification';
  return defineConfig({
    resolve: {
    conditions: ['source', 'import', 'module', 'node', 'default'], alias }, oxc: { decorator: { legacy: true } },
    test: {
      globals: true, environment: 'node',
      setupFiles: ['test/support/qualification-assertions.ts'],
      include: ['packages/*/test/**/*.test.ts', 'test/integration/**/*.test.ts'],
      // The initial 10,000-input filesystem fuzz targets require their full budget.
      maxWorkers: 2, testTimeout: process.env.QUALIFICATION_FULL === '1' ? 3_600_000 : 120_000,
      reporters: ['default', 'json'], outputFile: { json: `test-results/${runId}/qualification-tests.json` },
      coverage: {
        provider: 'v8', include: ['packages/*/src/**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}', 'packages/*/bin/**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}', 'scripts/**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}'],
        exclude: ['**/*.d.ts', '**/*.d.mts', '**/*.d.cts'], reportsDirectory: `test-results/${runId}/coverage`,
        reportOnFailure: true,
        reporter: ['text', 'html', 'json-summary', 'json'],
        thresholds: { perFile: true, lines: 100, branches: 100, functions: 100, statements: 100 },
      },
    },
  });
});
