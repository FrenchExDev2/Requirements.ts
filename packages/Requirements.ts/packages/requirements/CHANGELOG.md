# Changelog

All notable changes to `@frenchexdev2/requirements` are documented here. Follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

The DSL expands from "Feature + AC + Test" to the full four-tier chain
**Requirement → Feature → AC → Test**, with project-extensible Styles, a
pluggable scaffolder registry, property + fuzzy testing, and runtime type
guards for industrial-grade adopters.

### Added — the WHY tier

- **`Requirement<S>`** abstract class (generic over a `RequirementStyle`) with
  typed `statement`, `rationale`, `fitCriteria`, `verificationMethod`, `source`,
  `risk`, `refines`, `tracedTo`, `history`.
- **`@Satisfies(Req1, Req2, …)`** class decorator on Features — bidirectional
  registry (`feature.satisfies()` / `requirement.satisfiedBy()`); SysML-aligned.
- **`@Refines(ParentReq)`** class decorator for Requirement → Requirement
  decomposition (SysML `refine` / `derive`).
- **CLI commands**:
  - `requirements requirement new` — interactive wizard with 19-step flow
    (EARS pattern selector, source-kind slots, fit-criterion loop, satisfiedBy
    multiselect recursing into `feature new` for missing Features)
  - `requirements requirement sync <spec>` — diff / preview / apply for
    requirement specs
  - `requirements requirement list` — coverage per Requirement
  - `requirements requirement show <REQ-ID>` — full 4-tier chain (REQ → FEAT → AC → TEST)
  - `requirements requirement orphan` — Features without any `@Satisfies` link
- **`compliance --strict`** extended with three gates: critical uncovered ACs,
  orphan Features, approved Requirements without a satisfier.

### Added — Style system (ontology + behaviour per project)

- **`RequirementStyle`** interface bundling `StyleVocabulary`, `StyleValidators`,
  `StyleTemplates`, `RequirementReporter`, and `FitCriterionAdapter[]`.
- **Five built-in presets** (each with pitch under `docs/pitches/`):
  - **`DefaultStyle`** — ISO/IEC/IEEE 29148 + Volere + EARS (5 kinds, 5 statuses,
    4 risk levels, 6 EARS patterns, 8 source kinds, 4 templates).
  - **`IndustrialStyle`** — factory automation / process control / OT
    cybersecurity. Aligned with IEC 61508 / 61511 / 62443 / 61131-3 / 61850,
    ISA-88 / 95 / 18.2, ISO 13849, IEC 62061, 21 CFR Part 11, GAMP 5.
    13-state heavy-gate lifecycle (Safety/Security/Customer approval + FAT/SAT),
    SIL 1–4 risk with likelihood × impact matrix, 10 statement patterns
    (EARS + `safety-function` + `interlock` + `alarm` + `security-zone`), 9
    templates (sif-iec61511, process-interlock, alarm-isa182, cyber-zone-62443,
    batch-recipe-isa88, availability-sla, regulatory-ce-atex, gxp-21cfr11,
    interoperability-opcua).
  - **`LeanStyle`** — Toyota / A3 / PDCA / Gemba / VSM / Kaizen. 9 kinds
    (ValueAdding / Waste-Elimination / Kaizen-Experiment / Respect-for-People
    …), A3-cycle 8-state workflow, Impact × Effort risk matrix, 5 Lean-specific
    patterns (problem-statement, countermeasure, standard-work,
    value-proposition, kaizen-hypothesis).
  - **`AgileStyle`** — Scrum / XP / SAFe / BDD. 8 kinds (UserStory / Epic /
    Enabler / Spike / TechnicalDebt / Bug / …), 7 patterns (user-story,
    given-when-then, epic, enabler, spike, bug, natural), INVEST "Valuable"
    validator.
  - **`KanbanStyle`** — Anderson's Kanban Method. 6 Classes of Service as
    requirementKinds, 5 DelayHarm levels with likelihood × impact,
    flow-driven source taxonomy, 7 Kanban patterns (service-request,
    fixed-date-commitment, expedite-pull, intangible-investment,
    defect-pull, sla-commitment, natural).
