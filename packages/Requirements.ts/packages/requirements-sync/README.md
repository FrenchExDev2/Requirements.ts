<p align="center">
  <img src="./../../icons/logo.png" alt="Requirement-As-Code logo" width="150px" />
</p>

# @frenchexdev2/requirements-sync

Preview and apply generated specification files through explicit filesystem and prompt ports.

## Role in the workspace

This package compares proposed file contents with disk, renders unified diffs and applies a chosen plan. It is the write-plan service used by the [wizards](../requirements-wizards/README.md) and the [requirements CLI](../requirements/README.md). Source generation and schema validation belong to [requirements-spec-io](../requirements-spec-io/README.md).

## Public API

The root and `/sync-core` entry points export:

- `loadSpecFromJsonPath`: read and parse JSON through `FileSystem`.
- `diffSpecToDisk`: build a `SyncPlan` containing create, modified and unchanged entries.
- `renderSyncEntry`, `renderSyncPlan`: produce colored unified diff strings.
- `applySyncPlan`: apply in `all`, `per-file` or `dry-run` mode.
- `WRITABLE_PATTERNS`, `RefusedWriteError`: the allowed write paths and rejection type.

`SyncPlan`, `SyncEntry`, `Spec` and related DTOs are available from `@frenchexdev2/requirements-core/types`.

## Example: preview without writing

```ts
import {
  diffSpecToDisk, renderSyncPlan, applySyncPlan,
} from '@frenchexdev2/requirements-sync';
import type { Spec } from '@frenchexdev2/requirements-core/types';
import type { FileSystem } from '@frenchexdev2/requirements-core/ports';

async function preview(
  spec: Spec,
  proposed: ReadonlyMap<string, string>,
  fs: FileSystem,
) {
  const plan = await diffSpecToDisk(spec, proposed, fs);
  const diff = renderSyncPlan(plan);
  const result = await applySyncPlan(plan, fs, { mode: 'dry-run' });
  return { plan, diff, result };
}
```

The caller supplies proposed source/spec/scaffold contents. `per-file` mode additionally needs a `Prompt` adapter. Inspect `applied`, `skipped` and `cancelled` in the result.

## Write boundaries

The apply step allows these path families:

- `requirements/features/**/*.ts`.
- `requirements/requirements/**/*.ts`.
- `requirements/**/*.spec.json`.
- `test/unit/**/*-scaffold.test.ts`, `test/unit/**/*-scaffold.spec.ts` and the corresponding `test/e2e/` paths.

Backslashes are normalized; `..` segments and NUL characters are refused. Arbitrary handwritten test files and other paths are outside the allowlist. Custom scaffold output locations must also satisfy these guards before they can be applied by this service.

The checks are lexical path rules, not an operating-system sandbox. The supplied filesystem adapter remains responsible for its root and filesystem semantics.

## Limits

`loadSpecFromJsonPath` parses JSON without schema validation; call `validateSpec` from spec I/O when needed. Rendered diffs contain ANSI colors even outside an interactive terminal. Applying multiple files is not a transaction: review and preserve user-authored changes before choosing a write mode.

See [src/sync-core.ts](src/sync-core.ts) for the exact patterns and apply behavior. Feature TS/JSON round-trip conflict detection is a separate [spec I/O](../requirements-spec-io/README.md) capability.
## Development and status

Unreleased ESM package in the standalone RaC workspace. From the `rac.ts` root, use Node.js `^22.22.0 || ^24.0.0 || >=26.0.0` and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @frenchexdev2/requirements-sync test
pnpm compliance
```

See the [workspace README](../../README.md) for all checks and the [dated qualification report](../../CORRECTIONS-2026-11-03.md) for measured results and their scope.

## License

See the [FrenchExDev Educational License](../../LICENSE). Production use requires a separate commercial license under its terms.
