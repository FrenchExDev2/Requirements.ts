> **Note:** @frenchexdev2/requirements-shared-kernel vit desormais dans le workspace voisin [SharedKernel.ts](../SharedKernel.ts/) (plus de cycle Requirements <-> CodeGen).

<p align="center">
  <img src="./icons/logo.png" alt="Requirement-As-Code logo" width="150px" />
</p>

# Requirements-as-Code — TypeScript

Standalone workspace originally extracted from the CV workspace on October 29, 2026; it now contains 17 packages.

The [initial November 2 audit](AUDIT-2026-11-02.md) and the [November 3 corrections report](CORRECTIONS-2026-11-03.md) describe the checks and their supporting evidence. The pnpm workspace contains 17 RaC packages; neighboring projects remain independent. The code-generation pipeline now lives in [CodeGenerationPipeline.ts](../CodeGenerationPipeline.ts/README.md). Requirements consumes its exact npm version from npmjs.org, including the generic AST scanner behind the existing `requirements-scanner` API. No archive override is used. See [RELEASE.md](RELEASE.md) for the first shared-kernel publication, registry lockfile migration, and release tags.

## Installation and checks

Use Node.js `^22.22.0 || ^24.0.0 || >=26.0.0` and the pnpm version specified in package.json. The audit was verified using Node 26.12.1 and pnpm 11.20.0.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck:ts7
pnpm typecheck:tests
pnpm verify:policy
pnpm test
pnpm test:integration
pnpm test:smoke
pnpm compliance
pnpm test:distribution
pnpm audit --json
```

Each package enforces 100% coverage for lines, branches, functions, and statements within its coverage scope. Stryker also enforces a blocking 100% threshold for every campaign that is run. `verify:policy` rejects any missing configuration or threshold other than 100%. Scope exclusions are detailed in the configurations; the re-exports in `requirements-lib` contain no locally executable lines.

Up to four independent packages run in parallel, with two Vitest workers per package. Builds follow the dependency graph; checks that consume `dist` wait for the build to finish. The native compiler also checks up to four packages simultaneously.

Individual JSON reports and coverage data remain in each package's `test-results/<runId>` directory. `compliance` now uses the complete qualification engine described below. `compliance:static` checks declarations only and cannot establish qualification.

## Complete self-qualification

The complete policy includes Draft Requirements and disabled Features. It requires individual decorated test results, every AC at its declared levels, executable fit criteria, 100% code coverage, recorded property/fuzz campaigns, and a standard Stryker score of 100% on both Windows and Linux. A missing platform, changed source/build/report, unresolved criterion, unbound test or interrupted campaign is a blocking diagnostic.

```sh
# Analyze every declaration and reconcile explicitly selected execution evidence.
node packages/requirements/bin/requirements-entry.mjs qualify --strict --json --evidence test-results/windows-run/evidence-win32.json test-results/linux-run/evidence-linux.json
pnpm compliance --evidence test-results/windows-run/evidence-win32.json test-results/linux-run/evidence-linux.json

