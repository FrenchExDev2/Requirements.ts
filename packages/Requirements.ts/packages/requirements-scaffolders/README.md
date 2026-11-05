<p align="center">
  <img src="./../../icons/logo.png" alt="Requirement-As-Code logo" width="150px" />
</p>

# @frenchexdev2/requirements-scaffolders

Extensible test-starter registry and write planning for Feature acceptance criteria.

## Role in the workspace

This package identifies missing AC/test-level bindings and generates starting points for tests. The [wizards](../requirements-wizards/README.md) compose its output with source generation and [sync](../requirements-sync/README.md) previews. The CLI exposes unit and end-to-end scaffolding commands.

## Built-in scaffolders

- `unit`: Vitest tests.
- `functional`: Vitest integration-style tests.
- `e2e`: Playwright tests.
- `a11y`: Playwright with axe accessibility checks.
- `i18n`: Playwright locale-oriented checks.
- `visual`: Playwright screenshot assertions.
- `perf`: timing-budget starters using `performance.now()`.

Templates bind test classes and methods through `@FeatureTest` and `@Verifies`. Consumer projects must install/configure their chosen runner and replace placeholders with meaningful implementation assertions.

## Public API

- Root and `/scaffold-core`: `findUncoveredACs`, `buildScaffoldResult`, `planWrites`, `generateScaffoldForSpec` and stub-template helpers.
- `/port`: the `TestScaffolder` contract (`level`, `defaultDir`, `filenameSuffix`, `description`, `generate`).
- `/registry`: `createRegistry`, `DEFAULT_REGISTRY` and `BUILT_IN_SCAFFOLDERS`.

The root barrel also exports the registry, scaffolder contract and built-in strategies.

## Example

```ts
import {
  createRegistry, generateScaffoldForSpec,
} from '@frenchexdev2/requirements-scaffolders';
import type { FeatureSpec } from '@frenchexdev2/requirements-core/types';

function unitStarter(spec: FeatureSpec): string {
  const registry = createRegistry();
  return generateScaffoldForSpec(spec, 'unit', registry);
}
```

`generateScaffoldForSpec` selects ACs whose `expects` includes the requested level and returns an empty string if no scaffolder is registered. It does not inspect the entire project to determine which tests already exist. Use the uncovered-AC analysis and existing test references when planning only missing bindings.

`planWrites` returns proposed paths. `WritePlanConfig.testDirsByLevel` controls per-level directories; the caller remains responsible for persistence. Sync's write allowlist is narrower than the full set of customizable scaffolder destinations.

## Extending the registry

Implement `TestScaffolder` and register it by test level using a fresh `createRegistry()` instance. This can replace a built-in strategy without editing the generator. Keep source generation separate from test execution and from assertions about coverage.

See [src/scaffold-core.ts](src/scaffold-core.ts), [the registry](src/scaffolders/registry.ts) and [the scaffolder port](src/scaffolders/port.ts) for the contracts. [ts-codegen-pipeline](../ts-codegen-pipeline/README.md) provides a separate managed-file generator that can refresh missing-AC stubs over repeated runs.
## Development and status

Unreleased ESM package in the standalone RaC workspace. From the `rac.ts` root, use Node.js `^22.22.0 || ^24.0.0 || >=26.0.0` and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @frenchexdev2/requirements-scaffolders test
pnpm compliance
```

See the [workspace README](../../README.md) for all checks and the [dated qualification report](../../CORRECTIONS-2026-11-03.md) for measured results and their scope.

## License

See the [FrenchExDev Educational License](../../LICENSE). Production use requires a separate commercial license under its terms.