- **`StyleRegistry`** / `BUILT_IN_STYLES` / `DEFAULT_STYLE_REGISTRY` /
  `createStyleRegistry()` — OCP discoverability, symmetric to
  `ScaffolderRegistry`. Projects register custom Styles by calling `register()`.

### Added — Scaffolder registry (pluggable, one strategy per TestLevel)

- **`TestScaffolder`** port: `{ level, defaultDir, filenameSuffix, description,
  generate(feature, uncovered) }`.
- **`ScaffolderRegistry`** / `DEFAULT_REGISTRY` / `createRegistry()`.
- **Seven built-in scaffolders** (up from 2): `unit`, `functional`, `e2e`,
  `a11y`, `i18n`, `visual`, `perf`. Each emits `@FeatureTest`/`@Verifies`
  code. Unit + e2e reuse the existing `generateUnitTestStub` /
  `generateE2eTestStub` (DRY). Others ship new templates:
  - Functional — vitest integration style
  - A11y — Playwright + `@axe-core/playwright`
  - I18n — Playwright locale-sweep (missing-key, RTL, text-expansion)
  - Visual — Playwright snapshot (`toHaveScreenshot`)
  - Perf — `performance.now()` latency budget
- **`generateScaffoldForSpec(spec, level, registry?)`** — canonical entry; runs
  the scaffolder registered for the level, returns `''` if none.
- **`planWrites(spec, config, registry?)`** enumerates scaffold paths from the
  union of every AC's `@Expects` levels.
- **`WritePlanConfig.testDirsByLevel?: Partial<Record<TestLevel, string>>`** —
  per-level directory override; legacy `testUnitDir` / `testE2eDir` removed.

### Added — typed data layer + runtime hardening

- **Branded primitives** (type-level, plain strings on the wire):
  `RequirementId`, `FeatureId`, `AcName`, `IsoDate`, `Sentence`, `Percentage`.
- **Smart constructors** with parse-don't-validate semantics and `typeof` runtime
  guards — callers bypassing TypeScript (JSON.parse, FFI, dynamic imports) get
  a `ParseError`, never a `TypeError`.
- **`EarsStatement`** discriminated union — 5 EARS patterns + natural fallback.
- **`RequirementSource`** discriminated union — 8 source kinds with typed slots
  (stakeholder, regulation, standard, contract, risk, business-goal, incident,
  domain-knowledge).
- **`Rationale`** structured shape — `{ claim; kind; evidence[]; assumptions? }`
  with typed `Evidence` (metric / incident / study / expert-opinion / precedent).
- **`FitCriterion`** discriminated union — `unit-test` / `coverage-threshold` /
  `quality-gate` / `metric` / `inspection` / `demonstration` / `narrative`.
- **`FitCriterionAdapter`** port — per-kind evaluator; projects plug Datadog /
  Grafana / SonarQube adapters.
- **`HistoryEntry`** + `ChangeKind` union — append-only audit log per spec.
- **`$schemaVersion: '2026-04-14'`** first-class on every spec.

### Added — JSON Schema + editor binding

- **`schemas/feature-spec.schema.json`** + **`schemas/requirement-spec.schema.json`**,
  auto-generated from `src/cli/types.ts` via `ts-json-schema-generator`
  (invocable by `npx tsx -e 'import("./src/cli/schema-generate.ts").then(m => m.generateSchemas(...))'`).
- **`validateSpec(spec)`** — ajv-backed runtime validation, lazy-loaded.
- **`requirements schema register [--print] [--force]`** — writes / merges
  `.vscode/settings.json` `json.schemas` entry (created / merged / conflict /
  printed modes).

### Added — `feature new / sync` CLI wiring

- `requirements feature new` — interactive wizard, `--replay <spec>`, `--yes`,
  `--dry-run`, `--no-test`, `--template <id>`.
- `requirements feature sync <spec>` — diff / preview / apply.
- Interactive preview step (always runs): render colored diff via `picocolors`
  + `diff`, three-way select Apply-all / Review-per-file / Cancel, with
  `@clack/prompts`. Opt-in "Open in VS Code" after apply.

### Added — testing infrastructure

