<p align="center">
  <img src="./../../icons/logo.png" alt="Requirement-As-Code logo" width="150px" />
</p>

# @frenchexdev2/requirements-styles

Five built-in `RequirementStyle` presets and an extensible style registry.

## Role in the workspace

A Style supplies a project's requirements vocabulary and rules: kinds, lifecycle states, risk taxonomy, statement patterns, provenance slots, validators, templates, reporters and fit-criterion adapters. The abstraction lives in [requirements-shared-kernel](../requirements-shared-kernel/README.md); this package supplies concrete presets.

## Presets

- **DefaultStyle**: general software requirements, EARS statements and structured rationale/fit criteria. [Pitch and examples](docs/pitches/default.md).
- **IndustrialStyle**: process control, safety and OT security vocabulary, approval stages and domain-specific templates. [Pitch and examples](docs/pitches/industrial.md).
- **LeanStyle**: observed problems, kaizen hypotheses and A3/PDCA workflows. [Pitch and examples](docs/pitches/lean.md).
- **AgileStyle**: stories, epics, spikes, Given/When/Then statements and backlog-oriented validation. [Pitch and examples](docs/pitches/agile.md).
- **KanbanStyle**: classes of service, delay harm, flow-related sources and commitments. [Pitch and examples](docs/pitches/kanban.md).

These presets encode selected vocabulary and validation rules inspired by their domains. They do not establish certification or comprehensive compliance with the standards discussed in the pitches.

## Example

```ts
import {
  DefaultStyle, KanbanStyle, createStyleRegistry,
} from '@frenchexdev2/requirements-styles';
import type { Requirement } from '@frenchexdev2/requirements-core';

const registry = createStyleRegistry([DefaultStyle, KanbanStyle]);
const kanban = registry.get(KanbanStyle.id);
const availableStyles = registry.list();

type KanbanRequirement = Requirement<typeof KanbanStyle>;
```

The root exports all five presets, their associated exports and the registry. Individual entry points are `/default`, `/industrial`, `/lean`, `/agile`, `/kanban` and `/registry`.

`createStyleRegistry()` starts with the built-ins by default. `get(id)`, `list()` and `register(style)` support discovery and custom styles; registering the same ID replaces its value while retaining its position. A fresh registry avoids sharing mutable registration state through `DEFAULT_STYLE_REGISTRY`.

Preset IDs retain the historical `@frenchexdev2/requirements/styles/...` identifiers. Use the exported `style.id` when looking up a registry entry; a module import path and a registry ID serve different purposes.

## Custom styles

Follow the [creation guide](../requirements/docs/HOW-TO-CREATE-YOUR-STYLE.md) and [testing guide](../requirements/docs/HOW-TO-TEST-YOUR-STYLE.md). Test vocabulary invariants, validator acceptance/rejection paths, template consistency and reporter output independently.

The guides and pitches include historical import paths, coverage figures and proposed integrations. Current exports are defined by [package.json](package.json) and [src/index.ts](src/index.ts). The separate [scenario player](../requirements-styles-demo/README.md) demonstrates the presets through `rsd`.
## Development and status

This is an unreleased ESM package in the standalone RaC pnpm workspace. Work from the `rac.ts` root with Node.js `^22.22.0 || ^24.0.0 || >=26.0.0` and the pnpm version pinned in the root manifest. Install with `pnpm install --frozen-lockfile`, then build dependencies with `pnpm build`.

Run this package's checks from the workspace root:

```sh
pnpm --filter @frenchexdev2/requirements-styles test
pnpm compliance
```

Coverage gates apply to each configured instrumentation scope. See the [workspace README](../../README.md) for all checks and the [dated qualification report](../../CORRECTIONS-2026-11-03.md) for recorded results and limitations.

## License

See the [FrenchExDev Educational License](../../LICENSE). It permits the educational and evaluation uses stated there; production use requires a separate commercial license.
