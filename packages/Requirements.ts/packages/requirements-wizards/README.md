<p align="center">
  <img src="./../../icons/logo.png" alt="Requirement-As-Code logo" width="150px" />
</p>

# @frenchexdev2/requirements-wizards

Port-driven creation flows for Requirements and Features, plus generation/preview/apply orchestration.

## Role in the workspace

These services implement the interactive workflow behind `requirements feature new` and `requirements requirement new`. They depend on `Prompt`, `FileSystem`, `Logger` and optional editor/VCS adapters rather than Commander or a concrete prompt library.

A host can reuse the flows in a CLI or editor integration by supplying those adapters.

## Public API

- Root and `/feature-new-core`: `runFeatureWizard` and its context/options contracts.
- Root and `/requirement-core`: `runRequirementWizard`, seeding from a Feature, satisfaction indexes, orphan queries and trace-chain helpers.
- Root and `/orchestrate-spec-wizard`: source/scaffold planning, coverage-delta preview and `orchestrateSpecWizard`.
- Root: AC-name suggestions and corpus/ranking helpers from `ac-suggester`.

The root exports AC suggestions, but `/ac-suggester` is not a declared subpath of this package. Use the root import.

## Example: preview a specification workflow

```ts
import {
  orchestrateSpecWizard, type OrchestrateSpecWizardPorts,
} from '@frenchexdev2/requirements-wizards';
import type { Spec } from '@frenchexdev2/requirements-core/types';
import type { WritePlanConfig } from '@frenchexdev2/requirements-scaffolders';

async function previewSpec(
  spec: Spec,
  root: string,
  config: WritePlanConfig,
  ports: OrchestrateSpecWizardPorts,
) {
  return orchestrateSpecWizard(spec, root, config, ports, { dryRun: true });
}
```

Create a spec with `runFeatureWizard(context, seed?, options?)` or `runRequirementWizard(context, seed?, options?)`, then pass it to the orchestrator. Style templates seed vocabulary-specific defaults. Requirement creation supports structured statements, rationale, sources, fit criteria and links to Features.

The orchestration result records the plan, applied/skipped paths, cancellation, optional editor opening and a Feature coverage delta. Requirement specs have no AC coverage delta.

## Persistence and safeguards

The orchestrator combines [spec I/O](../requirements-spec-io/README.md), [scaffolders](../requirements-scaffolders/README.md), [sync](../requirements-sync/README.md) and [versioning](../requirements-versioning/README.md).

`dryRun` previews changes; `noTest` omits test-starter generation. A supplied VCS port enables refusal of overwrites to existing untracked files. Omitting that port disables that check. All writes remain subject to sync's allowed path patterns.

Runtime satisfaction indexes depend on the declarations already loaded into the process. Spec-based queries use the supplied specs. Neither should be treated as an implicit scan of every source file in an application.

See [src/feature-new-core.ts](src/feature-new-core.ts), [src/requirement-core.ts](src/requirement-core.ts) and [src/orchestrate-spec-wizard.ts](src/orchestrate-spec-wizard.ts) for the context and port contracts. The [CLI README](../requirements/README.md) covers the user-facing commands.
## Development and status

Unreleased ESM package in the standalone RaC workspace. From the `rac.ts` root, use Node.js `^22.22.0 || ^24.0.0 || >=26.0.0` and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @frenchexdev2/requirements-wizards test
pnpm compliance
```

See the [workspace README](../../README.md) for all checks and the [dated qualification report](../../CORRECTIONS-2026-11-03.md) for measured results and their scope.

## License

See the [FrenchExDev Educational License](../../LICENSE). Production use requires a separate commercial license under its terms.
