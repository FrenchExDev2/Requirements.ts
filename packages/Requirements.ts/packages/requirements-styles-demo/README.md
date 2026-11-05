<p align="center">
  <img src="./../../icons/logo.png" alt="Requirement-As-Code logo" width="150px" />
</p>

# @frenchexdev2/requirements-styles-demo

Scenario-driven demonstration player for Requirements-as-Code styles, with the `rsd` CLI and a three-state-machine orchestrator.

## Role in the workspace

The player turns scenario JSON into a sequence of Requirement creation, Feature derivation, test scaffolding, AC implementation and verification steps. It demonstrates the workflow across different styles through explicit dependencies and observable events.

Four built-in scenario files are provided in [scenarios](scenarios/): shopping cart, Scrum authentication, Lean A3/kaizen and an industrial SIS example.

## CLI

After `pnpm build`, inspect the player directly from the workspace root:

```sh
pnpm --filter @frenchexdev2/requirements-styles-demo exec node bin/rsd-entry.mjs --help
pnpm --filter @frenchexdev2/requirements-styles-demo exec node bin/rsd-entry.mjs list --json
```

In a consumer project with the local `rsd` binary available:

```sh
pnpm exec rsd validate path/to/example.scenario.json --strict
pnpm exec rsd inspect path/to/example.scenario.json --mermaid
pnpm exec rsd play path/to/example.scenario.json --no-ai --seed 42 --dry-run
pnpm exec rsd export path/to/example.scenario.json --format md --out scenario.md
```

`record [name] --from-project <dir>` captures project seeds into a scenario file. Export and recording refuse existing output files unless `--force` is supplied.

The default adapter is a deterministic stub. `--ai` selects the Claude-backed adapter and requires its configured credentials, including `ANTHROPIC_API_KEY` in the CLI environment. AI mode sends requests to an external service; it needs independent account/network configuration. A stub run demonstrates orchestration rather than validating AI-generated business behavior.

## Orchestration model

- **ProjectLifecycleFsm**: the overall project flow from empty/seeded through drafting, derivation, scaffolding, implementation and verification to published or failed.
- **PerFeatureFsm**: each Feature's spec, scaffold, AC implementation, passing tests and verification.
- **PerAcFsm**: each AC's declaration, scaffold, implementation, passing test, review and verification.

The project/Feature/AC state coupling is documented in the [scenario player design](docs/scenarii-player-design.md). State names such as `Published` belong to this demo lifecycle; they do not mean an npm package or external site was published.

## Programmatic API

The root exports scenario/port types, `ScenarioOrchestrator`, the three FSMs, adapters, validation/play/list/inspect/export/record services and UI event helpers. Public subpaths are `/ai-adapter`, `/commands`, `/event-bridge`, `/orchestrator`, `/orchestrator-port`, `/per-ac-fsm`, `/per-feature-fsm`, `/project-lifecycle-fsm`, `/types` and `/ui`.

`ScenarioOrchestrator` accepts injected generation, test, compliance, filesystem and AI dependencies. UI event subscriptions let a host display progress without owning the execution logic.

## Limits

Markdown export is implemented. HTML and PDF options currently emit marked Markdown stubs for a later renderer; they do not produce fully rendered HTML or a PDF document. Scenario validation checks schemas and references; it does not certify the domain represented by an industrial example.

See [src/commands.ts](src/commands.ts), [src/orchestrator.ts](src/orchestrator.ts) and [requirements-styles](../requirements-styles/README.md) for the implementation and presets. The design document is a contract/design reference; current source defines actual behavior.
## Development and status

Unreleased ESM package in the standalone RaC workspace. From the `rac.ts` root, use Node.js `^22.22.0 || ^24.0.0 || >=26.0.0` and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @frenchexdev2/requirements-styles-demo test
pnpm compliance
```

See the [workspace README](../../README.md) for all checks and the [dated qualification report](../../CORRECTIONS-2026-11-03.md) for measured results and their scope.

## License

See the [FrenchExDev Educational License](../../LICENSE). Production use requires a separate commercial license under its terms.
