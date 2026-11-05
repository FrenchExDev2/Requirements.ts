<p align="center">
  <img src="./../../icons/logo.png" alt="Requirement-As-Code logo" width="150px" />
</p>

# @frenchexdev2/requirements-behavioral-check

Plan and interpret mutation checks scoped to Feature acceptance criteria.

## Role in the workspace

This package connects inferred test-to-implementation bindings to Stryker mutation runs. It owns planning, configuration construction, verdict classification and per-AC aggregation. The actual process launch and report loading live in the [requirements CLI](../requirements/README.md).

Mutation testing asks whether the selected tests detect deliberate implementation changes. It supplements declarations and runtime coverage; it does not validate the business intent itself.

## Public API

The root and `/behavioral-check` export:

- `planBehavioralCheck`: select tests and eligible implementation files for a Feature/AC pair.
- `buildStrykerConfig`: construct runner settings for a non-vacuous plan, including plugin resolution from the supplied repository root.
- `classifyVerdict`: interpret a plan and score against an optional threshold.
- `aggregateByAc`: correlate report test IDs and mutant `coveredBy`/`killedBy` data with decorated AC bindings.

A plan with no matching Feature, AC or mutation targets is explicitly **vacuous**. It is not positive verification evidence.

## Example: preview a plan

```ts
import { planBehavioralCheck } from '@frenchexdev2/requirements-behavioral-check';
import type { TestParseResult } from '@frenchexdev2/requirements-scanner';

function planFor(parsedTests: readonly TestParseResult[]) {
  return planBehavioralCheck(
    parsedTests,
    'POSITIVE-AMOUNT',
    'rejectsZero',
    new Map([['PositiveAmount', 'POSITIVE-AMOUNT']]),
    { mutateScope: ['src/'] },
  );
}
```

Check `plan.vacuous` before passing it to `buildStrykerConfig`. Provide `repoRoot` so runner plugins are resolved in the intended environment. Supply a meaningful score threshold explicitly; `classifyVerdict` defaults to zero, which does not establish a strong test-quality gate.

## CLI integration

With the separate `requirements` CLI installed in a configured project:

```sh
pnpm exec requirements behavioral-check --feature POSITIVE-AMOUNT --ac rejectsZero --plan-only
pnpm exec requirements behavioral-check --feature POSITIVE-AMOUNT --ac rejectsZero
pnpm exec requirements behavioral-audit --threshold 100 --json
```

The executing commands need Stryker and the relevant runner plugins available in the project. They are opt-in operations and are not part of `compliance --strict`.

## Score scope

The global report score follows `(Killed + Timeout) / (Killed + Timeout + Survived + NoCoverage)`. Per-AC results depend on the test IDs and attribution present in the report. Exclusions, ignored mutants and missing attribution must be considered with the score.

The workspace enforces 100% mutation thresholds in its configured campaigns, but only the campaigns recorded in the [qualification report](../../CORRECTIONS-2026-11-03.md) have measured results. A configured threshold is not evidence that every package was mutation-tested.

See [src/behavioral-check.ts](src/behavioral-check.ts) for plan, report and verdict types.
## Development and status

Unreleased ESM package in the standalone RaC workspace. From the `rac.ts` root, use Node.js `^22.22.0 || ^24.0.0 || >=26.0.0` and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @frenchexdev2/requirements-behavioral-check test
pnpm compliance
```

See the [workspace README](../../README.md) for checks and the [dated qualification report](../../CORRECTIONS-2026-11-03.md) for measured results and instrumentation limits.

## License

See the [FrenchExDev Educational License](../../LICENSE). Production use requires a separate commercial license under its terms.
