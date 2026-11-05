/**
 * Stryker spike config — scoped to ONE file × ONE test file.
 * Goal: validate compat decorators × vitest-runner × experimentalDecorators
 * before designing the full `requirements behavioral-check` mode.
 *
 * Invoked FROM this package directory (packages/requirements-lib/):
 *   cd packages/requirements-lib && npx stryker run stryker.conf.cjs
 * → cwd = this package → sandbox limited to this package only.
 *
 * Plugin resolution: pnpm hoists @stryker-mutator/* to the monorepo root
 * node_modules/, not this package's. We resolve them via require.resolve
 * with paths=[repoRoot] to bypass Stryker's default plugin discovery.
 *
 * Plans:
 *   - Spike origin:  ~/.claude/plans/dis-moi-dans-les-serene-wand.md
 *   - This tuning:   ~/.claude/plans/comment-optimiser-stryker-js-cryptic-fog.md
 */
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
module.exports = {
  packageManager: 'pnpm',
  reporters: ['clear-text', 'progress'],
  testRunner: 'vitest',
  plugins: [
    require.resolve('@stryker-mutator/vitest-runner', { paths: [repoRoot] }),
  ],
  vitest: {
    configFile: 'vitest.config.stryker.ts',
  },
  mutate: ['src/analysis/test-bindings-scanner.ts'],
  testFiles: ['test/unit/test-bindings-scanner.parse.test.ts'],
  coverageAnalysis: 'perTest',
  checkers: [],
  thresholds: { high: 100, low: 100, break: 100 },
  // Vitest forced to singleFork in vitest.config.stryker.ts → safe to raise.
  // Keep modest; bump after measuring on this machine.
  concurrency: 2,
  timeoutMS: 30000,
  // Keep sandbox + its node_modules between runs (saves pnpm install).
  // Delete .stryker-tmp-spike/ manually if package.json deps change.
  cleanTempDir: false,
  // Skip mutants inside static / top-level init (decorators, top-level exports)
  // that run once at module load — typically trivial-killed or trivial-survived.
  ignoreStatic: true,
  // Incremental: per-mutant verdicts cached; subsequent runs only retest diffs.
  incremental: true,
  incrementalFile: '.stryker-incremental.json',
  disableTypeChecks: 'src/**/*.{ts,tsx}',
  tempDirName: '.stryker-tmp-spike',
  ignorePatterns: [
    'dist',
    'coverage',
    'test-results',
    '.stryker-tmp-spike',
    '.stryker-incremental.json',
    '*.tsbuildinfo',
    // NOTE: do NOT exclude `requirements/`. Some tests (trace-graph.test.ts,
    // self-feature corpus tests) load Feature descriptors from there at runtime.
  ],
};
