// @frenchexdev2/requirements-core — runtime impl tier (codemods, watch, audit, toggling, explore).
// The kernel (base classes, decorators, RequirementStyle, branded IDs, ports) lives in
// @frenchexdev2/requirements-shared-kernel. This entrypoint re-exports the kernel surface
// for back-compat with the 12+ packages that import from '@frenchexdev2/requirements-core'.

export * from '@frenchexdev2/requirements-shared-kernel';
