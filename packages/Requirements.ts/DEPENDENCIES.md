# Dependency profiles

Production is the default. `pnpm-workspace.yaml` contains registry dependencies and
internal workspace references only. CI and publication use `pnpm-lock.yaml` with
`--frozen-lockfile`; they never activate local development links.

Local development uses `pnpm-workspace.dev.yaml` and `pnpm-lock.dev.yaml`. The
current development lockfile was preserved from the former local configuration.

## Local development

```powershell
pnpm run deps:dev
pnpm run build
pnpm run test:ci
```

`deps:dev` temporarily activates the development workspace and lockfile for one
installation. It saves the resulting development lockfile and restores the exact
production workspace and lockfile, including an originally absent production
lockfile, whether installation succeeds or fails. Installed `node_modules` uses
the development links until the next production installation.

Update the development lockfile after changing dependency manifests or local links:

```powershell
pnpm run deps:lock:dev
pnpm run deps:dev
```

Optional flags include `--offline`, `--prefer-offline`, `--ignore-scripts`, and
`--reporter=append-only`. Installations are frozen unless lockfile generation is
requested explicitly. These profiles select dependency sources; both still
install development tooling needed for builds and tests.

Keep catalogs, workspace patterns and security overrides consistent in both YAML
files. Only the development file should contain external `link:` overrides.
Regular `pnpm install` uses the production configuration. Both profiles set
`verifyDepsBeforeRun: false`: pnpm 11 must not install production dependencies
automatically before the development selection script has run, or replace local
links when a subsequent build script starts. Install the selected profile explicitly.

## Production and CI

After publishing the external dependencies to npm:

```powershell
pnpm run deps:lock:prod
pnpm run deps:prod
node scripts/dependencies.mjs check
pnpm run build
pnpm run test:ci
```

Commit the generated `pnpm-lock.yaml` before tagging. Registry lock generation
never falls back to local links. The workflows require this production lockfile
and reject local transports before their frozen installation.

At setup on 2026-11-05, the public npm registry returned 404 for
`@frenchexdev2/requirements-shared-kernel` and `@frenchexdev2/ts-codegen-pipeline`.
The former lockfile contains external links and is now `pnpm-lock.dev.yaml`;
it is not a registry lockfile. No production lockfile is fabricated from it.
Publish the standalone shared kernel first, generate and commit the pipeline's
production lockfile, then publish the pipeline and generate the Requirements
production lockfile. CI intentionally fails with an explicit missing-lockfile
message until that bootstrap is complete.

## Interrupted or concurrent installations

Run only one dependency installation at a time, including plain `pnpm install`.
The profile commands use an exclusive `.pnpm-profile.json` journal and refuse a
second profile installation. Development profiles are forbidden in CI.

A normal installation failure restores production automatically. If the process
was forcibly terminated, stop its remaining pnpm child processes before running:

```powershell
pnpm run deps:recover
```

Recovery refuses to overwrite a profile whose owner is still running. It restores
production inputs for an interrupted installation. Failed production generation
also preserves the previous registry lockfile. Reinstall the desired
profile afterwards to synchronize `node_modules`. The ignored journal contains
recovery snapshots; do not delete it before recovery.
