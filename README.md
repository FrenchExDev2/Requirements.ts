<p align="center"><img src="./icons/logo.png" alt="Requirements-as-Code logo" width="150" /></p>

# Requirements.ts

Requirements-as-Code monorepo containing two projects under `packages/*`:

```text
Requirements.ts/
├── package.json
├── pnpm-workspace.yaml
├── .github/workflows/
└── packages/
    ├── Requirements.ts/
    │   └── packages/*
    └── Requirements.SharedKernel.ts/
        └── packages/requirements-shared-kernel
```

The root workspace discovers each project's leaf packages through
`packages/*/packages/*`. Private project roots are not included as recursive
workspace targets. Shared-kernel consumers use `workspace:^`; pnpm publishes
those internal references as ordinary npm version ranges.

Run commands from this repository root:

```powershell
pnpm run deps:dev
pnpm run build
pnpm run test:monorepo
pnpm run test:release
pnpm run test:ci
```

The development profile links the sibling CodeGenerationPipeline workspace.
Production uses npm and a separately generated `pnpm-lock.yaml`.
See [dependency profiles](DEPENDENCIES.md) and [tag releases](RELEASE.md).

GitHub Actions reads the root `.github/workflows` directory. Project-local
workflows and release documentation remain as standalone project references;
they are not executed by GitHub from their nested locations.

A `requirements-shared-kernel/v0.1.0` tag can publish the independent kernel first,
using its committed isolated registry lockfile. A `v0.1.0` tag validates and
publishes all public leaf packages after the complete registry lockfile is available.
Tags must match committed package versions. Prereleases publish under `next`;
stable versions publish under `latest`.