# Declaration analysis has a separate name and verdict scope.
pnpm compliance:static
```

`QualificationPolicy`, `QualificationEvidence`, `QualificationReport`, `qualifyProject`, and the pure `evaluateQualification` API are exported by `@frenchexdev2/requirements-compliance`; the public `@frenchexdev2/requirements/analysis` facade also exposes qualification.

On a configured platform, `pwsh -NoProfile -File scripts/Invoke-Audit.ps1 -Phase FullQualification -RunId windows-run` launches a monitored background campaign. The launcher's returned process IDs are not a passing verdict. Read its saved summary, then select the retained evidence explicitly. The runner builds first, fingerprints inputs, runs source tests/coverage and distribution/type checks, and launches full mutation only after those prerequisites pass. Failed prerequisites cancel the dependent campaign rather than waiting indefinitely. Each completed stage and partial evidence remain under `test-results/<RunId>`.

For an explicitly selected, prepared Linux container, use `-Phase LinuxFullQualification -LinuxContainerId <full-owned-container-id> -RunId linux-run`; add `-CompanionStatePath <windows-run>/state.json` to display both platforms in the visible monitor. Linux dependencies and builds belong to the container's independent checkout. Copy its retained run directory back before selecting Linux evidence on Windows. Worker and monitor scripts are snapshotted per run, and the returned reopen command selects that snapshot. Runtime assertion checks reject empty tests and assertions hidden in unreachable code. Coverage reports are retained even when tests fail.

The report includes the complete contract/test/implementation inventory, explicit type-only/module-forwarding exclusions, selected evidence, raw-artifact hashes, tools and all per-file coverage counters. Source comment directives suppressing coverage or mutation are blocking inventory diagnostics. [Criterion migration provenance](provenance/qualification-observable-criteria-migration.json) retains replaced inspection/demonstration texts and the corresponding present obligations; it does not certify historical reviews, recordings or PR ordering.

`scripts/collect-qualification-evidence.mjs begin|finish <runId>` captures source/configuration fingerprints and adapts retained individual runner reports. Before evaluation, the filesystem adapter verifies artifact hashes and recomputes test, coverage, mutation, strategy and lifecycle projections from the raw reports. An edited summary cannot substitute for those reports. The test adapter records actual sample counts, seeds and minimized failures. Full campaigns require at least 1,000 runs per property and 10,000 per fuzz target. Final mutation includes static initialization and disables incremental reuse; timeout, error, ignored and uncovered mutant counts remain visible separately from the standard score.

Each campaign retains independent `build-before/` and `build-after/` archives, with stable build hashes and tool versions checked across the run. Linux proofs therefore verify against their retained Linux bytes, rather than a mutable Windows `dist` directory. Explicit forwarding imports are resolved for both individual test outcomes and property/fuzz evidence; unknown campaign identities remain blocking.

This policy does not assert that the current workspace already satisfies every obligation. Its report lists the remaining gaps. Earlier dated qualification reports retain their original, narrower scopes.

The native TypeScript 7.0.2 compiler is installed as `@typescript/native` for `typecheck:ts7`. The current lockfile selects `@typescript/typescript6` 6.0.2 for the standard compiler API and build. The standard build has not been switched to TypeScript 7.

For agents, `scripts/Invoke-Audit.ps1 -Phase Final -MaxParallel 4` runs the checks through QuietCli and opens a monitoring window with a PID for each check. The monitor closes after saving the results; the command to reopen it is provided at startup. Logs are retained under `test-results/`.

## Initial extraction validation

At extraction time, all 18 packages built successfully; 1,597 unit tests and 7 smoke tests passed. Three coverage thresholds and thirteen self-audits were still failing. See [EXTRACTION.md](EXTRACTION.md) for that historical state and [the audit](AUDIT-2026-11-02.md) for current measurements. No existing threshold was lowered.

The CV site's requirements, including its requirements/features directory, remain in the CV workspace: they describe that site's use of RaC.

The initial installation used `F:/.pnpm-store` offline. The audited installation now uses the standard pnpm store; use the standard command with a frozen lockfile. The historical store path is not a required configuration setting.

## Packages

- @frenchexdev2/requirements
- @frenchexdev2/requirements-behavioral-check
- @frenchexdev2/requirements-compliance
- @frenchexdev2/requirements-core
- @frenchexdev2/requirements-lib
- @frenchexdev2/requirements-requirements
- @frenchexdev2/requirements-scaffolders
- @frenchexdev2/requirements-scanner
- @frenchexdev2/requirements-shared-kernel
- @frenchexdev2/requirements-spec-io
- @frenchexdev2/requirements-styles
- @frenchexdev2/requirements-styles-demo
- @frenchexdev2/requirements-sync
- @frenchexdev2/requirements-test-smells
- @frenchexdev2/requirements-trace
- @frenchexdev2/requirements-versioning
- @frenchexdev2/requirements-wizards
- External versioned tool: @frenchexdev2/ts-codegen-pipeline (owned by CodeGenerationPipeline.ts)

The public executables are requirements, rsd, and sourcegen. The sourcegen executable comes from the installed versioned pipeline package; the other two belong to this workspace. Refer to the README, CHANGELOG, and documentation files in each package.

## Provenance and validation

See [EXTRACTION.md](EXTRACTION.md), [the initial manifest](provenance/extraction.json), [the initial validation](provenance/validation.json), and [the audit evidence](provenance/audit-2026-11-02/). `verify:extraction` still compares against the historical copy, so it flags files that have been corrected since then. Any historical paths in the documentation describe provenance; the workspace does not depend on the CV repository.

No packages have been published, no licenses have been changed, and no Git history has been imported.

## GitHub Actions and npm releases

See [RELEASE.md](RELEASE.md) for the NPM_TOKEN secret, committed version preparation, Windows/Linux checks, npm channels, and the initial independent shared-kernel release.
