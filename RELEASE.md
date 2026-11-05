# Tag releases

This repository owns both projects under `packages/Requirements.ts` and
`packages/Requirements.SharedKernel.ts`. GitHub executes the workflows at the
repository root; nested project workflows are standalone references.

## Bootstrap the kernel

The root `release-package.yml` workflow accepts
`requirements-shared-kernel/vMAJOR.MINOR.PATCH` tags. It stages only the kernel's
sources and tests, installs its committed registry lockfile, and builds and tests
on Windows and Linux before publication to npm. No CodeGenerationPipeline
installation is needed for this isolated release.

For the current committed kernel version, use `requirements-shared-kernel/v0.1.0`.
The isolated lockfile is `release/requirements-shared-kernel/pnpm-lock.yaml`.
To regenerate it, choose a new temporary destination and run:

```powershell
$stage = Join-Path ([IO.Path]::GetTempPath()) ('kernel-release-' + [guid]::NewGuid().ToString('N'))
node scripts/release.mjs stage requirements-shared-kernel/v0.1.0 $stage
pnpm --dir $stage install --lockfile-only --no-frozen-lockfile --ignore-scripts
pnpm --dir $stage install --frozen-lockfile
pnpm --dir $stage run build
pnpm --dir $stage run test:ci
Copy-Item -LiteralPath (Join-Path $stage 'pnpm-lock.yaml') -Destination release/requirements-shared-kernel/pnpm-lock.yaml
```

## Publish the complete workspace

After the kernel has been published, publish its CodeGenerationPipeline consumer.
Then generate this monorepo's production registry lockfile and validate it:

```powershell
pnpm run deps:lock:prod
pnpm run deps:prod
pnpm run build
pnpm run test:ci
node scripts/release.mjs check v0.1.0
```

Commit the generated `pnpm-lock.yaml` before tagging. A pushed `v*` tag triggers
`ci.yml`; it validates the committed version of every leaf package, installs the
registry lockfile, and builds and tests on Windows and Linux before publication.
No versions are changed in CI. Use `node scripts/release.mjs prepare vX.Y.Z` to
prepare a future version before regenerating and committing the lockfile.

Both publication workflows share the `npm-publication` concurrency group.
Stable versions use `latest`, prereleases use `next`. Public packages are published
with access `public` and lifecycle scripts disabled after their explicit build.
The private root and private project wrappers are never published.

Configure the GitHub repository's `NPM_TOKEN` secret with npm publication access,
or configure npm trusted publishing for this repository and the appropriate
workflow (`ci.yml` and/or `release-package.yml`). Only the publication step receives
the token; publishing jobs also have `id-token: write` for OIDC.

No tags or npm publications are performed by local validation or Git initialization.
See [dependency profiles](DEPENDENCIES.md) for local development and recovery.
