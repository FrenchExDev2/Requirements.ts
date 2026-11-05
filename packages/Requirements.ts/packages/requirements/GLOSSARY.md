# Glossary — @frenchexdev2/requirements

Single source of truth for terminology across the DSL, CLI, reports, and agent briefs. Cite this file when terms are ambiguous. Sources cited per entry: **29148** (ISO/IEC/IEEE 29148:2018), **Volere** (Robertson & Robertson), **SysML**, **EARS** (Mavin), **BDD** (Gojko Adzic, *Specification by Example*), **project** (internal convention).

---

**AC** — *Acceptance Criterion.* One observable assertion about a Feature's behaviour. Encoded as an abstract method on a `Feature` class. 29148 §3 defines AC as "conditions a deliverable must satisfy to be accepted".

**AcName** — Branded `string` matching `/^[a-z][a-zA-Z0-9]*$/`. Minted via `acName(s)`. project.

**AdapterContext** — Dep bag passed to a `FitCriterionAdapter.evaluate`: `{ fs, clock, logger, root }`. project.

**Allocation / AllocatedTo** — SysML link: a Requirement is allocated to a system component. Future decorator `@AllocatedTo` — not shipped in Phase 0.

**Branded type** — A TypeScript nominal type achieved via an intersection with a phantom-tagged object. Zero runtime cost; distinct from other strings/numbers in code, indistinguishable on the JSON wire. project.

**ChangeKind** — Discriminated tag for a `HistoryEntry`: `Created | StatusChanged | StatementEdited | AcAdded | AcRemoved | AcRenamed | SatisfiedByChanged | FitCriterionAdded | FitCriterionRemoved | RiskReassessed | RationaleUpdated | Deprecated`. project.

**Citation** — Parsed legal citation: `{ jurisdiction; act; article?; paragraph? }`. Carried by `source.type = 'regulation'`. project (derived from legal-drafting practice).

**Coverage** — Smart-constructor record `{ acsCovered; acsTotal; percentage }` with invariant `percentage = covered/total*100`. project.

**Cross-border check** — Verification protocol: before a Phase 1 stream declares done, it must verify every Requirement it *jointly* contributes to (`○` in the cross-border matrix) end-to-end through its files, not only its own primary Requirements. project.

**Decomposition** — Requirement → Feature[] relationship. Realised at runtime via `@Satisfies` on Features (bidirectional registry). Conceptually inverse of SysML `satisfy`.

**DoD** — *Definition of Done.* Per-stream checklist merged into each agent's brief. project.