- **Property + fuzzy tests via `fast-check`** — 16 algebraic invariants,
  200 runs per property, full `fc.anything()` coverage for smart constructors
  (caught the non-string runtime input class → hardened with typeof guards).
- **100% coverage gates** (lines / branches / functions / statements) on the
  package, **778 tests passing**.
- **`@FeatureTest` / `@Verifies` / `@Satisfies` / `@Refines`** all required in
  tests; zero `describe` / `it` permitted (`REQ-DOG-FOOD`).
- **`tsconfig.json` dans `test/`** — experimentalDecorators honored by the IDE
  for test files.

### Added — documentation

- **Five pitches** (400–600 lines each) under `docs/pitches/` — Default,
  Industrial (Schneider-ready), Lean, Agile, Kanban.
- **`HOW-TO-CREATE-YOUR-STYLE.md`** — 9-section guide to building a custom
  Style (decision matrix, anatomy, step-by-step, worked example `LegalStyle`
  aligned with Catala).
- **`GLOSSARY.md`** — 60+ terms cited with their source standard
  (29148 / Volere / SysML / EARS / project-internal).

### Changed

- **`@Implements` (never shipped) renamed to `@Satisfies`** (SysML-aligned).
- **`TestLevel` enum** gained `Internationalization = 'i18n'`.
- **`Requirement`** base class is now generic over a `RequirementStyle`; fields
  are `abstract readonly` typed (no more JSDoc prose for structural data).
- **`WritePlanConfig`**: `testUnitDir` + `testE2eDir` removed (non-backward-compat);
  replaced by optional `testDirsByLevel?: Partial<Record<TestLevel, string>>`.

### Fixed

- `prompt-shell.ts` — `@clack/prompts` `Option<T>` conditional-type handling on
  generic `T extends string` (now cast via `as ClackOption<T>[]`).
- `sync-core.ts` — `noUncheckedIndexedAccess` strict mode; hunk rendering via
  `pcModule.createColors(true)` for deterministic ANSI output (no TTY detection).
- `schema-generate.ts` — Windows path bug (`new URL().pathname` produced
  `/C:\C:\...`; replaced with `fileURLToPath`); ajv v8 `.errors` lives on the
  compiled validator, not the instance.
- `@Satisfies` / `@Refines` generics relaxed to `ReadonlyArray<abstract new ...>`
  so each decorator argument keeps its own class type.

### Removed

- `@Implements` — never shipped; was in the planning phase only.
- `generateUnitScaffoldForSpec` / `generateE2eScaffoldForSpec` public wrappers —
  replaced by the generic `generateScaffoldForSpec(spec, level, registry?)`.
- `compliance-strict-extended` hidden placeholder command — the orphan-Feature
  gate is now wired into the real `compliance --strict` action.

### Dependencies

- **New runtime**: `@clack/prompts ^0.9.0`, `diff ^7.0.0`, `picocolors ^1.1.1`.
- **New dev**: `@types/diff ^7.0.0`, `ts-json-schema-generator ^2.3.0`,
  `ajv ^8.17.1`, `fast-check ^3.23.2`.

### Roadmap (Tier 2 — planned, visible via `requirement orphan`)

- `REQ-ROUND-TRIP-EDITABLE` — edit either `.ts` or `.spec.json`, regenerate the sibling.
- `REQ-VISUAL-TRACEABILITY` — `requirements trace graph --format mermaid`.
- `REQ-REFACTOR-SAFE` — `requirements feature rename OLD NEW` via ts-morph codemod.
- `REQ-DISCOVERABLE-TRACEABILITY` — `requirements explore` (lazygit-style TUI).
- `REQ-LIVE-FEEDBACK` — `requirements watch` live compliance.
- `REQ-LOW-FRICTION-ACS` — AC-name suggester (n-gram + verb patterns).
- `REQ-SCAFFOLD-EXTENSIBILITY` (delivered) + future custom-TestLevel plugins.

## [0.1.0] — initial private preview

`Feature`, `@FeatureTest`, `@Verifies`, `@Expects`, `@Exclude`, `compliance`,
`trace`, `scaffold`. Not published.
