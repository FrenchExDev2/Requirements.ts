/**
 * Shared Stryker configuration for workspace packages.
 *
 * Every package's stryker.conf.cjs is three lines:
 *
 *   const preset = require('../../stryker.preset.cjs');
 *   module.exports = preset({ mutate: ['src/**\/*.ts', '!src/**\/*.d.ts'] });
 *
 * Twenty-eight hand-maintained copies would drift; one preset does not. What it
 * encodes is the set of things that have to be right for a run to happen at
 * all — each one learned from a run that failed without them.
 *
 * ## Plugin resolution
 *
 * pnpm keeps @stryker-mutator/* in the virtual store, not in a flat
 * node_modules/@stryker-mutator/. Stryker's default discovery globs the latter,
 * finds nothing, and dies with "Cannot find TestRunner plugin vitest. In fact,
 * no TestRunner plugins were loaded." Resolving from the repo root explicitly
 * is the fix; it also means a package needs no @stryker-mutator devDependency
 * of its own.
 *
 * ## Sandbox size
 *
 * Stryker copies the project into a sandbox and its defaults only skip
 * node_modules / .git / reports. A package that has been built and tested
 * carries dist/, coverage/ and test-results/; on the repo root the same
 * omission copied ~11 GB and exhausted the heap before a single mutant ran.
 *
 * ## A separate vitest config
 *
 * `vitest.config.stryker.ts` (scaffolded alongside) turns coverage off and
 * forces a single fork. Stryker re-runs the suite once per mutant, and
 * re-collecting v8 coverage every time is the dominant cost — measured on the
 * requirements-lib spike.
 *
 * ## Concurrency
 *
 * Read from STRYKER_CONCURRENCY so the test matrix keeps control of total CPU:
 * it runs several packages at once and must not let each one size itself.
 */

const path = require('path');

const repoRoot = path.resolve(__dirname);

/**
 * @param {import('@stryker-mutator/api/core').PartialStrykerOptions} overrides
 * @returns {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
module.exports = function preset(overrides = {}) {
  const concurrency = Number(process.env.STRYKER_CONCURRENCY) || 2;

  // Report destination. The test matrix sets STRYKER_REPORT_DIR so a run's
  // artefacts all land in its dated folder rather than growing a `reports/`
  // beside each package — the same scattering that left 216 stray
  // `test-results/` directories across the workspace. Stryker resolves report
  // paths from the config file and offers no CLI override, so the environment
  // is the only seam. Unset, the local default applies and `npx stryker run`
  // behaves as before.
  const reportDir = (process.env.STRYKER_REPORT_DIR ?? 'reports/mutation').replace(/\\/g, '/');

  return {
    packageManager: 'pnpm',
    testRunner: 'vitest',
    plugins: [require.resolve('@stryker-mutator/vitest-runner', { paths: [repoRoot] })],
    reporters: ['html', 'json', 'clear-text', 'progress'],
    htmlReporter: { fileName: `${reportDir}/index.html` },
    jsonReporter: { fileName: `${reportDir}/mutation-report.json` },

    mutate: ['src/**/*.ts', '!src/**/*.d.ts'],

    vitest: { configFile: 'vitest.config.stryker.ts' },

    // Run mutations through Vitest's transpiler. This deliberately does not
    // establish mutant type correctness; ordinary builds remain a separate check.
    checkers: [],
    disableTypeChecks: 'src/**/*.ts',

    coverageAnalysis: 'perTest',
    ignoreStatic: false,

    // Required policy: every launched mutation campaign must meet 100%.
    thresholds: { high: 100, low: 100, break: 100 },

    incremental: false,
    incrementalFile: '.stryker-incremental.json',

    ignorePatterns: [
      'dist',
      'coverage',
      'test-results',
      'reports',
      '.stryker-tmp*',
      '.stryker-incremental.json',
      '*.tsbuildinfo',
    ],

    timeoutMS: 30000,
    concurrency,

    ...overrides,
  };
};
