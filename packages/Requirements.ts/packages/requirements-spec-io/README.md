<p align="center">
  <img src="./../../icons/logo.png" alt="Requirement-As-Code logo" width="150px" />
</p>

# @frenchexdev2/requirements-spec-io

Specification serialization, TypeScript source conversion, JSON Schema support and Feature round-trip synchronization.

## Role in the workspace

This package translates between structured specifications and source declarations. [Scaffolders](../requirements-scaffolders/README.md), [wizards](../requirements-wizards/README.md) and the [requirements CLI](../requirements/README.md) use it to generate source and validate specifications.

The `Spec`, `FeatureSpec` and `RequirementSpec` DTOs are defined in `@frenchexdev2/requirements-core/types`.

## Public API

The root aggregates five public subpaths:

- `/spec-to-source`: `generateFeatureSource`, `generateRequirementSource`, `specToJson` and `featureSpecToMeta`.
- `/spec-from-source`: `parseFeatureSource`, `assertFeatureSourceCompiles` and `ParseFeatureSourceError`.
- `/schema-generate`: schema generation, default schema location, schema filenames/references and `validateSpec`.
- `/schema-register`: build and merge VS Code `json.schemas` settings, with print-only and conflict/force modes.
- `/bidi-sync-core`: Feature TS/JSON conversion, divergence detection, round-trip checks and synchronization.

Schema generation uses `ts-json-schema-generator`; runtime validation uses Ajv. The package includes its schemas in distribution archives.

## Example: generate, parse and validate a Feature

```ts
import {
  generateFeatureSource, parseFeatureSource, validateSpec,
} from '@frenchexdev2/requirements-spec-io';
import type { FeatureSpec } from '@frenchexdev2/requirements-core/types';

async function checkRoundTrip(spec: FeatureSpec) {
  const source = generateFeatureSource(spec);
  const parsed = parseFeatureSource(source, 'feature.ts');
  const validation = await validateSpec(parsed);
  return { source, parsed, validation };
}
```

This example operates on an already constructed spec. Check validation results before persisting or consuming externally supplied data.

## Bidirectional synchronization

`syncBidirectional(paths, fs, options)` takes explicit TS/JSON paths, an injected `FileSystem` and a direction (`ts-to-json` or `json-to-ts`). A marker file tracks the last synchronized state; conflicting edits can raise `AmbiguousMergeError`. Invalid Feature source can raise `SyncRefusedCompileError`. `force` is an explicit override of ambiguous-merge detection.

The parser and bidirectional helpers concern the supported **Feature** declaration format. Requirement source emission is available, but this is not a general TypeScript-to-JSON serializer or a lossless editor for arbitrary user-authored TypeScript. Regeneration may normalize formatting and supported declaration structure.

## Related services

[requirements-sync](../requirements-sync/README.md) handles write-plan preview/apply operations. [requirements-versioning](../requirements-versioning/README.md) provides semantic version metadata and pins. The synchronization `contentHash` helper hashes source text for markers; it has a different purpose from semantic `contentHashOf` in the versioning package.

Use `requirements schema register --print` through the separate CLI to preview editor settings without writing them. See [src/schema-register.ts](src/schema-register.ts) for merge/conflict results and [schemas](schemas/) for the shipped validation artifacts.
## Development and status

Unreleased ESM package in the standalone RaC workspace. From the `rac.ts` root, use Node.js `^22.22.0 || ^24.0.0 || >=26.0.0` and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @frenchexdev2/requirements-spec-io test
pnpm compliance
```

See the [workspace README](../../README.md) for all checks and the [dated qualification report](../../CORRECTIONS-2026-11-03.md) for measured results and their scope.

## License

See the [FrenchExDev Educational License](../../LICENSE). Production use requires a separate commercial license under its terms.
