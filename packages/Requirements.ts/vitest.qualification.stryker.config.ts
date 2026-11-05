import { defineConfig, mergeConfig } from 'vitest/config';
import configuration from './vitest.qualification.config.js';

export default defineConfig(async context => {
  const base = typeof configuration === 'function' ? await configuration(context) : await configuration;
  return mergeConfig(base, {
  resolve: { conditions: ['source', 'import', 'module', 'node', 'default'] }, test: { coverage: { enabled: false }, maxWorkers: 1, fileParallelism: false, reporters: ['default'] } });
});
