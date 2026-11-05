<p align="center">
  <img src="./../../icons/logo.png" alt="Requirement-As-Code logo" width="150px" />
</p>

# @frenchexdev2/requirements-test-smells

Fast AST checks for observable gaps in decorated acceptance-criterion tests.

## Role in the workspace

This package inspects `@FeatureTest` classes and `@Verifies` methods before more expensive execution or mutation checks. It uses [requirements-scanner](../requirements-scanner/README.md) to identify implementation targets and follows local/class helper references when inspecting assertions.

## Detected smells

- `empty-targets`: the method has no inferred implementation targets in the scanner's scope.
- `empty-body`: its body is absent, empty or a bare return.
- `no-assertion`: no supported assertion call is found.

Recognized assertion roots include `expect`, `assert` and `fc` for fast-check. `@TypeCheckOnly` suppresses the intentional absence of implementation targets; body and assertion checks still apply.

## Example

```ts
import { detectTestSmells } from '@frenchexdev2/requirements-test-smells';

const source = `
@FeatureTest(PositiveAmount)
class PositiveAmountTest {
  @Verifies('rejectsZero')
  rejectsZero() {}
}
`;

const smells = detectTestSmells(source, '/project/test/amount.test.ts', '/project');
// Inspect each smell's kind, file, className, methodName, featureClass and ac.
```

`detectTestSmells(source, file, root)` analyzes a string without executing it. `scanTestSmells(options)` walks configured test directories through a `FileSystem` port and returns aggregated findings. Both APIs are exported from the root and `/test-smells` entry points.

## CLI integration

The separate `requirements` package exposes:

```sh
pnpm exec requirements ast-smells --json
pnpm exec requirements ast-smells --strict
```

Run these from a configured consumer project with that CLI available locally.

## Limits

These are syntax-based signals. An assertion can be present and still be wrong or irrelevant; an unsupported custom assertion pattern may be reported. No finding means the defined smells were not detected, not that the test proves its claim.

Use test execution and coverage for runtime evidence, and [behavioral mutation checks](../requirements-behavioral-check/README.md) to assess whether selected tests detect deliberately introduced faults. The TypeScript peer range is `>=5.4 <6`.

See [src/test-smells.ts](src/test-smells.ts) for exact recognition rules and result types.
## Development and status

Unreleased ESM package in the standalone RaC workspace. From the `rac.ts` root, use Node.js `^22.22.0 || ^24.0.0 || >=26.0.0` and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @frenchexdev2/requirements-test-smells test
pnpm compliance
```

See the [workspace README](../../README.md) for checks and the [dated qualification report](../../CORRECTIONS-2026-11-03.md) for measured results and instrumentation limits.

## License

See the [FrenchExDev Educational License](../../LICENSE). Production use requires a separate commercial license under its terms.
