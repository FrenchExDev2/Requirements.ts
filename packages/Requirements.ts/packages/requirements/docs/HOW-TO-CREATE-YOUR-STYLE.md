# How to create your own Style

The Style system is the extension point of `@frenchexdev2/requirements`. If none of the five built-in presets (Default, Industrial, Lean, Agile, Kanban) matches your domain, you ship your own — either in-tree under `requirements.config.json`, or as a standalone npm package others can depend on.

This guide walks from "why would I" to "published on npm" in ~30 minutes.

---

## Table of contents

1. [Decision guide — do I need a custom Style?](#1-decision-guide)
2. [Anatomy of a Style](#2-anatomy-of-a-style)
3. [Step-by-step — minimal custom Style](#3-step-by-step)
4. [Worked example — a LegalStyle for obligation/permission/prohibition](#4-worked-example-legalstyle)
5. [Testing your Style](#5-testing-your-style)
6. [Wiring it into a project](#6-wiring-into-a-project)
7. [Publishing as a reusable npm package](#7-publishing-as-an-npm-package)
8. [Common pitfalls](#8-common-pitfalls)
9. [Reference — the full Style interface](#9-reference)

---

## 1. Decision guide

Ask yourself the three questions below. If you answer **yes** to any one, you need your own Style. If you answer **no** to all three, use DefaultStyle and move on.

### Q1 — Does your domain carry vocabulary that *must* survive into the code?

Examples:
- Regulated industry (medical, aviation, nuclear) → kinds like `Safety`, `Compliance`, `Regulatory` need to be first-class, and validators must enforce SIL / DAL / PL ratings.
- Legal engineering → `obligation`, `permission`, `prohibition`, `exception` are not user preferences, they are the deontic structure of the text.
- Financial services → `risk-limit`, `capital-requirement`, `conduct-rule` must be traceable to Basel / MiFID / Dodd-Frank.

If your domain has a **normative standard** you want to encode (not just reference), build a Style.

### Q2 — Does your process enforce gates that DefaultStyle's five-state lifecycle can't express?

DefaultStyle: `Draft → Approved → Implemented → Verified → Deprecated`.

If your shop needs:
- A safety-sign-off gate (IndustrialStyle adds `SafetyApproval`, `SecurityApproval`, `CustomerApproval`)
- A legal-review gate
- A multi-party sign-off (customer + vendor + integrator)
- Different gates per Requirement kind
- An A3 / PDCA loop (LeanStyle)

… you need a Style with a tailored `StatusWorkflow`.

### Q3 — Does your team need templates and statement patterns beyond EARS?

EARS works for ~80% of systems requirements. You may need:
- `safety-function` pattern (IEC 61511 — IndustrialStyle)
- `user-story` pattern (AgileStyle)
- `problem-statement` / `kaizen-hypothesis` (LeanStyle)
- `service-request` / `expedite-pull` / `fixed-date-commitment` (KanbanStyle)
- Domain-specific like `batch-recipe` (ISA-88) or `alarm-rationalisation` (ISA-18.2)

If EARS feels like a straitjacket, ship your own patterns.

### Decision matrix

| Your situation                                | Use               |
|-----------------------------------------------|-------------------|
| First-time adoption, general software         | DefaultStyle      |
| Factory / OT / PLC / SIS                      | IndustrialStyle   |
| Toyota-flavoured continuous improvement       | LeanStyle         |
| Scrum / SAFe / XP                             | AgileStyle        |
| Flow-based delivery, classes of service       | KanbanStyle       |
| Regulated finance (Basel / MiFID)             | Custom            |
| Legal / regulatory engineering                | Custom (see §4)   |
| Aerospace / DO-178C                           | Custom (fork Industrial) |
| Medical / IEC 62304                           | Custom (fork Industrial) |
| Automotive / ISO 26262                        | Custom (fork Industrial) |

---

## 2. Anatomy of a Style

A `RequirementStyle` bundles four sub-interfaces + one registry. Defined in [`src/style.ts`](../src/style.ts).

```ts
interface RequirementStyle {
  readonly id: string;                                   // e.g. '@acme/requirements-style-legal'
  readonly version: string;                              // semver

  readonly vocabulary: StyleVocabulary;                  // data
  readonly validators: StyleValidators;                  // pure shape checks
  readonly templates: StyleTemplates;                    // pre-filled skeletons
  readonly reporter: RequirementReporter;                // how to render

  readonly fitCriterionAdapters: readonly FitCriterionAdapter[];  // evaluators
}
```

### Sub-interface 1 — `StyleVocabulary` (data)

```ts
interface StyleVocabulary {
  requirementKinds:     readonly string[];             // Functional, Safety, Obligation, …
  statusWorkflow:       StatusWorkflow;                // small FSM
  riskTaxonomy:         RiskTaxonomy;                  // levels + optional matrix
  verificationMethods:  readonly string[];             // Test, Inspection, Certification, …
  rationaleKinds:       readonly string[];             // evidence-based, regulatory-compliance, …
  sourceKinds:          readonly SourceKindSchema[];   // where requirements come from
  statementPatterns:    readonly StatementPatternSchema[]; // EARS, safety-function, user-story, …
}
```

**Everything here is data.** No code. Projects can hand-edit a `requirements.config.json` to override just the vocabulary while reusing DefaultStyle's validators, templates, and reporter. Pure **O** (open/closed) — projects compose.

### Sub-interface 2 — `StyleValidators` (shape checks)

```ts
interface StyleValidators {
  validateStatement(statement: unknown): ValidationResult;
  validateSpec(spec: unknown): ValidationResult;
}
```

Two pure functions. They enforce domain-specific invariants:
- IndustrialStyle: `Safety` kind requires SIL 1-4, not NonSIL
- AgileStyle: `UserStory` kind requires `user-story` or `given-when-then` pattern
- LeanStyle: `Waste-Elimination` kind requires `gemba-walk` or `vsm` source (go see, do not theorise)

Validators run at wizard time (before the user commits) and at CI time (via `compliance --strict`).

### Sub-interface 3 — `StyleTemplates` (skeletons)

```ts
interface StyleTemplates {
  readonly templates: readonly RequirementTemplate[];
  findTemplate(id: string): RequirementTemplate | undefined;
}

interface RequirementTemplate {
  readonly id: string;            // e.g. 'sif-iec61511'
  readonly label: string;
  readonly description: string;
  readonly skeleton: TemplateSkeleton;  // partial pre-fill
}
```

Templates let your users run `requirement new --template sif-iec61511` and get a pre-filled wizard state. They're the discoverability surface: `requirement new` with no `--template` lists them in a `select`.

### Sub-interface 4 — `RequirementReporter` (rendering)

```ts
interface RequirementReporter {
  renderStatement(statement: unknown): string;
  renderRequirement(spec: unknown): string;
  renderMarkdown(spec: unknown): string;
}
```

Three pure functions. Each variant of your `statementPatterns` should render to a human-readable sentence via the pattern's `template` field.

### Plus — FitCriterionAdapters

```ts
readonly fitCriterionAdapters: readonly FitCriterionAdapter[];
```

These are the *live* backends that evaluate fit criteria against real systems: unit test results, coverage reports, Datadog metrics, SonarQube quality gates, Grafana SLOs, etc. Per-kind; projects can drop in custom adapters for their own metric platform without forking the Style.

---

## 3. Step-by-step

### 3.1 Copy the closest preset

Pick whichever of the five built-ins is closest to your domain. Copy it:

```bash
cp packages/requirements/src/styles/default.ts packages/requirements/src/styles/my-style.ts
```

Or in your own project, under `src/styles/my-style.ts`.

### 3.2 Rename the exports

```ts
export const MY_VOCABULARY: StyleVocabulary = { … };
export const MY_VALIDATORS: StyleValidators = { … };
export const MY_TEMPLATES: StyleTemplates = { … };
export const MY_REPORTER: RequirementReporter = { … };
export const MyStyle: RequirementStyle = {
  id: '@my-org/requirements-style-mine',
  version: '0.1.0',
  vocabulary: MY_VOCABULARY,
  validators: MY_VALIDATORS,
  templates: MY_TEMPLATES,
  reporter: MY_REPORTER,
  fitCriterionAdapters: [],
};
export type MyStyleType = typeof MyStyle;
```

### 3.3 Edit the vocabulary

Rewrite `requirementKinds`, `statusWorkflow.states` and `statusWorkflow.transitions`, `riskTaxonomy.levels`, `verificationMethods`, `rationaleKinds`. Keep it to what you actually need — 5-10 values per list is a sweet spot; more than 20 is vocabulary smell.

For `sourceKinds`, each entry is a typed shape. Example — a `study-citation` source:

```ts
{ kind: 'study-citation', label: 'Peer-reviewed study', slots: [
  { name: 'title',   type: 'string', required: true },
  { name: 'authors', type: 'string', required: true },
  { name: 'year',    type: 'number', required: true },
  { name: 'doi',     type: 'string', required: false },
  { name: 'url',     type: 'url',    required: false },
]}
```

For `statementPatterns`, each entry is a pattern with a `template` (with `{slot}` placeholders) and its `slots`. Example — an obligation pattern for legal:

```ts
{ pattern: 'obligation',
  label: 'Deontic obligation',
  template: '{subject} shall {action} {conditions}, per {legalBasis}.',
  slots: [
    { name: 'subject',    required: true, hint: 'the party bound by the obligation' },
    { name: 'action',     required: true },
    { name: 'conditions', required: true, hint: 'when/where/how the obligation applies' },
    { name: 'legalBasis', required: true, hint: 'citation of the source article' },
  ] }
```

### 3.4 Tailor the validators

Add domain-specific rules. Template:

```ts
validateSpec(spec: unknown): ValidationResult {
  if (!spec || typeof spec !== 'object') return err('', 'spec must be an object');
  const s = spec as Record<string, unknown>;
  const errors: { path: string; message: string }[] = [];

  if (s.kind === 'requirement') {
    // Rule: Obligation kind must have a legalBasis slot populated
    const stmt = s.statement as Record<string, unknown> | undefined;
    if (s.requirementKind === 'Obligation' && !stmt?.legalBasis) {
      errors.push({ path: 'statement.legalBasis', message: 'Obligations must cite their legal basis' });
    }
    // … more rules …
  }

  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
}
```

**Each rule should fail a load-bearing invariant** — not stylistic preference. Bad rule: "title must be <60 chars". Good rule: "Regulatory kind requires a standard or regulation source".

### 3.5 Write templates

3-10 templates cover most domains. Each template is a typed skeleton:

```ts
const MY_TEMPLATE_LIST: readonly RequirementTemplate[] = [
  {
    id: 'obligation-gdpr',
    label: 'GDPR obligation',
    description: 'A data-protection obligation under GDPR, with article citation.',
    skeleton: {
      kind: 'Obligation',
      statementPattern: 'obligation',
      priority: 'Critical',
      defaultFitCriterionKinds: ['inspection', 'quality-gate'],
      rationaleKind: 'regulatory-compliance',
      verificationMethod: 'Audit',
    },
  },
  // …
];
```

### 3.6 Implement the reporter

Simplest form — template substitution:

```ts
renderStatement(statement: unknown): string {
  if (!statement || typeof statement !== 'object') return '';
  const s = statement as Record<string, string>;
  const schema = MY_VOCABULARY.statementPatterns.find(p => p.pattern === s.pattern);
  if (!schema) return JSON.stringify(statement);
  let out = schema.template;
  for (const slot of schema.slots) out = out.replace(`{${slot.name}}`, s[slot.name] ?? '…');
  return out;
}
```

`renderMarkdown` is where you shine — emit the domain's expected deliverable format: a GAMP 5 qualification sheet, a FAT test procedure, a legal article, an A3 one-pager, a user-story card, etc.

### 3.7 Compile + use it

```ts
import { Requirement, Priority } from '@frenchexdev2/requirements';
import { MyStyle, type MyStyleType } from './styles/my-style';

export abstract class MyFirstRequirement extends Requirement<MyStyleType> {
  readonly id = 'REQ-DEMO-001';
  // … all fields narrowed to MyStyle's vocabulary at compile time …
}
```

Done. `Requirement<MyStyleType>` will narrow `kind`, `status`, `risk.level`, `verificationMethod` to exactly your Style's declared values. Typos fail at `tsc` time, not at runtime.

---

## 4. Worked example — LegalStyle

A Style for legal engineering in the spirit of Catala (INRIA, [catala-lang.org](https://catala-lang.org/)). Deontic logic: every norm is an **obligation**, **permission**, or **prohibition**, with optional **exceptions**.

### Vocabulary

```ts
export const LEGAL_VOCABULARY: StyleVocabulary = {
  requirementKinds: [
    'Obligation',      // "X shall …"
    'Permission',      // "X may …"
    'Prohibition',     // "X shall not …"
    'Exception',       // overrides another norm under stated conditions
    'Definition',      // defines a term used by other norms
    'Delegation',      // transfers a competence
  ],

  statusWorkflow: {
    states: ['Drafting', 'InternalReview', 'LegalReview', 'Approved', 'Enacted', 'Sunsetted', 'Repealed'],
    initial: 'Drafting',
    transitions: [
      { from: 'Drafting',       to: 'InternalReview' },
      { from: 'InternalReview', to: 'LegalReview' },
      { from: 'LegalReview',    to: 'Approved' },
      { from: 'Approved',       to: 'Enacted' },
      { from: 'Enacted',        to: 'Sunsetted' },
      { from: 'Enacted',        to: 'Repealed' },
      { from: 'LegalReview',    to: 'Drafting' },
    ],
    terminal: ['Sunsetted', 'Repealed'],
  },

  riskTaxonomy: {
    levels: ['Constitutional', 'Statutory', 'Regulatory', 'Operational'],
  },

  verificationMethods: ['LegalReview', 'JurisprudenceCheck', 'CounselOpinion', 'Simulation', 'Audit'],

  rationaleKinds: [
    'constitutional-mandate',
    'international-treaty',
    'statute',
    'jurisprudence',
    'preamble-intent',
    'policy-goal',
    'counter-party-claim',
  ],

  sourceKinds: [
    { kind: 'constitution', label: 'Constitutional article', slots: [
      { name: 'country', type: 'string', required: true, hint: 'FR / EU / US / …' },
      { name: 'article', type: 'string', required: true },
      { name: 'revision', type: 'string', required: false },
    ]},
    { kind: 'statute', label: 'Statute / law', slots: [
      { name: 'country',   type: 'string', required: true },
      { name: 'name',      type: 'string', required: true, hint: 'e.g. Code civil, Loi Informatique et Libertés' },
      { name: 'article',   type: 'string', required: true },
      { name: 'paragraph', type: 'string', required: false },
      { name: 'revision',  type: 'string', required: false, hint: 'version / dated edition' },
    ]},
    { kind: 'eu-directive', label: 'EU directive / regulation', slots: [
      { name: 'id',       type: 'string', required: true, hint: 'e.g. GDPR, DSA, AI Act' },
      { name: 'article',  type: 'string', required: true },
      { name: 'recital',  type: 'string', required: false },
    ]},
    { kind: 'jurisprudence', label: 'Court decision / precedent', slots: [
      { name: 'court',    type: 'string',   required: true },
      { name: 'decision', type: 'string',   required: true },
      { name: 'date',     type: 'iso-date', required: true },
      { name: 'citation', type: 'string',   required: false },
    ]},
    { kind: 'counsel-opinion', label: 'Legal counsel opinion', slots: [
      { name: 'firm',      type: 'string',   required: true },
      { name: 'lawyer',    type: 'string',   required: true },
      { name: 'date',      type: 'iso-date', required: true },
      { name: 'reference', type: 'string',   required: false },
    ]},
  ],

  statementPatterns: [
    { pattern: 'obligation',
      label: 'Deontic obligation',
      template: '{subject} shall {action} {conditions}, per {legalBasis}.',
      slots: [
        { name: 'subject',     required: true, hint: 'the party bound' },
        { name: 'action',      required: true },
        { name: 'conditions',  required: true, hint: 'when / where / how' },
        { name: 'legalBasis',  required: true, hint: 'citation' },
      ] },
    { pattern: 'permission',
      label: 'Deontic permission',
      template: '{subject} may {action} {conditions}, subject to {constraints}.',
      slots: [
        { name: 'subject',     required: true },
        { name: 'action',      required: true },
        { name: 'conditions',  required: true },
        { name: 'constraints', required: false },
      ] },
    { pattern: 'prohibition',
      label: 'Deontic prohibition',
      template: '{subject} shall not {action} {conditions}. Penalty: {penalty}.',
      slots: [
        { name: 'subject',    required: true },
        { name: 'action',     required: true },
        { name: 'conditions', required: true },
        { name: 'penalty',    required: true, hint: 'fine / imprisonment / administrative' },
      ] },
    { pattern: 'exception',
      label: 'Exception to a norm',
      template: 'Notwithstanding {parentNorm}, {subject} {modifiedAction} when {conditions}.',
      slots: [
        { name: 'parentNorm',     required: true, hint: 'REQ-ID of the norm being excepted' },
        { name: 'subject',        required: true },
        { name: 'modifiedAction', required: true },
        { name: 'conditions',     required: true },
      ] },
    { pattern: 'definition',
      label: 'Legal definition',
      template: 'For the purposes of {scope}, "{term}" means {definition}.',
      slots: [
        { name: 'scope',      required: true },
        { name: 'term',       required: true },
        { name: 'definition', required: true },
      ] },
  ],
};
```

### Validators — load-bearing legal invariants

```ts
export const LEGAL_VALIDATORS: StyleValidators = {
  validateStatement(statement) { /* pattern-slot check */ },

  validateSpec(spec) {
    const errors: { path: string; message: string }[] = [];
    const s = spec as Record<string, unknown>;

    if (s.kind === 'requirement') {
      // Rule 1: Obligation / Prohibition / Permission must have a typed source
      if (['Obligation', 'Prohibition', 'Permission'].includes(s.requirementKind as string)) {
        const source = s.source as Record<string, unknown> | undefined;
        const t = source?.type as string | undefined;
        if (!t || !['constitution', 'statute', 'eu-directive', 'jurisprudence'].includes(t)) {
          errors.push({ path: 'source.type', message: 'Deontic norms require a constitution / statute / eu-directive / jurisprudence source' });
        }
      }

      // Rule 2: Exception kind must reference parentNorm via @Refines
      if (s.requirementKind === 'Exception') {
        const stmt = s.statement as Record<string, unknown> | undefined;
        if (!stmt?.parentNorm) {
          errors.push({ path: 'statement.parentNorm', message: 'Exceptions must cite a parent norm' });
        }
      }

      // Rule 3: Enacted status must have LegalReview verification method
      if (s.status === 'Enacted') {
        const vm = s.verificationMethod as string | undefined;
        if (vm !== 'LegalReview' && vm !== 'CounselOpinion') {
          errors.push({ path: 'verificationMethod', message: 'Enacted norms require LegalReview or CounselOpinion verification' });
        }
      }
    }

    return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
  },
};
```

### Reporter — output fit for publication

```ts
renderMarkdown(spec: unknown): string {
  const s = spec as Record<string, unknown>;
  const source = s.source as Record<string, unknown> | undefined;
  return [
    `## ${s.id} — ${s.title}`,
    '',
    `*Kind*: ${s.requirementKind} | *Status*: ${s.status} | *Tier*: ${(s.risk as Record<string, unknown>)?.level}`,
    '',
    '### Text',
    '',
    `> ${this.renderStatement(s.statement)}`,
    '',
    `**Legal basis**: ${source?.type} — ${Object.entries(source ?? {}).filter(([k]) => k !== 'type').map(([k,v]) => `${k}: ${String(v)}`).join(' · ')}`,
  ].join('\n');
}
```

### Usage

```ts
import { LegalStyle, type LegalStyleType } from '@my-org/requirements-style-legal';
import { Requirement, Priority } from '@frenchexdev2/requirements';

export abstract class RightToErasureObligationRequirement extends Requirement<LegalStyleType> {
  readonly id = 'REQ-GDPR-17';
  readonly title = 'Right to erasure';
  readonly priority = Priority.Critical;
  readonly status = 'Enacted' as const;
  readonly kind = 'Obligation' as const;

  readonly statement = {
    pattern: 'obligation' as const,
    subject: 'the data controller',
    action: 'erase personal data without undue delay',
    conditions: 'upon request by the data subject, where the legal grounds for processing no longer apply',
    legalBasis: 'GDPR Art. 17',
  };

  readonly rationale = {
    claim: 'The data subject has a fundamental right to have personal data erased where the grounds for its processing no longer apply.',
    kind: 'constitutional-mandate' as const,
    evidence: [
      { kind: 'precedent' as const, requirement: 'REQ-ECHR-8', rationale: 'ECHR Art. 8 — right to respect for private and family life' },
    ],
  };

  readonly fitCriteria = [/* … */];

  readonly verificationMethod = 'LegalReview' as const;

  readonly source = {
    type: 'eu-directive' as const,
    id: 'GDPR',
    article: 'Art. 17',
    recital: 'Recital 65',
  };

  readonly risk = {
    level: 'Constitutional' as const,
    ifNotMet: 'Regulatory enforcement action, fines up to 4% global annual turnover, class action by data subjects.',
  };
}
```

---

## 5. Testing your Style

Dog-food the DSL — use `@FeatureTest` and `@Verifies`, never `describe`/`it`.

```ts
// test/unit/legal-style.test.ts
import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements';
import { LEGAL_VALIDATORS } from '../src/styles/legal';
import { LegalStyleFeature } from '../requirements/features/legal-style';

@FeatureTest(LegalStyleFeature)
class LegalStyleTests {
  @Verifies<LegalStyleFeature>('obligationRequiresTypedSource')
  'obligation requires a constitution / statute / eu-directive / jurisprudence source'() {
    const spec = {
      kind: 'requirement',
      requirementKind: 'Obligation',
      source: { type: 'stakeholder' },  // wrong — not a deontic source
    };
    const result = LEGAL_VALIDATORS.validateSpec(spec);
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.path === 'source.type')).toBe(true);
  }

  @Verifies<LegalStyleFeature>('exceptionRequiresParentNorm')
  'exception kind requires statement.parentNorm'() { /* … */ }

  @Verifies<LegalStyleFeature>('enactedRequiresLegalReview')
  'enacted status requires LegalReview or CounselOpinion verification'() { /* … */ }
}
```

Coverage threshold per package rule: **≥ 98% on the Style source files**. Run `vitest run --coverage` (never without `--coverage`).

---

## 6. Wiring into a project

### In-tree (simplest)

Drop the Style file in `src/styles/` and reference it in `requirements.config.json`:

```jsonc
{
  "featuresDir": "requirements/features",
  "testDirs":    ["test/unit", "test/e2e"],
  "style":       "./src/styles/legal.ts"     // relative path resolved from project root
}
```

### From an npm package

```jsonc
{
  "style": "@my-org/requirements-style-legal"
}
```

The CLI resolves the module, imports the default-exported `RequirementStyle`, and uses it for wizards, validation, templates, and reporter output.

### Multiple styles in the same repo

Split your requirements into subdirectories, each with its own config:

```
requirements/
  operational/
    requirements.config.json    → AgileStyle
    requirements/…
    features/…
  compliance/
    requirements.config.json    → LegalStyle
    requirements/…
    features/…
```

The CLI auto-detects the nearest `requirements.config.json` walking up from the working directory.

---

## 7. Publishing as an npm package

Minimal package structure:

```
@my-org/requirements-style-legal/
  package.json
  src/
    index.ts              → exports LegalStyle, type LegalStyleType
    vocabulary.ts
    validators.ts
    templates.ts
    reporter.ts
  test/
    unit/…                → @FeatureTest tests, 98% coverage
  requirements/           → dog-food: self-describe your Style as Requirements using… your own Style
    features/…
    requirements/…
  README.md               → pitch (use docs/pitches/ as models)
  GLOSSARY.md             → domain-specific terms
  LICENSE                 → MIT
```

`package.json`:

```jsonc
{
  "name": "@my-org/requirements-style-legal",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "peerDependencies": {
    "@frenchexdev2/requirements": "^1.0.0"
  }
}
```

**Only `peerDependencies`.** Your Style depends on types from `@frenchexdev2/requirements` but must not bundle it — consumers use their own version.

Publish:

```bash
npm run build && npm publish --access public
```

Ship a README pitch (see [`docs/pitches/industrial.md`](pitches/industrial.md) as the benchmark) so adopters can decide in 5 minutes whether your Style fits.

---

## 8. Common pitfalls

**PF1 — Too many `requirementKinds`.**
If your list has 25 kinds, nobody remembers them. Cluster. Legal: 6. Industrial: 10. If you can't fit yours on a post-it, rethink.

**PF2 — Validators enforcing style, not invariants.**
"Title must be >20 chars" is aesthetics. "Safety kind requires SIL 1-4" is an auditable invariant. Only the second kind belongs in validators.

**PF3 — Reusing `natural` pattern as default.**
`natural` is a warned fallback for brownfield migration. If your style's validators never emit warnings for `natural`, users will default to it and your typed patterns die. Make the warning visible.

**PF4 — Templates that over-prescribe.**
A template should be a *starting point*, not a *finished requirement*. Leave ≥ 3 wizard prompts for the user to fill — otherwise they learn nothing from using your Style.

**PF5 — Forgetting `peerDependencies`.**
If you publish a Style that bundles its own copy of `@frenchexdev2/requirements`, consumers end up with two runtime copies, and decorator registries (e.g. `@Satisfies`) silently diverge. Use `peerDependencies` + `devDependencies` only.

**PF6 — Codegen for `statusWorkflow` without validation.**
If your Style's `statusWorkflow.transitions` has a state not in `states`, the wizard's `select` will offer invalid options. Run an invariant check at module load: all transition endpoints are states; initial is a state; terminals are states.

**PF7 — Mixing political / process opinions into vocabulary.**
"Is a UserStory really the right primitive here?" is a legitimate question for a LeanStyle author — but don't embed the answer in DefaultStyle. Keep each Style opinionated internally but neutral externally.

**PF8 — Not dog-fooding.**
If your Style author writes tests with `describe`/`it` instead of `@FeatureTest`/`@Verifies`, or if your Style's requirements aren't themselves written in your Style, no one will trust you. Eat your own dog food — it's the difference between a toy and a tool.

---

## 9. Reference

### The full `RequirementStyle` interface

See [`src/style.ts`](../src/style.ts) — authoritative.

### The five built-in presets

| Style           | File                           | Pitch                                  | For                                 |
|-----------------|--------------------------------|----------------------------------------|-------------------------------------|
| DefaultStyle    | [`src/styles/default.ts`](../src/styles/default.ts)       | [`default.md`](pitches/default.md)    | First-time adopters, ISO-neutral    |
| IndustrialStyle | [`src/styles/industrial.ts`](../src/styles/industrial.ts) | [`industrial.md`](pitches/industrial.md) | Factory / PLC / SIS / OT          |
| LeanStyle       | [`src/styles/lean.ts`](../src/styles/lean.ts)             | [`lean.md`](pitches/lean.md)          | Toyota / Kaizen / A3                |
| AgileStyle      | [`src/styles/agile.ts`](../src/styles/agile.ts)           | [`agile.md`](pitches/agile.md)        | Scrum / XP / SAFe / BDD             |
| KanbanStyle     | [`src/styles/kanban.ts`](../src/styles/kanban.ts)         | [`kanban.md`](pitches/kanban.md)      | Flow / classes of service           |

### Glossary

See [`GLOSSARY.md`](../GLOSSARY.md) — every term cited with its source standard (29148 / Volere / SysML / EARS / project-internal).

### Style ecosystem (community)

Publish your Style with the topic `requirements-style` on GitHub / npm so others can discover it. Recommended naming convention: `@<org>/requirements-style-<domain>`.

Known third-party Styles (update as they land):
- *(none yet — be the first!)*

---

*Last updated: 2026-04-14. Contributions via PR on the main repo or a third-party package.*
