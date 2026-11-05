// Re-export shim — decorators live in @frenchexdev2/requirements-core.
// Kept here so internal relative imports (`from '../decorators'`, `from './decorators.js'`) keep working.
// Re-exporting from the kernel ensures the decorator runtime registry is the SAME module instance
// across kernel consumers and this package (no duplicate registries).
export * from '@frenchexdev2/requirements-core';
