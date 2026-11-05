/** One complete source campaign; declarations, static initialization and executable barrels are included. */
const preset = require('./stryker.preset.cjs');
module.exports = preset({
  mutate: ['packages/*/src/**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}', 'packages/*/bin/**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}', 'scripts/**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}', '!**/*.d.ts', '!**/*.d.mts', '!**/*.d.cts'],
  vitest: { configFile: 'vitest.qualification.stryker.config.ts' },
  testFiles: ['packages/*/test/**/*.test.ts', 'test/integration/**/*.test.ts'],
  ignoreStatic: false,
  incremental: false,
});
