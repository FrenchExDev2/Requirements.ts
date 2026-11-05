<p align="center">
  <img src="./../../icons/logo.png" alt="Requirement-As-Code logo" width="150px" />
</p>

# @frenchexdev2/requirements-versioning

Deterministic specification hashing, version metadata, pins, drift detection and history updates.

## Role in the workspace

This package helps identify whether a Feature or Requirement specification has evolved and whether recorded links still refer to the expected version. Its functions operate on supplied values; hashing uses `node:crypto`, and clock/author inputs are explicit.

## Public API

The root and `/versioning` entry points expose:

- `canonicalize`, `canonicalJson`, `contentHashOf`: stable canonical content and a `sha256:`-prefixed hash.
- `computeVersionInfo`, `applyVersionBump`: derive or apply version metadata from current content and prior metadata.
- `resolvePin`, `detectVersionDrift`: inspect recorded pins and classify stale, evolved or unpinned links.
- `buildBumpHistoryEntry`: appendable history metadata using an injected clock and nonempty reason.

Public types include `VersionInfo`, `VersionPin`, `VersionDrift`, `VersionedSpec`, `Clock` and `HistoryContext`.

## Example

```ts
import {
  contentHashOf, applyVersionBump, type Clock,
} from '@frenchexdev2/requirements-versioning';
import type { Spec } from '@frenchexdev2/requirements-core/types';

function recordInitialVersion(spec: Spec, clock: Clock) {
  const hash = contentHashOf(spec);
  const versioned = applyVersionBump(spec, undefined, clock, {
    author: 'Project maintainer',
    reason: 'Record the initial acceptance contract',
  });
  return { hash, versioned };
}
```

Use the existing `version` metadata as the previous value on subsequent updates. Unchanged semantic content retains its version; changed content advances it. The caller decides where to persist the returned specification.

## Canonicalization rules

Object keys are sorted recursively and arrays retain their order. The fields `$schemaVersion`, `$schema`, `history`, `tracedTo` and `version` are excluded from canonicalization. The filter applies recursively, including nested objects with those names.

This makes hashes insensitive to configured metadata fields, not to every possible cosmetic edit. Changing an array's order or a retained value changes the canonical content.

## Limits

A content hash identifies the canonical representation; it does not authenticate its author or prove approval. Pins and drift reports describe recorded links and metadata. A version bump is not a substitute for reviewing the impact of a changed requirement.

See [src/versioning.ts](src/versioning.ts) for exact pin resolution and drift classifications. The [dated qualification](../../CORRECTIONS-2026-11-03.md) records this package's targeted mutation campaign separately from other packages' configured gates.
## Development and status

Unreleased ESM package in the standalone RaC workspace. From the `rac.ts` root, use Node.js `^22.22.0 || ^24.0.0 || >=26.0.0` and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @frenchexdev2/requirements-versioning test
pnpm compliance
```

See the [workspace README](../../README.md) for checks and the [dated qualification report](../../CORRECTIONS-2026-11-03.md) for measured results and instrumentation limits.

## License

See the [FrenchExDev Educational License](../../LICENSE). Production use requires a separate commercial license under its terms.
