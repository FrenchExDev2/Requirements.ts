# @frenchexdev2/requirements

Foundation of the `@frenchexdev2/*` traceability ecosystem. Type-safe four-tier DSL **Requirement → Feature → AC → Test** with project-extensible **Styles**, pluggable **Scaffolder registry**, **JSON Schema** editor binding, property + fuzzy testing, and runtime type guards.

Port-driven: analysis core takes a `FileSystem` port; CLI shell injects real `fs`, tests inject in-memory maps. No runtime reflection, no string IDs.

## Four-tier chain
- **Requirement** (WHY) — `Requirement<S>` abstract class, generic over a `RequirementStyle`; typed `statement` (`EarsStatement`), `rationale`, `fitCriteria`, `verificationMethod`, `source`, `risk`, `refines`, `tracedTo`, `history`.
- **Feature** (WHAT) — `Feature` abstract class linked to Requirements via `@Satisfies(Req1, Req2, …)` (SysML-aligned, bidirectional registry).
- **AC** (HOW-MEASURED) — abstract methods returning `ACResult`.
- **Test** (PROOF) — bound via `@FeatureTest(Feature)` + `@Verifies('acName')`; opt-in `@Expects(TestLevel)`, `@Exclude(reason)`.

Decomposition: `@Refines(ParentReq)` for Requirement→Requirement (SysML refine/derive).

## Style system
`RequirementStyle` = `{ StyleVocabulary, StyleValidators, StyleTemplates, RequirementReporter, FitCriterionAdapter[] }`. Five built-in presets — pitches under [docs/pitches/](docs/pitches/):
- **DefaultStyle** — ISO/IEC/IEEE 29148 + Volere + EARS
- **IndustrialStyle** — IEC 61508/61511/62443/61131-3/61850, ISA-88/95/18.2, 21 CFR Part 11, GAMP 5; 13-state heavy-gate lifecycle, SIL 1–4
- **LeanStyle** — Toyota / A3 / PDCA / Gemba / VSM / Kaizen
- **AgileStyle** — Scrum / XP / SAFe / BDD; INVEST validator
- **KanbanStyle** — Anderson's Kanban Method; Classes of Service

`StyleRegistry` / `BUILT_IN_STYLES` / `DEFAULT_STYLE_REGISTRY` / `createStyleRegistry()` — OCP discoverability. See [docs/HOW-TO-CREATE-YOUR-STYLE.md](docs/HOW-TO-CREATE-YOUR-STYLE.md) and [docs/HOW-TO-TEST-YOUR-STYLE.md](docs/HOW-TO-TEST-YOUR-STYLE.md).

## Scaffolder registry
`TestScaffolder` port: `{ level, defaultDir, filenameSuffix, description, generate(feature, uncovered) }`. Seven built-ins: `unit`, `functional`, `e2e`, `a11y`, `i18n`, `visual`, `perf` — each emits `@FeatureTest`/`@Verifies` code.

- `generateScaffoldForSpec(spec, level, registry?)` — canonical entry
- `planWrites(spec, config, registry?)` — paths from union of every AC's `@Expects` levels
- `WritePlanConfig.testDirsByLevel?: Partial<Record<TestLevel, string>>`

## Typed data layer
- Branded primitives: `RequirementId`, `FeatureId`, `AcName`, `IsoDate`, `Sentence`, `Percentage` (plain strings on the wire, brands at compile time).
- Smart constructors with parse-don't-validate + `typeof` runtime guards → `ParseError` for FFI/JSON.parse callers, never `TypeError`.
- Discriminated unions: `EarsStatement` (5 patterns + natural), `RequirementSource` (8 kinds), `FitCriterion` (7 kinds), `Rationale { claim, kind, evidence[], assumptions? }`, `Evidence` (metric/incident/study/expert-opinion/precedent).
- `FitCriterionAdapter` port — projects plug Datadog / Grafana / SonarQube.
- `HistoryEntry` + `ChangeKind` — append-only audit log per spec.
- `$schemaVersion: '2026-04-14'` first-class on every spec.

## JSON Schema + editor binding
- [schemas/feature-spec.schema.json](schemas/feature-spec.schema.json), [schemas/requirement-spec.schema.json](schemas/requirement-spec.schema.json) — auto-generated from `src/cli/types.ts` via `ts-json-schema-generator`.
- `validateSpec(spec)` — ajv-backed runtime validation, lazy-loaded.
- `requirements schema register [--print] [--force]` — writes/merges `.vscode/settings.json`.

## Bin
```
npx requirements compliance [--strict]
npx requirements trace gaps | matrix <feature> | chain <id> <ac>
npx requirements scaffold test|e2e <id>
npx requirements feature new | sync <spec>
npx requirements requirement new | sync <spec> | list | show <REQ-ID> | orphan
npx requirements schema register [--print] [--force]
```

`compliance --strict` gates: critical uncovered ACs · orphan Features · approved Requirements without satisfier.

`feature new` / `requirement new` — interactive `@clack/prompts` wizards (EARS pattern selector, source-kind slots, fit-criterion loop, satisfiedBy multiselect recursing into `feature new`); `--replay <spec>`, `--yes`, `--dry-run`, `--no-test`, `--template <id>`. `feature sync` / `requirement sync` — colored diff (`picocolors` + `diff`), three-way Apply-all / Review-per-file / Cancel, opt-in "Open in VS Code".

## Layout
- [src/base.ts](src/base.ts) — `Feature`, `Requirement<S>`, `Priority`, `TestLevel`, `ACResult`
- [src/decorators.ts](src/decorators.ts) — `@FeatureTest`, `@Verifies`, `@Expects`, `@Exclude`, `@Satisfies`, `@Refines`
- [src/style.ts](src/style.ts) + [src/styles/](src/styles/) — Style system + 5 presets + registry
- [src/analysis/](src/analysis/) — `loadFeatures`, `scanTestFiles`, compliance core/report
- [src/cli/](src/cli/) — `trace-core`, `scaffold-core` (+ [scaffolders/](src/cli/scaffolders/) — 7 scaffolders), `feature-new-core`, `requirement-core`, `sync-core`, `prompt-shell`, `spec-to-source`, `schema-generate`, `schema-register`, `types`
- [src/ports/](src/ports/) — `FileSystem`
- [src/bin/](src/bin/) — commander shell
- [docs/pitches/](docs/pitches/), [GLOSSARY.md](GLOSSARY.md), [CHANGELOG.md](CHANGELOG.md), [schemas/](schemas/)

## Quality gate
100% lines/branches/functions/statements; 778 tests; property + fuzzy via `fast-check` (16 invariants, 200 runs). Self-audited — `npx requirements compliance --strict` = PASS. **Zero `describe`/`it`** permitted (`REQ-DOG-FOOD`); all tests use `@FeatureTest`/`@Verifies`/`@Satisfies`/`@Refines`.

## Status
**Unreleased** — not published. Free to break wire formats and rename APIs. Last `0.1.0` was a private preview only.

## See also
[CHANGELOG.md](CHANGELOG.md) for the full Unreleased entry · [README.md](README.md) for usage examples.
