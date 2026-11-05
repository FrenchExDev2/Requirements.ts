<p align="center">
  <img src="./../../icons/logo.png" alt="Requirement-As-Code logo" width="150px" />
</p>

# @frenchexdev2/requirements-trace

Traceability queries and Mermaid/DOT rendering for Requirement, Feature, AC, test and implementation relationships.

## Role in the workspace

This package turns Feature metadata, inferred symbol bindings and test references into navigable indexes and graphs. It supports both forward queries and reverse impact analysis. The `requirements trace` CLI is the shell around these services.

## Public API

- Root and `/trace-core`: `buildTraceIndex`, file/Feature/test queries, impact, hotspots, fragile Features, FSM links, gaps, matrices and chains, plus formatting functions.
- Root and `/trace-graph`: graph input types, AC binding classification, Mermaid/DOT renderers and the CLI-facing `runTraceGraph` service.

Index queries operate on supplied data. File-loading orchestration may perform I/O; formatter and renderer functions return strings or lines for the caller to deliver.

## Example

```ts
import {
  buildTraceIndex, queryFeatureToFiles, queryImpact,
} from '@frenchexdev2/requirements-trace';
import type { FeatureMeta, TestRef } from '@frenchexdev2/requirements-compliance';
import type { BindingsManifest } from '@frenchexdev2/requirements-scanner';

function inspectChange(
  features: readonly FeatureMeta[],
  manifest: BindingsManifest,
  tests: readonly TestRef[],
) {
  const index = buildTraceIndex(features, manifest, tests);
  return {
    feature: queryFeatureToFiles(index, 'POSITIVE-AMOUNT'),
    impact: queryImpact(index, ['src/amount.ts']),
  };
}
```

Populate the inputs with the compliance readers and scanner for the same project. `renderMermaid(input)` and `renderDot(input)` accept a `TraceGraphInput`, including Requirements and their satisfaction/refinement links.

## CLI integration

From a configured consumer project with the separate `requirements` CLI:

```sh
pnpm exec requirements trace gaps --json
pnpm exec requirements trace matrix POSITIVE-AMOUNT --json
pnpm exec requirements trace chain POSITIVE-AMOUNT rejectsZero
pnpm exec requirements trace graph --format mermaid
pnpm exec requirements trace graph --format dot --output trace.dot
```

## Interpretation

Graph edges describe declared or statically inferred relationships. AC coloring reflects linked test declarations; it is not an individual test-pass verdict. Impact queries identify relationships represented in the supplied index, so dynamic behavior and unmodeled dependencies may remain outside their scope.

See [src/trace-core.ts](src/trace-core.ts), [src/trace-graph.ts](src/trace-graph.ts) and [requirements-compliance](../requirements-compliance/README.md) for the input contracts and evidence boundaries.
## Development and status

Unreleased ESM package in the standalone RaC workspace. From the `rac.ts` root, use Node.js `^22.22.0 || ^24.0.0 || >=26.0.0` and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @frenchexdev2/requirements-trace test
pnpm compliance
```

See the [workspace README](../../README.md) for checks and the [dated qualification report](../../CORRECTIONS-2026-11-03.md) for measured results and instrumentation limits.

## License

See the [FrenchExDev Educational License](../../LICENSE). Production use requires a separate commercial license under its terms.