**EARS** — *Easy Approach to Requirements Syntax* (Mavin et al., Rolls-Royce, IEEE RE'09). Five patterns that constrain natural-language requirements: Ubiquitous / Event-driven / State-driven / Optional feature / Unwanted behaviour. Plus a `natural` fallback in this DSL (generates warning).

**Evidence** — Data backing a `Rationale`: metric, incident, study, expert-opinion, precedent. project (synthesized from 29148 + Volere #4).

**Feature** — A cohesive bundle of behaviour. Abstract class; abstract methods are ACs. Links upward to Requirements via `@Satisfies`. DSL core.

**FeatureId** — Branded `string` matching `/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/`. Examples: `CART`, `USER-AUTH`. project.

**FitCriterion** — The measurable threshold that says "a Requirement is met" (Volere #6). Discriminated union: `unit-test | coverage-threshold | quality-gate | metric | inspection | demonstration | narrative`. Each variant is executable via a `FitCriterionAdapter`.

**FitCriterionAdapter** — Port: evaluates one `FitCriterion` kind against real-world evidence. Returns `FitVerdict`. project.

**FitVerdict** — `Met | Unmet | Pending | NotApplicable`. project.

**Feature-test** — Decorator `@FeatureTest(FeatureClass)`. Class-level; links test suite to a Feature, auto-registers with vitest. DSL core.

**HistoryEntry** — `{ date; author; change: ChangeKind; reason }`. Append-only log carried by specs. project.

**Implements** — *Rejected term.* Use `@Satisfies` instead (SysML-aligned). `@Implements` was the initial name during planning; renamed for industry alignment.

**INCOSE** — International Council on Systems Engineering. Publishes the *Guide for Writing Requirements* — one of the sources for `verificationMethod` and the `allocate` link.

**Inspection** — Verification method: manual review against a checklist. 29148 §5.2.5. Mapped to `FitCriterion.kind = 'inspection'`.

**IsoDate** — Branded `string` matching ISO 8601. Minted via `isoDate(s)`. project.

**Joint satisfier** — A Feature that contributes (`○`) but doesn't suffice alone to meet a Requirement. Contrast *primary satisfier* (`●`). project.

**Parse, don't validate** — Methodology: collect free text once, construct a branded/typed value, rely on the type system thereafter. project (adapted from Alexis King).

**Percentage** — Branded `number` ∈ [0, 100]. Minted via `percentage(n)`. project.

**Phase 0** — The starter-pack PR: frozen contract types, ports, Feature + Requirement stubs, deps, glossary. Blocks all Phase 1 streams. project.

**Priority** — Enum: `Critical | High | Medium | Low`. Used on Feature and Requirement. DSL core.

**Prompt** — Port abstracting interactive user input. Real adapter wraps `@clack/prompts`; test adapter is a scripted mock. project.

**Rationale** — Structured reasoning for a Requirement: `{ claim; kind: RationaleKind; evidence; assumptions? }`. Volere #4 + project typing.

**RationaleKind** — `evidence-based | principle | value-driven | regulatory-compliance | risk-mitigation | precedent`. project.

**Refines / @Refines** — SysML `refine` / `derive`. Class decorator on a child Requirement pointing to parent(s). project (SysML).

**Requirement** — The WHY tier. Abstract class with `id | title | priority | status`. Full structural data (statement, source, rationale, fit criteria) in `RequirementSpec`. SysML / 29148 / Volere.

**RequirementId** — Branded `string` matching `/^REQ-[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/`. Examples: `REQ-CART-PERSIST`, `REQ-GDPR-25`. project.

**RequirementKind** — `Functional | NonFunctional | Constraint | Compliance | UserStory`. 29148 §5.2.5.

**RequirementSource** — Discriminated provenance: `stakeholder | regulation | standard | contract | risk | business-goal | incident | domain-knowledge`. Volere #5 + project taxonomy.

**RequirementSpec** — The JSON-serializable shape of a Requirement. Declared in `@frenchexdev2/requirements-shared-kernel/types` and forwarded by the public facade. project.

**Risk** — `{ level; ifNotMet; mitigations? }`. The `level` is one of the project's `RiskTaxonomy.levels` (generative). Volere #11.

**RiskLevel / RiskTaxonomy** — Generative: default 4-tier `Critical/High/Medium/Low`; projects redeclare (DO-178C 5-tier for safety-critical, 4-tier `Constitutional/Statutory/Regulatory/Operational` for legal). project.

**Satisfies / @Satisfies** — SysML `satisfy`. Class decorator on a Feature pointing to the Requirement(s) it helps meet. Bidirectional: populates both `feature.satisfies()` and `requirement.satisfiedBy()` registries.

**SatisfiedBy** — Inverse of `satisfies`: a Requirement's view of its satisfying Features. Used in reports ("satisfied by: ShoppingCartFeature, OrderHistoryFeature").

**SchemaVersion** — Date-based constant (`"2026-04-14"`) carried in every spec as `$schemaVersion`. Enables future migration. project.

**Sentence** — Branded non-empty string ending in `.` / `!` / `?`. Minted via `sentence(s)`. Used for every EARS slot, fit-criterion narrative, etc. project.

**Spec** — Union: `FeatureSpec | RequirementSpec`. Streams B/C/E are generic over this. project.

**Specifies / SpecifiedBy** — The Feature → AC link. Structurally *composition* (UML black diamond) — encoded by TypeScript (AC is abstract method on Feature class), no decorator needed. Reports use `specifies: addItemIncreasesCount, …`. BDD tradition (Adzic).

**Status** — Project's current lifecycle state for a spec. Default workflow: `Draft → Approved → Implemented → Verified → Deprecated`. Projects can declare a custom FSM (states + transitions) in `requirements.config.json` → Stream E codegen emits the typed union. 29148 §5.3.

**StatusWorkflow** — `{ states; initial; transitions; terminal }`. project.

**Stream** — A Phase 1 parallel workstream. Streams A (wizard) · B (source generator) · C (diff/sync) · D (clack adapter) · E (schema + register) · F (requirement commands). project.

**SyncPlan** — `{ spec; entries: SyncEntry[] }`. Contract between cores and shell for diff/apply. Each entry: `{ path; status: 'create'|'unchanged'|'modified'; proposed; current; hunks }`. project.

**TestLevel** — Enum: `Unit | Functional | EndToEnd | Accessibility | Visual | Performance`. Used by `@Expects`. DSL core.

**TracedTo** — Opaque external link: `linear | github | notion | jira | url`. Carried by Requirement spec. project.

**Verifies / @Verifies** — SysML `verify`. Method decorator on a test method pointing to the AC it proves. DSL core.

**VerifiedBy** — Inverse of `verifies`: an AC's view of the decorated test methods that verify it. Complete qualification resolves this relation to individual executed results and their implementation targets. project.

**VerificationMethod** — `Test | Inspection | Analysis | Demonstration`. 29148 §5.2.5.

**Volere** — Industry-standard Requirements Specification Template (Robertson & Robertson, Atlantic Systems Guild). 27 attributes per atomic requirement. Cited throughout this DSL for field-level grounding.

---

## Style — the extension point

**RequirementStyle** — The bundle a project adopts for its Requirement ontology + behaviours. Four sub-interfaces: `StyleVocabulary` (data: kinds, statuses, risk levels, sources, statement patterns), `StyleValidators` (pluggable shape checks), `StyleTemplates` (pre-filled skeletons for `requirement new`), `RequirementReporter` (how to render). Plus pluggable `FitCriterionAdapter[]`. Defined in [`src/style.ts`](src/style.ts). project — open/closed via presets.

**DefaultStyle** — The 29148 + Volere + EARS preset. 5 kinds, 5 statuses, 4 risk levels, 6 EARS patterns + natural fallback. Ships at `@frenchexdev2/requirements` (re-exported from the main entry). Used when no project-specific Style is configured. Pitch: [`docs/pitches/default.md`](docs/pitches/default.md).

**IndustrialStyle** — Factory automation / process control / OT cybersecurity. Aligned with IEC 61508 / 61511 / 62443 / 61131-3 / 61850, ISA-88 / 95 / 18.2, ISO 13849, IEC 62061, 21 CFR Part 11, GAMP 5. 10 kinds, 13-state workflow with Safety/Security/Customer approval gates, SIL 1-4 risk taxonomy with likelihood × impact matrix, 13 verification methods (FAT, SAT, HIL, SILProofTest, …), 10 source kinds (hazop, lopa, fmea, cybersecurity-threat, …), 10 statement patterns (ubiquitous/event/state/optional/unwanted EARS + safety-function + interlock + alarm + security-zone), 9 templates (sif-iec61511, process-interlock, alarm-isa182, cyber-zone-62443, batch-recipe-isa88, availability-sla, regulatory-ce-atex, gxp-21cfr11, interoperability-opcua). Pitch: [`docs/pitches/industrial.md`](docs/pitches/industrial.md).

**LeanStyle** — Toyota Production System / A3 / PDCA / Gemba / VSM / Kaizen. 9 kinds including ValueAdding / Waste-Elimination / Kaizen-Experiment / Respect-for-People. 8-state A3 workflow with rework loops. Impact × Effort risk matrix. 8 verification methods (GembaWalk, A3Review, FiveWhys, PDCA, VSM, Kaizen, StandardWork, TaktTimeCheck). 8 source kinds including gemba-walk, vsm with TIMWOODS, hoshin-plan, kata-coaching. 6 statement patterns (problem-statement, countermeasure, standard-work, value-proposition, kaizen-hypothesis, natural). Pitch: [`docs/pitches/lean.md`](docs/pitches/lean.md).

**AgileStyle** — Scrum / XP / SAFe / BDD. 8 kinds (UserStory, Epic, Enabler, Spike, TechnicalDebt, Bug, NonFunctional, Research). 8-state workflow with rework loops. 5-level severity risk. 8 verification methods (AcceptanceTest, DoD, DemoToPO, UserValidation, PairReview, TDD, BDD, ExploratoryTesting). 8 source kinds (product-owner, user-interview, sprint-retrospective, …). 7 statement patterns (user-story, given-when-then, epic, enabler, spike, bug, natural) with INVEST-enforcing validators. Pitch: [`docs/pitches/agile.md`](docs/pitches/agile.md).

**KanbanStyle** — Anderson's Kanban Method. 6 Classes of Service as `requirementKinds` (Standard, Expedite, FixedDate, Intangible, LifeCycleReset, Defect). 9-state workflow (Backlog → Selected → Analysis → Development → Testing → Ready → Deployed → Observed → Archived) with rework loops. 5 DelayHarm levels (DelayHarmLinear, DelayHarmUrgent, DelayHarmFixedDate, DelayHarmIntangible, DelayHarmMinimal) with likelihood × impact matrix. 7 verification methods (LeadTimeWithinSLE, DeployedToProduction, ObservedInProduction, BlockerCleared, SlaMet, FlowMetricGreen, CumulativeFlowHealthy). 8 source kinds (flow-metric, cumulative-flow-diagram, lead-time-distribution, customer-sla, …). 7 statement patterns (service-request, fixed-date-commitment, expedite-pull, intangible-investment, defect-pull, sla-commitment, natural) with validators enforcing Cost-of-Delay discipline. Pitch: [`docs/pitches/kanban.md`](docs/pitches/kanban.md).

**KindsOf / StatusesOf / RiskLevelsOf / VerificationMethodsOf / RationaleKindsOf / SourceKindsOf / StatementPatternsOf** — Generic type helpers that narrow `Requirement<S>`'s fields to a specific Style's vocabulary at compile time when the Style is declared as `const`. See [`src/style.ts`](src/style.ts).

**StyleVocabulary / StyleValidators / StyleTemplates / RequirementReporter** — The four sub-interfaces a custom Style implements. SOLID/ISP: projects can override just one (e.g. custom reporter, default vocabulary).

**Custom Style** — Any project can publish its own preset (e.g. `@acme/requirements-style-aerospace` based on DO-178C; `@acme/requirements-style-banking` based on Basel + ISO 27001; `@acme/requirements-style-legal` for Catala-style obligations). Published as a standalone npm package; selected in `requirements.config.json` via a module path.

---

*Last updated: 2026-04-14. When in doubt, cite this file. Amendments via a `[glossary-amend]` PR.*
