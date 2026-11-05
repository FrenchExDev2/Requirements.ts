# Tag releases

The `.github/workflows/ci.yml` workflow builds and tests this workspace on Windows
and Linux for branches, pull requests, manual runs, and pushed `v*` tags. Only a
pushed version tag can publish to the public npm registry, after both platforms pass.
The release check rejects malformed tags and tags that differ from committed versions.

Use `vMAJOR.MINOR.PATCH` (for example `v0.1.0`) for a stable release. Prerelease
versions such as `v0.2.0-rc.1` publish under `next`; stable releases use `latest`.
The workspace root remains private. CI never changes package versions.

Prepare and validate locally before committing and tagging:

```powershell
node scripts/release.mjs prepare v0.1.0
pnpm install --lockfile-only --no-frozen-lockfile --ignore-scripts
pnpm install --frozen-lockfile
node --test test/release.test.mjs
pnpm run build
pnpm run test:ci
node scripts/release.mjs check v0.1.0
```

Commit the manifests, lockfile and workflow before pushing that commit and its tag.
The publishing job rebuilds from the committed lockfile and disables lifecycle
scripts when publishing. Releases are serialized across tags.

Configure the repository secret `NPM_TOKEN` with permission to publish the package,
or configure an npm trusted publisher for this repository and `ci.yml`. The workflow
provides `id-token: write` for OIDC. Authentication is exposed only to the publishing step.
No package is published by local release-tooling checks.

The shared kernel is now released from `Requirements.SharedKernel.ts` using its own
`v*` tags. The former `requirements-shared-kernel/v*` release in `Requirements.ts`
is obsolete because that workspace no longer contains the package.

Publish the shared kernel first, then CodeGenerationPipeline, then Requirements,
then Builder. Consumers require npm versions of external workspace packages.
Local `link:` overrides in a consumer must be separated from its release
configuration, and its registry lockfile regenerated, before its CI can succeed.
Creating these workflows does not publish missing dependencies or configure npm access.

References: [GitHub npm publication](https://docs.github.com/en/actions/tutorials/publish-packages/publish-nodejs-packages),
[npm trusted publishers](https://docs.npmjs.com/trusted-publishers/).
