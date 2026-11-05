<p align="center">
  <img src="./../../icons/logo.png" alt="Requirement-As-Code logo" width="150px" />
</p>

# @frenchexdev2/requirements-scanner

Static TypeScript AST scanner connecting Feature acceptance criteria to implementation symbols referenced by their tests.

## Role in the workspace

The scanner reads `@FeatureTest(MyFeature)` classes and `@Verifies<MyFeature>('acName')` methods. It resolves the implementation targets referenced by those methods and produces a `Feature × AC → SymbolTarget[]` bindings manifest.

[Compliance](../requirements-compliance/README.md), [trace queries](../requirements-trace/README.md), [test-smell detection](../requirements-test-smells/README.md) and [behavioral mutation checks](../requirements-behavioral-check/README.md) consume this analysis.

## Public API

The root and `/test-bindings-scanner` entry points export:

- `parseTestFile`: parse one source string, including decorated classes, methods, references and warnings.
- `scanTestBindings`: collect test files through a `FileSystem` port and aggregate bindings.
- `aggregateTestBindings`, `sortManifest`, `diffManifests`: compose, stabilize and compare manifests.
- Import/target resolution and helper-reference analysis functions for lower-level integrations.

The scanner handles static imports, supported dynamic imports and references through local or class helpers. A filesystem existence predicate lets it distinguish direct modules from directory barrels. Default implementation scopes are `src/` and `scripts/`.

## Example

```ts
import { scanTestBindings } from '@frenchexdev2/requirements-scanner';
import type { FileSystem } from '@frenchexdev2/requirements-core/ports';

async function scanProject(root: string, fs: FileSystem) {
  return scanTestBindings({
    root,
    testDirs: ['test/unit'],
    classToId: new Map([['PositiveAmount', 'POSITIVE-AMOUNT']]),
    includeScopes: ['src/'],
    fs,
  });
}
```

Read `manifest`, `warnings`, `fileCount`, `methodCount` and `emptyMethods` from the result. `classToId` maps Feature class names to their declared IDs. Supply an adapter for the actual project filesystem; tests can use an in-memory implementation.

## Interpretation

A static reference is an inferred binding. It does not establish that the test ran, that every referenced branch executed or that the assertion would detect a defect. Pair the manifest with execution reports, runtime coverage and, where appropriate, mutation testing.

`@TypeCheckOnly` identifies methods whose absence of implementation targets is intentional. It does not replace execution or compiler evidence.

The scanner uses the classic TypeScript compiler API and declares a TypeScript peer range of `>=5.4 <6`. See [src/test-bindings-scanner.ts](src/test-bindings-scanner.ts) for supported syntax and result types.
## Development and status

Unreleased ESM package in the standalone RaC workspace. From the `rac.ts` root, use Node.js `^22.22.0 || ^24.0.0 || >=26.0.0` and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @frenchexdev2/requirements-scanner test
pnpm compliance
```

See the [workspace README](../../README.md) for checks and the [dated qualification report](../../CORRECTIONS-2026-11-03.md) for measured results and instrumentation limits.

## License

See the [FrenchExDev Educational License](../../LICENSE). Production use requires a separate commercial license under its terms.
