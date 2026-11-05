<p align="center">
  <img src="./../../icons/logo.png" alt="Requirement-As-Code logo" width="150px" />
</p>

# @frenchexdev2/requirements-lib

Programmatic facade over the Requirements-as-Code analyzers and application services.

## Role in the workspace

Use this package when an integration needs several RaC capabilities through one dependency. Its files primarily re-export implementations owned by the specialized sibling packages. CLI, editor and language-server integrations can compose these services without depending on Commander or the interactive prompt shell.

The facade retains compatibility imports while resolving name collisions explicitly. For a smaller dependency surface, import the owning package directly.

## Public API

The root barrel exposes selected kernel types, specification DTOs, scanning and compliance functions, trace queries, spec conversion, scaffolding, wizard orchestration, synchronization and versioning services.

Explicit public subpaths include:

- `/analysis`, `/analysis/compliance-core`, `/analysis/compliance-report`.
- `/analysis/test-smells`, `/analysis/behavioral-check`.
- `/ac-suggester`, `/audit-hooks`, `/explore-core`, `/rename-core`, `/toggling`, `/versioning`, `/watch-core`.
- `/schemas/feature-spec.schema.json` and `/schemas/requirement-spec.schema.json`.

Internal filenames are not automatically public subpath exports. Check [package.json](package.json) before using a deep import.

## Example

```ts
import { readFeatures, readRequirements } from '@frenchexdev2/requirements-lib/analysis';

async function loadProjectContracts(projectRoot: string) {
  const [features, requirements] = await Promise.all([
    readFeatures(`${projectRoot}/requirements/features`),
    readRequirements(`${projectRoot}/requirements/requirements`),
  ]);
  return { features, requirements };
}
```

These readers perform filesystem I/O. Many lower-level services instead accept explicit `FileSystem`, `Prompt`, `Logger` or other ports. Choose the appropriate entry point for the host environment rather than assuming every facade function is pure.

The root `parseFeatureSource` is the compliance metadata parser. To parse a full `FeatureSpec`, use [requirements-spec-io/spec-from-source](../requirements-spec-io/src/spec-from-source.ts) through that package's public subpath. Likewise, some kernel types with names that collide with spec DTOs must be imported from `requirements-core` directly.

## Implementation packages

- [scanner](../requirements-scanner/README.md), [compliance](../requirements-compliance/README.md), [trace](../requirements-trace/README.md).
- [test smells](../requirements-test-smells/README.md), [behavioral checks](../requirements-behavioral-check/README.md).
- [spec I/O](../requirements-spec-io/README.md), [scaffolders](../requirements-scaffolders/README.md), [sync](../requirements-sync/README.md).
- [versioning](../requirements-versioning/README.md), [wizards](../requirements-wizards/README.md), [core runtime services](../requirements-core/README.md).

## Verification scope

A facade with no local executable statements has an empty local coverage denominator. Its surface tests and installed-export checks are useful evidence, but a local coverage percentage is not a measurement of the underlying implementations. Their coverage belongs to the owning packages.
## Development and status

This is an unreleased ESM package in the standalone RaC pnpm workspace. Work from the `rac.ts` root with Node.js `^22.22.0 || ^24.0.0 || >=26.0.0` and the pnpm version pinned in the root manifest. Install with `pnpm install --frozen-lockfile`, then build dependencies with `pnpm build`.

Run this package's checks from the workspace root:

```sh
pnpm --filter @frenchexdev2/requirements-lib test
pnpm compliance
```

Coverage gates apply to each configured instrumentation scope. See the [workspace README](../../README.md) for all checks and the [dated qualification report](../../CORRECTIONS-2026-11-03.md) for recorded results and limitations.

## License

See the [FrenchExDev Educational License](../../LICENSE). It permits the educational and evaluation uses stated there; production use requires a separate commercial license.
