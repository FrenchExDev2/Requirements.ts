<p align="center">
  <img src="./../../icons/logo.png" alt="Requirement-As-Code logo" width="150px" />
</p>

# @frenchexdev2/requirements-shared-kernel

Foundational DSL, decorators, style contracts and external-world ports for the Requirements-as-Code ecosystem. This package has no runtime dependencies.

## Role in the workspace

The shared kernel holds the common language used by both the implementation packages and `@frenchexdev2/requirements-requirements` (Requirements.ts workspace), which declares the ecosystem's own requirements. Keeping these definitions below both layers avoids a dependency cycle.

## Public API

- Root import: `Feature`, `Requirement<S>`, `Priority`, `TestLevel`, `ACResult`, traceability decorators and style interfaces.
- `/types`: specification DTOs, branded primitives, smart constructors and schema-version constants.
- `/ports`: interfaces such as `FileSystem`, `Prompt`, `Logger`, `Clock`, `CommandRunner` and `ToggleProvider`.

The decorators include `@FeatureTest`, `@Verifies`, `@Expects`, `@Exclude`, `@TypeCheckOnly`, `@Satisfies` and `@Refines`. They retain runtime metadata; the analyzers can also read declarations statically.

## Declare a Feature

```ts
import {
  Feature, Priority, type ACResult,
} from '@frenchexdev2/requirements-shared-kernel';

export abstract class ExportInvoices extends Feature {
  readonly id = 'EXPORT-INVOICES';
  readonly title = 'Export invoice line items';
  readonly priority = Priority.High;

  abstract includesEveryLineItem(): ACResult;
}
```

Enable `experimentalDecorators` in the consumer's TypeScript configuration. An AC implementation returns `{ satisfied: boolean, reason?: string }`. `@FeatureTest` integrates with Vitest when its `describe` and `it` globals are available; metadata alone does not execute a test.

Smart constructors are available from the explicit types subpath:

```ts
import { featureId } from '@frenchexdev2/requirements-shared-kernel/types';

const parsed = featureId('EXPORT-INVOICES');
```

Inspect the returned parse result before consuming its value. Brands are compile-time constraints; serialized IDs remain strings.

## Boundaries

The kernel defines the `RequirementStyle` abstraction. Concrete presets live in [requirements-styles](../requirements-styles/README.md). Scanning, coverage analysis, CLI adapters and file generation belong to other packages. Ports describe dependencies; applications supply their adapters.

See [src/index.ts](src/index.ts), [src/types.ts](src/types.ts) and [src/ports/index.ts](src/ports/index.ts) for the export contracts, and the [glossary](../requirements/GLOSSARY.md) for terminology.
## Development and status

This is an unreleased ESM package in the standalone RaC pnpm workspace. Work from the `rac.ts` root with Node.js `^22.22.0 || ^24.0.0 || >=26.0.0` and the pnpm version pinned in the root manifest. Install with `pnpm install --frozen-lockfile`, then build dependencies with `pnpm build`.

Run this package's checks from the workspace root:

```sh
pnpm --filter @frenchexdev2/requirements-shared-kernel test
pnpm compliance
```

Coverage gates apply to each configured instrumentation scope. See the [workspace README](../../README.md) for all checks and the [dated qualification report](../../CORRECTIONS-2026-11-03.md) for recorded results and limitations.

## License

See the [FrenchExDev Educational License](../../LICENSE). It permits the educational and evaluation uses stated there; production use requires a separate commercial license.
