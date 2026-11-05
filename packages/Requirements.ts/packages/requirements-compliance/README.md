<p align="center">
  <img src="./../../icons/logo.png" alt="Requirement-As-Code logo" width="150px" />
</p>

# @frenchexdev2/requirements-compliance

Requirement/Feature metadata analysis, test-binding reports and runtime-coverage aggregation.

## Role in the workspace

This package brings together declarations, statically discovered tests, implementation bindings and V8 coverage summaries. The `requirements` CLI uses it to report coverage gaps and traceability; the workspace qualification script adds run-specific test-result and source-fingerprint checks.

## Public API

- Root: metadata readers, runtime coverage helpers and selected report APIs.
- `/compliance-core`: parse/read Features and Requirements, derive traceability corpora, load coverage summaries and identify orphan source files.
- `/compliance-report`: scan test declarations, cross-reference ACs, generate report payloads and render console or reverse-by-test views.

`generateReport(options)` is a filesystem-backed orchestration entry point. Some lower-level functions are pure or accept injected ports. The package does not expose every reader as a filesystem-independent service.

## Example: inspect a recorded coverage run

```ts
import {
  findLatestCoverageSummary, loadCoverageSummary, computeRuntimeCoverage,
} from '@frenchexdev2/requirements-compliance';

async function coverageFor(root: string, sourceFiles: readonly string[], runId: string) {
  const location = await findLatestCoverageSummary(root, runId);
  const coverage = location
    ? await loadCoverageSummary(location.file, root)
    : null;
  return computeRuntimeCoverage(sourceFiles, coverage);
}
```

Coverage summaries are discovered under `test-results/<runId>`. Pass a run ID when evidence must belong to a specific execution. Missing coverage remains a distinct state.

For a complete report, configure `root`, `featuresDir`, `bindingsDir`, `bindingsManifestPath` and `testDirs`, plus `requirementsDir` when resolving `@Satisfies` to Requirement IDs. Optional settings include a coverage run ID, inferred manifest/diff paths and report rendering preferences. See [GenerateReportOptions](src/compliance-report.ts).

## Reading the results

Keep these dimensions separate:

- **AC/test declarations**: a test method claims to verify an AC, optionally at an expected test level.
- **Implementation bindings**: the AST scanner infers which symbols the method references.
- **Runtime coverage**: an instrumented source scope was exercised during a selected run.
- **Successful test evidence**: run reports establish whether an individual test actually passed.

The workspace's `pnpm compliance` command reconciles declarations with successful test entries and SHA-256 source snapshots. That additional qualification belongs to the workspace script, not every standalone call to this library.

A complete report does not establish the correctness of the business need. Mutation-based behavioral checks remain a separate [package](../requirements-behavioral-check/README.md) and CLI operation.

Use the [requirements CLI](../requirements/README.md) for `compliance --strict`, JSON output and reverse-by-test reports. The TypeScript peer range is `>=5.4 <6`.
## Development and status

Unreleased ESM package in the standalone RaC workspace. From the `rac.ts` root, use Node.js `^22.22.0 || ^24.0.0 || >=26.0.0` and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @frenchexdev2/requirements-compliance test
pnpm compliance
```

See the [workspace README](../../README.md) for checks and the [dated qualification report](../../CORRECTIONS-2026-11-03.md) for measured results and instrumentation limits.

## License

See the [FrenchExDev Educational License](../../LICENSE). Production use requires a separate commercial license under its terms.
