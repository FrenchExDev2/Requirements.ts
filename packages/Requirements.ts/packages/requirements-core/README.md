<p align="center">
  <img src="./../../icons/logo.png" alt="Requirement-As-Code logo" width="150px" />
</p>

# @frenchexdev2/requirements-core

Shared DSL compatibility surface and runtime services for Requirements-as-Code.

## Role in the workspace

The root export forwards the foundational API from [requirements-shared-kernel](../requirements-shared-kernel/README.md). Runtime services are exposed through dedicated subpaths. Existing consumers can keep their core imports while the shared declarations remain in the dependency-free kernel.

## Public API

- Root: `Feature`, `Requirement`, decorators, priority/test-level enums and style abstractions.
- `/types` and `/ports`: spec DTOs, smart constructors and adapter interfaces.
- `/audit-hooks`: `Reviewed`, `ApprovedBy`, `SignedOff`, `SignedOffAc`, signature-shape checks and history appending.
- `/toggling`: gate decorators, toggle resolution, date availability and percentage rollout helpers.
- `/rename-core`: Feature, Requirement and AC rename operations with preview and validation guards.
- `/watch-core`: file filtering, debouncing and compliance snapshots/deltas through injected dependencies.
- `/explore-core`: trace graph construction, navigation state and rendering helpers for an interactive shell.

These runtime services are subpath APIs; the root barrel does not export every helper.

## Example: a toggle provider

```ts
import { Feature, Priority } from '@frenchexdev2/requirements-core';
import { createStubToggleProvider } from '@frenchexdev2/requirements-core/toggling';

export abstract class NewCheckout extends Feature {
  readonly id = 'NEW-CHECKOUT';
  readonly title = 'Offer the new checkout';
  readonly priority = Priority.Medium;
}

const toggles = createStubToggleProvider({ 'new-checkout': true });
```

Use `experimentalDecorators: true` when declaring decorated Features or tests. Applications supply filesystem, clock, prompt, scheduler and other ports required by the selected service.

## Boundaries

Runtime dependencies include the shared kernel, `diff` and `ts-morph`; the ecosystem's declaration package is a development dependency. Audit hooks record declared review/sign-off metadata and check its shape. They do not authenticate a reviewer or verify a cryptographic signature.

The user-facing terminal and CLI adapters live in [requirements](../requirements/README.md). Specialized scanners, compliance reports and styles have their own packages.

See [src/index.ts](src/index.ts), [package.json](package.json) and the [kernel README](../requirements-shared-kernel/README.md) for the exact export boundaries.
## Development and status

This is an unreleased ESM package in the standalone RaC pnpm workspace. Work from the `rac.ts` root with Node.js `^22.22.0 || ^24.0.0 || >=26.0.0` and the pnpm version pinned in the root manifest. Install with `pnpm install --frozen-lockfile`, then build dependencies with `pnpm build`.

Run this package's checks from the workspace root:

```sh
pnpm --filter @frenchexdev2/requirements-core test
pnpm compliance
```

Coverage gates apply to each configured instrumentation scope. See the [workspace README](../../README.md) for all checks and the [dated qualification report](../../CORRECTIONS-2026-11-03.md) for recorded results and limitations.

## License

See the [FrenchExDev Educational License](../../LICENSE). It permits the educational and evaluation uses stated there; production use requires a separate commercial license.
