<p align="center">
  <img src="./../../icons/logo.png" alt="Requirement-As-Code logo" width="150px" />
</p>

# @frenchexdev2/requirements-requirements

Requirements and Feature declarations describing the Requirements-as-Code tooling itself.

## Role in the workspace

This package is the ecosystem's domain vocabulary. It contains the WHY and WHAT contracts that implementation packages satisfy and their tests verify. It depends on [requirements-shared-kernel](../requirements-shared-kernel/README.md), allowing infrastructure and analyzers to consume these contracts without a circular dependency.

Declarations cover the base DSL, decorators, styles, scanner, compliance, traceability, schema tooling, scaffolding, synchronization, versioning, audit hooks, toggling, wizards and developer workflows. The barrel is [src/index.ts](src/index.ts).

## Example

```ts
import { SmokeFeature } from '@frenchexdev2/requirements-requirements';

// Import the exported Feature contract in the package that implements its tests.
// Read its declared AC methods before adding @FeatureTest/@Verifies bindings.
const contract = SmokeFeature;
```

The root export exposes the declaration classes. Implementations live in their owning sibling packages, and a consumer application's business Requirements should live in that application's own repository.

## What the declarations establish

Requirement classes express intent, rationale, acceptance conditions and provenance. Feature classes express the expected behavior and AC methods. `@Satisfies` and `@Refines` encode links for the tooling to inspect.

Declaring a Feature does not establish that it is implemented or that its tests passed. The workspace compliance pipeline reconciles declarations with test evidence separately. Metadata tests in this package check declaration consistency; they do not validate the business relevance of every requirement.

See the [main DSL README](../requirements/README.md) for the complete traceability chain and [requirements-compliance](../requirements-compliance/README.md) for analysis.
## Development and status

This is an unreleased ESM package in the standalone RaC pnpm workspace. Work from the `rac.ts` root with Node.js `^22.22.0 || ^24.0.0 || >=26.0.0` and the pnpm version pinned in the root manifest. Install with `pnpm install --frozen-lockfile`, then build dependencies with `pnpm build`.

Run this package's checks from the workspace root:

```sh
pnpm --filter @frenchexdev2/requirements-requirements test
pnpm compliance
```

Coverage gates apply to each configured instrumentation scope. See the [workspace README](../../README.md) for all checks and the [dated qualification report](../../CORRECTIONS-2026-11-03.md) for recorded results and limitations.

## License

See the [FrenchExDev Educational License](../../LICENSE). It permits the educational and evaluation uses stated there; production use requires a separate commercial license.
