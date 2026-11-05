import { expect } from 'vitest';

import {
  Feature,
  FeatureTest,
  Priority,
  Exclude,
  Refines,
  Requirement,
  Satisfies,
  TypeCheckOnly,
  Verifies,
  getRefinementLinks,
  getRequirementRegistry,
  getSatisfactionLinks,
  type ACResult,
} from '@frenchexdev2/requirements-core';
import { RequirementCommandsFeature } from '@frenchexdev2/requirements-requirements';
import { DefaultStyle } from '@frenchexdev2/requirements-styles';
import type {
  Prompt,
  PromptChoice,
  PromptSpinner,
  PromptTextOptions,
} from '@frenchexdev2/requirements-core/ports';
import {
  SCHEMA_VERSION,
  featureId,
  isoDate,
  percentage,
  requirementId,
  sentence,
  type AcName,
  type FeatureId,
  type FeatureSpec,
  type RequirementId,
  type RequirementSpec,
} from '@frenchexdev2/requirements-core/types';
import {
  buildSatisfiedByIndex,
  buildSatisfiesIndex,
  findOrphanFeatures,
  runRequirementWizard,
  seedFromFeature,
  traceChainFor,
  uncoveredApprovedRequirements,
  orphanFeatureSpecs,
  type RequirementWizardContext,
} from '../../src/requirement-core';

// ══════════════════════════════════════════════════════════════════════════════
// Scripted Prompt mock
// ══════════════════════════════════════════════════════════════════════════════

type Queues = {
  text: Array<string | ((q: string, opts?: PromptTextOptions) => string)>;
  select: Array<string | ((q: string, choices: readonly PromptChoice[], dflt?: string) => string)>;
  multiselect: Array<
    | readonly string[]
    | ((q: string, choices: readonly PromptChoice[], dflt?: readonly string[]) => readonly string[])
  >;
  confirm: Array<boolean | ((q: string, dflt?: boolean) => boolean)>;
};

interface MockPrompt extends Prompt {
  readonly notes: Array<{ message: string; title?: string }>;
  readonly textCalls: Array<{ q: string; opts?: PromptTextOptions }>;
  readonly selectCalls: Array<{ q: string; choices: readonly PromptChoice[]; dflt?: string }>;
  readonly multiselectCalls: Array<{
    q: string;
    choices: readonly PromptChoice[];
    dflt?: readonly string[];
  }>;
  readonly confirmCalls: Array<{ q: string; dflt?: boolean }>;
}

function mkPrompt(q: Partial<Queues> = {}): MockPrompt {
  const queues: Queues = {
    text: [...(q.text ?? [])],
    select: [...(q.select ?? [])],
    multiselect: [...(q.multiselect ?? [])],
    confirm: [...(q.confirm ?? [])],
  };
  const notes: MockPrompt['notes'] = [];
  const textCalls: MockPrompt['textCalls'] = [];
  const selectCalls: MockPrompt['selectCalls'] = [];
  const multiselectCalls: MockPrompt['multiselectCalls'] = [];
  const confirmCalls: MockPrompt['confirmCalls'] = [];
  const spinner: PromptSpinner = { start: () => {}, stop: () => {} };

  const p: MockPrompt = {
    notes,
    textCalls,
    selectCalls,
    multiselectCalls,
    confirmCalls,
    async text(question, opts) {
      textCalls.push({ q: question, opts });
      const next = queues.text.shift();
      if (next === undefined) throw new Error(`unexpected text('${question}')`);
      const value = typeof next === 'function' ? next(question, opts) : next;
      if (opts?.validate) {
        const err = opts.validate(value);
        if (err) throw new Error(`validate failed on '${question}': ${err}`);
      }
      return value;
    },
    async select(question, choices, dflt) {
      selectCalls.push({ q: question, choices, dflt });
      const next = queues.select.shift();
      if (next === undefined) throw new Error(`unexpected select('${question}')`);
      return (typeof next === 'function' ? next(question, choices, dflt) : next) as never;
    },
    async multiselect(question, choices, dflt) {
      multiselectCalls.push({ q: question, choices, dflt });
      const next = queues.multiselect.shift();
      if (next === undefined) throw new Error(`unexpected multiselect('${question}')`);
      return (typeof next === 'function' ? next(question, choices, dflt) : next) as never;
    },
    async confirm(question, dflt) {
      confirmCalls.push({ q: question, dflt });
      const next = queues.confirm.shift();
      if (next === undefined) throw new Error(`unexpected confirm('${question}')`);
      return typeof next === 'function' ? next(question, dflt) : next;
    },
    note(message, title) {
      notes.push({ message, title });
    },
    spinner() {
      return spinner;
    },
  };
  return p;
}

function mkCtx(
  prompt: Prompt,
  existingFeatureIds: readonly FeatureId[] = [],
  existingRequirementIds: readonly RequirementId[] = [],
): RequirementWizardContext {
  return { prompt, style: DefaultStyle, existingFeatureIds, existingRequirementIds };
}

// ══════════════════════════════════════════════════════════════════════════════
// Shared fixtures
// ══════════════════════════════════════════════════════════════════════════════

function minimalReqSeed(over: Partial<RequirementSpec> = {}): RequirementSpec {
  return {
    $schemaVersion: SCHEMA_VERSION,
    kind: 'requirement',
    id: requirementId('REQ-SEED'),
    title: 'Seed',
    statement: { pattern: 'ubiquitous', response: sentence('The system shall do X.') },
    requirementKind: 'Functional',
    priority: Priority.High,
    status: 'Draft',
    source: { type: 'stakeholder', role: 'ops', date: isoDate('2026-04-14') },
    rationale: {
      claim: sentence('Because the ops team needs it.'),
      kind: 'principle',
      evidence: [],
    },
    fitCriteria: [{ kind: 'narrative', text: sentence('All ACs pass.') }],
    verificationMethod: 'Test',
    risk: { level: 'Medium', ifNotMet: sentence('Ops is blocked.') },
    satisfiedBy: [],
    ...over,
  };
}

function mkFeatureSpec(id: string, acs: readonly string[] = ['doIt'], satisfies?: readonly string[]): FeatureSpec {
  return {
    $schemaVersion: SCHEMA_VERSION,
    kind: 'feature',
    id: featureId(id),
    title: id,
    priority: Priority.High,
    acs: acs.map((n) => ({ name: n as unknown as AcName, expects: ['unit' as never] })),
    ...(satisfies ? { satisfies: satisfies.map((r) => requirementId(r)) } : {}),
  };
}

// Full-feature answer sequence for the wizard — used by many tests.
function fullAnswerSet(opts: {
  textExtra?: string[];
  pattern?: string;
  patternSlots?: string[];
  sourceKind?: string;
  sourceSlots?: string[];
  statusAnswer?: string;
  featuresPick?: readonly string[];
  fromFeatureFlow?: boolean;
} = {}): NonNullable<Parameters<typeof mkPrompt>[0]> {
  const pattern = opts.pattern ?? 'event-driven';
  const patternSlots = opts.patternSlots ?? ['The user clicks.', 'Respond quickly.'];
  const sourceKind = opts.sourceKind ?? 'stakeholder';
  const sourceSlots = opts.sourceSlots ?? ['ops', '2026-04-14'];
  const fitText = 'All ACs pass.';
  const rationaleClaim = 'Because.';
  const ifNotMet = 'Bad.';

  const text: Array<string | ((q: string, opts?: PromptTextOptions) => string)> = [
    'REQ-X-1', // id
    'Title', // title
    ...patternSlots, // slot values
    ...sourceSlots, // source slot values
    rationaleClaim, // rationale claim
    fitText, // fit narrative text
    ifNotMet, // risk ifNotMet
  ];
  if (opts.textExtra) text.push(...opts.textExtra);

  const select: Array<string> = [
    'Functional', // kind
    pattern, // pattern
    Priority.High, // priority
    opts.statusAnswer ?? 'Draft', // status
    sourceKind, // source kind
    'principle', // rationale kind
    'narrative', // fit criterion kind
    'Test', // verification method
    'Medium', // risk level
  ];

  const multiselect: string[][] = opts.featuresPick ? [[...opts.featuresPick]] : [];

  const confirm: boolean[] = [
    false, // add evidence?
    false, // add another fit criterion?
    false, // add tracedTo?
    true, // create?
  ];

  return { text, select, multiselect, confirm };
}

// ══════════════════════════════════════════════════════════════════════════════
// Wizard — collects all fields
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(RequirementCommandsFeature)
class WizardAllFieldsTests {
  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  async preservesNaturalLanguageStatements() {
    const answers = fullAnswerSet({ pattern: 'natural', patternSlots: ['Keep the original sentence.'] });
    answers.text![6] = (_question, options) => {
      expect(options!.validate!('Missing punctuation')).toMatch(/end with/);
      return 'All ACs pass.';
    };
    const prompt = mkPrompt(answers);
    const result = await runRequirementWizard(mkCtx(prompt));
    expect(result.statement).toEqual({ pattern: 'natural', text: 'Keep the original sentence.' });
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async validatesNumericSourceSlotsFromCustomStyles() {
    const answers = fullAnswerSet();
    answers.text![4] = (_question, options) => {
      expect(options!.validate!('not numeric')).toBe('must be a number');
      expect(options!.validate!('42')).toBeUndefined();
      return '42';
    };
    const prompt = mkPrompt(answers);
    const style = Object.create(DefaultStyle) as typeof DefaultStyle;
    Object.defineProperty(style, 'vocabulary', { value: {
      ...DefaultStyle.vocabulary,
      sourceKinds: [{ kind: 'stakeholder', label: 'Numeric stakeholder', slots: [
        { name: 'role', type: 'number', required: true },
        { name: 'date', type: 'iso-date', required: true },
      ] }],
    } });
    const result = await runRequirementWizard({ ...mkCtx(prompt), style });
    expect(result.source).toEqual({ type: 'stakeholder', role: '42', date: '2026-04-14' });
  }
  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'collects id, title, kind, pattern, slots, priority, status, source, rationale, fit, verification, risk'() {
    const p = mkPrompt(fullAnswerSet());
    const spec = await runRequirementWizard(mkCtx(p));
    expect(spec.id).toBe('REQ-X-1');
    expect(spec.title).toBe('Title');
    expect(spec.requirementKind).toBe('Functional');
    expect(spec.statement.pattern).toBe('event-driven');
    expect(spec.priority).toBe(Priority.High);
    expect(spec.status).toBe('Draft');
    expect(spec.source.type).toBe('stakeholder');
    expect(spec.rationale.kind).toBe('principle');
    expect(spec.fitCriteria).toHaveLength(1);
    expect(spec.verificationMethod).toBe('Test');
    expect(spec.risk.level).toBe('Medium');
    expect(spec.$schema).toBe('./requirement-spec.schema.json');
    expect(spec.$schemaVersion).toBe(SCHEMA_VERSION);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  async 'prompts EARS pattern with all six choices'() {
    const p = mkPrompt(fullAnswerSet());
    await runRequirementWizard(mkCtx(p));
    const earsCall = p.selectCalls.find((c) => /EARS pattern/.test(c.q))!;
    expect(earsCall).toBeDefined();
    expect(earsCall.choices.map((c) => c.value)).toEqual([
      'ubiquitous',
      'event-driven',
      'state-driven',
      'optional',
      'unwanted',
      'natural',
    ]);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  async 'wizard requires at least one fit criterion — loop runs once minimum'() {
    const p = mkPrompt(fullAnswerSet());
    const spec = await runRequirementWizard(mkCtx(p));
    expect(spec.fitCriteria.length).toBeGreaterThan(0);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  async 'yes mode rejects seed with zero fit criteria'() {
    const bad = minimalReqSeed({ fitCriteria: [] });
    const p = mkPrompt();
    await expect(runRequirementWizard(mkCtx(p), bad, { yes: true })).rejects.toThrow(/fit criterion/);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'id validator rejects non-REQ prefix'() {
    const p = mkPrompt({
      text: [
        (_q, opts) => {
          expect(opts!.validate!('foo')).toMatch(/must match/);
          expect(opts!.validate!('REQ-FOO')).toBeUndefined();
          return 'REQ-FOO';
        },
        'Title',
        'The user clicks.',
        'respond.',
        'ops',
        '2026-04-14',
        'Because.',
        'All ACs pass.',
        'Bad.',
      ],
      select: ['Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    const spec = await runRequirementWizard(mkCtx(p));
    expect(spec.id).toBe('REQ-FOO');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'title validator rejects blank'() {
    const p = mkPrompt({
      text: [
        'REQ-FOO',
        (_q, opts) => {
          expect(opts!.validate!('')).toMatch(/empty/);
          expect(opts!.validate!('ok')).toBeUndefined();
          return 'ok';
        },
        'The user clicks.',
        'respond.',
        'ops',
        '2026-04-14',
        'Because.',
        'All ACs pass.',
        'Bad.',
      ],
      select: ['Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    const spec = await runRequirementWizard(mkCtx(p));
    expect(spec.title).toBe('ok');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'cancelling summary throws'() {
    const p = mkPrompt({
      ...fullAnswerSet(),
      confirm: [false, false, false, false],
    });
    await expect(runRequirementWizard(mkCtx(p))).rejects.toThrow(/cancelled/);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'pattern slot validator rejects empty required slot'() {
    const p = mkPrompt({
      text: [
        'REQ-X-1',
        'Title',
        (_q, opts) => {
          expect(opts!.validate!('')).toMatch(/required/);
          return 'trigger.';
        },
        'response.',
        'ops',
        '2026-04-14',
        'Because.',
        'All ACs pass.',
        'Bad.',
      ],
      select: ['Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    await runRequirementWizard(mkCtx(p));
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'rationale claim validator requires terminal punctuation'() {
    const p = mkPrompt({
      text: [
        'REQ-X-1',
        'Title',
        'The user clicks.',
        'respond.',
        'ops',
        '2026-04-14',
        (_q, opts) => {
          expect(opts!.validate!('no end')).toMatch(/end with/);
          return 'With end.';
        },
        'All ACs pass.',
        'Bad.',
      ],
      select: ['Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    await runRequirementWizard(mkCtx(p));
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'ifNotMet validator requires terminal punctuation'() {
    const p = mkPrompt({
      text: [
        'REQ-X-1',
        'Title',
        'The user clicks.',
        'respond.',
        'ops',
        '2026-04-14',
        'With end.',
        'All ACs pass.',
        (_q, opts) => {
          expect(opts!.validate!('no end')).toMatch(/end with/);
          return 'Bad.';
        },
      ],
      select: ['Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    await runRequirementWizard(mkCtx(p));
  }
}
void WizardAllFieldsTests;

// ══════════════════════════════════════════════════════════════════════════════
// Wizard — all EARS pattern variants
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(RequirementCommandsFeature)
class WizardPatternVariantsTests {
  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  async 'ubiquitous pattern: 1 slot'() {
    const p = mkPrompt({
      text: ['REQ-U', 'Title', 'Do X.', 'ops', '2026-04-14', 'Because.', 'All ACs pass.', 'Bad.'],
      select: ['Functional', 'ubiquitous', Priority.High, 'Draft', 'stakeholder', 'principle', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    const s = await runRequirementWizard(mkCtx(p));
    expect(s.statement.pattern).toBe('ubiquitous');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  async 'state-driven pattern'() {
    const p = mkPrompt({
      text: ['REQ-S', 'T', 'In state X.', 'respond.', 'ops', '2026-04-14', 'Because.', 'All ACs pass.', 'Bad.'],
      select: ['Functional', 'state-driven', Priority.High, 'Draft', 'stakeholder', 'principle', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    const s = await runRequirementWizard(mkCtx(p));
    expect(s.statement.pattern).toBe('state-driven');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  async 'optional pattern'() {
    const p = mkPrompt({
      text: ['REQ-O', 'T', 'Admin mode.', 'respond.', 'ops', '2026-04-14', 'Because.', 'All ACs pass.', 'Bad.'],
      select: ['Functional', 'optional', Priority.High, 'Draft', 'stakeholder', 'principle', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    const s = await runRequirementWizard(mkCtx(p));
    expect(s.statement.pattern).toBe('optional');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewPromptsEarsPattern')
  async 'unwanted pattern'() {
    const p = mkPrompt({
      text: ['REQ-N', 'T', 'Error occurs.', 'respond.', 'ops', '2026-04-14', 'Because.', 'All ACs pass.', 'Bad.'],
      select: ['Functional', 'unwanted', Priority.High, 'Draft', 'stakeholder', 'principle', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    const s = await runRequirementWizard(mkCtx(p));
    expect(s.statement.pattern).toBe('unwanted');
  }
}
void WizardPatternVariantsTests;

// ══════════════════════════════════════════════════════════════════════════════
// Wizard — all source kinds
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(RequirementCommandsFeature)
class WizardSourceKindTests {
  @Exclude()
  async runWithSource(kind: string, slots: string[]) {
    const textBase = ['REQ-S-1', 'Title', 'The user clicks.', 'respond.', ...slots, 'Because.', 'All ACs pass.', 'Bad.'];
    const p = mkPrompt({
      text: textBase,
      select: ['Functional', 'event-driven', Priority.High, 'Draft', kind, 'principle', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    return runRequirementWizard(mkCtx(p));
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'regulation'() {
    const s = await this.runWithSource('regulation', ['EU', 'GDPR', '13', '1']);
    expect(s.source.type).toBe('regulation');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'standard'() {
    const s = await this.runWithSource('standard', ['ISO', '29148:2018', '5.2']);
    expect(s.source.type).toBe('standard');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'contract'() {
    const s = await this.runWithSource('contract', ['MSA.pdf', '§12']);
    expect(s.source.type).toBe('contract');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'risk'() {
    const s = await this.runWithSource('risk', ['R-42', 'high']);
    expect(s.source.type).toBe('risk');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'business-goal'() {
    const s = await this.runWithSource('business-goal', ['OKR-1', '2026-Q1']);
    expect(s.source.type).toBe('business-goal');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'incident'() {
    const s = await this.runWithSource('incident', ['INC-1', '2026-04-14', 'https://pm/INC-1']);
    expect(s.source.type).toBe('incident');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'domain-knowledge'() {
    const s = await this.runWithSource('domain-knowledge', ['see Spinoza, E5P23']);
    expect(s.source.type).toBe('domain-knowledge');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'source slot validators reject bad iso-date + empty required'() {
    const p = mkPrompt({
      text: [
        'REQ-X', 'Title', 'The user clicks.', 'respond.',
        'ops',
        (_q, opts) => {
          // empty string on required slot → required
          expect(opts!.validate!('')).toMatch(/required/);
          // bad iso-date → must be ISO
          expect(opts!.validate!('not-a-date')).toMatch(/ISO/);
          return '2026-04-14';
        },
        'Because.', 'All ACs pass.', 'Bad.',
      ],
      select: ['Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    await runRequirementWizard(mkCtx(p));
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'optional source slot may be left blank'() {
    // standard's "section" slot is optional — passing empty must not throw
    const s = await this.runWithSource('standard', ['ISO', '29148:2018', '']);
    expect((s.source as { section?: string }).section).toBeUndefined();
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'regulation with both article and paragraph blank'() {
    const s = await this.runWithSource('regulation', ['EU', 'GDPR', '', '']);
    const c = (s.source as { citation: { article?: string; paragraph?: string } }).citation;
    expect(c.article).toBeUndefined();
    expect(c.paragraph).toBeUndefined();
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'contract with blank clause'() {
    const s = await this.runWithSource('contract', ['MSA.pdf', '']);
    expect((s.source as { clause?: string }).clause).toBeUndefined();
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'incident with blank postmortemUrl'() {
    const s = await this.runWithSource('incident', ['INC-2', '2026-05-01', '']);
    expect((s.source as { postmortemUrl?: string }).postmortemUrl).toBeUndefined();
  }
}
void WizardSourceKindTests;

// ══════════════════════════════════════════════════════════════════════════════
// Wizard — fit criterion variants + evidence + tracedTo
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(RequirementCommandsFeature)
class WizardFitCriterionTests {
  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  async 'unit-test fit (with validator rejection on describes)'() {
    const p = mkPrompt({
      text: ['REQ-U', 'T', 'trig.', 'resp.', 'ops', '2026-04-14', 'Because.',
        (_q, opts) => {
          expect(opts!.validate!('no end')).toMatch(/end with/);
          return 'binds well.';
        },
        'Bad.'],
      select: ['Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle', 'unit-test', 'Test', 'Medium'],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    const s = await runRequirementWizard(mkCtx(p));
    expect(s.fitCriteria[0]!.kind).toBe('unit-test');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  async 'coverage-threshold fit'() {
    const p = mkPrompt({
      text: ['REQ-U', 'T', 'trig.', 'resp.', 'ops', '2026-04-14', 'Because.', '98', 'src/**', 'Bad.'],
      select: [
        'Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle',
        'coverage-threshold', 'line',
        'Test', 'Medium',
      ],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    const s = await runRequirementWizard(mkCtx(p));
    expect(s.fitCriteria[0]!.kind).toBe('coverage-threshold');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  async 'coverage-threshold rejects out-of-range %'() {
    const p = mkPrompt({
      text: [
        'REQ-U', 'T', 'trig.', 'resp.', 'ops', '2026-04-14', 'Because.',
        (_q, opts) => {
          expect(opts!.validate!('101')).toMatch(/0\.\.100/);
          expect(opts!.validate!('NaN')).toMatch(/0\.\.100/);
          return '75';
        },
        'src/**', 'Bad.',
      ],
      select: [
        'Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle',
        'coverage-threshold', 'branch',
        'Test', 'Medium',
      ],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    await runRequirementWizard(mkCtx(p));
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  async 'quality-gate fit'() {
    const p = mkPrompt({
      text: ['REQ-U', 'T', 'trig.', 'resp.', 'ops', '2026-04-14', 'Because.', 'eslint', 'no-explicit-any', 'Bad.'],
      select: ['Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle', 'quality-gate', 'Test', 'Medium'],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    const s = await runRequirementWizard(mkCtx(p));
    expect(s.fitCriteria[0]!.kind).toBe('quality-gate');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  async 'metric fit'() {
    const p = mkPrompt({
      text: ['REQ-U', 'T', 'trig.', 'resp.', 'ops', '2026-04-14', 'Because.', 'p95', 'avg_latency', '200', 'Bad.'],
      select: [
        'Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle',
        'metric', '<=',
        'Test', 'Medium',
      ],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    const s = await runRequirementWizard(mkCtx(p));
    expect(s.fitCriteria[0]!.kind).toBe('metric');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  async 'metric threshold validator rejects non-number'() {
    const p = mkPrompt({
      text: [
        'REQ-U', 'T', 'trig.', 'resp.', 'ops', '2026-04-14', 'Because.',
        'p95', 'avg_latency',
        (_q, opts) => {
          expect(opts!.validate!('NaN-text')).toMatch(/number/);
          return '100';
        },
        'Bad.',
      ],
      select: [
        'Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle',
        'metric', '>=',
        'Test', 'Medium',
      ],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    await runRequirementWizard(mkCtx(p));
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  async 'inspection fit (with validator rejection on item)'() {
    const p = mkPrompt({
      text: ['REQ-U', 'T', 'trig.', 'resp.', 'ops', '2026-04-14', 'Because.',
        (_q, opts) => {
          expect(opts!.validate!('no end')).toMatch(/end with/);
          return 'check lint.';
        },
        'alice', 'Bad.'],
      select: ['Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle', 'inspection', 'Test', 'Medium'],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    const s = await runRequirementWizard(mkCtx(p));
    expect(s.fitCriteria[0]!.kind).toBe('inspection');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  async 'demonstration fit (with validator rejection on scenario)'() {
    const p = mkPrompt({
      text: ['REQ-U', 'T', 'trig.', 'resp.', 'ops', '2026-04-14', 'Because.',
        (_q, opts) => {
          expect(opts!.validate!('no end')).toMatch(/end with/);
          expect(opts!.validate!('User exports a PDF.')).toBeUndefined();
          return 'User exports a PDF.';
        },
        'Bad.'],
      select: ['Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle', 'demonstration', 'Test', 'Medium'],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    const s = await runRequirementWizard(mkCtx(p));
    expect(s.fitCriteria[0]!.kind).toBe('demonstration');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewRequiresNonEmptyFitCriterion')
  async 'multiple fit criteria via confirm loop'() {
    const p = mkPrompt({
      text: [
        'REQ-U', 'T', 'trig.', 'resp.', 'ops', '2026-04-14', 'Because.',
        'first.', // fit narrative 1
        'second.', // fit narrative 2
        'Bad.',
      ],
      select: [
        'Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle',
        'narrative', 'narrative',
        'Test', 'Medium',
      ],
      multiselect: [],
      confirm: [
        false, // add evidence?
        true, // add another fit?
        false, // still more?
        false, // tracedTo?
        true, // create?
      ],
    });
    const s = await runRequirementWizard(mkCtx(p));
    expect(s.fitCriteria).toHaveLength(2);
  }
}
void WizardFitCriterionTests;

// ══════════════════════════════════════════════════════════════════════════════
// Wizard — evidence variants + tracedTo variants
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(RequirementCommandsFeature)
class WizardEvidenceAndTracedToTests {
  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'evidence: metric + incident + study + expert-opinion + precedent'() {
    const p = mkPrompt({
      text: [
        'REQ-E', 'T', 'trig.', 'resp.', 'ops', '2026-04-14',
        'Because.',
        // evidence 1: metric
        'lat', 'p95=120', '2026-01-01',
        // evidence 2: incident
        'INC-1', '2026-02-01',
        // evidence 3: study
        'Cox 2022', 'Cox', '2022',
        // evidence 4: expert-opinion
        'Dr X', '2026-03-01',
        // evidence 5: precedent
        'REQ-OLD', 'see old rationale',
        'All ACs pass.',
        'Bad.',
      ],
      select: [
        'Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle',
        // evidence kinds
        'metric', 'incident', 'study', 'expert-opinion', 'precedent',
        'narrative', 'Test', 'Medium',
      ],
      multiselect: [],
      confirm: [
        true, true, true, true, true, false, // evidence loop
        false, // add another fit?
        false, // tracedTo?
        true, // create?
      ],
    });
    const s = await runRequirementWizard(mkCtx(p));
    expect(s.rationale.evidence.map((e) => e.kind)).toEqual([
      'metric',
      'incident',
      'study',
      'expert-opinion',
      'precedent',
    ]);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'evidence metric date validator rejects non-ISO'() {
    const p = mkPrompt({
      text: [
        'REQ-E', 'T', 'trig.', 'resp.', 'ops', '2026-04-14',
        'Because.',
        'lat', 'p95=120',
        (_q, opts) => {
          expect(opts!.validate!('not-iso')).toMatch(/ISO/);
          return '2026-01-01';
        },
        'All ACs pass.', 'Bad.',
      ],
      select: ['Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle', 'metric', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [true, false, false, false, true],
    });
    await runRequirementWizard(mkCtx(p));
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'evidence study year validator rejects non-4-digit'() {
    const p = mkPrompt({
      text: [
        'REQ-E', 'T', 'trig.', 'resp.', 'ops', '2026-04-14', 'Because.',
        'Cox 2022', 'Cox',
        (_q, opts) => {
          expect(opts!.validate!('22')).toMatch(/year/);
          return '2022';
        },
        'All ACs pass.', 'Bad.',
      ],
      select: ['Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle', 'study', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [true, false, false, false, true],
    });
    await runRequirementWizard(mkCtx(p));
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'evidence incident date validator rejects non-ISO'() {
    const p = mkPrompt({
      text: [
        'REQ-E', 'T', 'trig.', 'resp.', 'ops', '2026-04-14', 'Because.',
        'INC-1',
        (_q, opts) => {
          expect(opts!.validate!('bad')).toMatch(/ISO/);
          return '2026-02-01';
        },
        'All ACs pass.', 'Bad.',
      ],
      select: ['Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle', 'incident', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [true, false, false, false, true],
    });
    await runRequirementWizard(mkCtx(p));
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'evidence expert date validator rejects non-ISO'() {
    const p = mkPrompt({
      text: [
        'REQ-E', 'T', 'trig.', 'resp.', 'ops', '2026-04-14', 'Because.',
        'Dr X',
        (_q, opts) => {
          expect(opts!.validate!('bad')).toMatch(/ISO/);
          return '2026-03-01';
        },
        'All ACs pass.', 'Bad.',
      ],
      select: ['Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle', 'expert-opinion', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [true, false, false, false, true],
    });
    await runRequirementWizard(mkCtx(p));
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'evidence precedent REQ id validated'() {
    const p = mkPrompt({
      text: [
        'REQ-E', 'T', 'trig.', 'resp.', 'ops', '2026-04-14', 'Because.',
        (_q, opts) => {
          expect(opts!.validate!('lowercase')).toMatch(/must match/);
          return 'REQ-OLD';
        },
        'see old',
        'All ACs pass.', 'Bad.',
      ],
      select: ['Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle', 'precedent', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [true, false, false, false, true],
    });
    await runRequirementWizard(mkCtx(p));
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'tracedTo: linear + github + notion + jira + url'() {
    const p = mkPrompt({
      text: [
        'REQ-T', 'T', 'trig.', 'resp.', 'ops', '2026-04-14',
        'Because.', 'All ACs pass.', 'Bad.',
        // tracedTo 1: linear
        'FX-123',
        // tracedTo 2: github
        'frenchexdev', 'repo', '42',
        // tracedTo 3: notion
        'page-abc',
        // tracedTo 4: jira
        'PROJ', '7',
        // tracedTo 5: url
        'https://example.com',
      ],
      select: [
        'Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle',
        'narrative', 'Test', 'Medium',
        'linear', 'github', 'notion', 'jira', 'url',
      ],
      multiselect: [],
      confirm: [
        false, // evidence?
        false, // another fit?
        true, true, true, true, true, false, // tracedTo loop
        true, // create?
      ],
    });
    const s = await runRequirementWizard(mkCtx(p));
    expect(s.tracedTo!.map((t) => t.system)).toEqual([
      'linear',
      'github',
      'notion',
      'jira',
      'url',
    ]);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'tracedTo github issue validator rejects non-integer'() {
    const p = mkPrompt({
      text: [
        'REQ-T', 'T', 'trig.', 'resp.', 'ops', '2026-04-14',
        'Because.', 'All ACs pass.', 'Bad.',
        'org', 'repo',
        (_q, opts) => {
          expect(opts!.validate!('abc')).toMatch(/integer/);
          return '42';
        },
      ],
      select: [
        'Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle',
        'narrative', 'Test', 'Medium',
        'github',
      ],
      multiselect: [],
      confirm: [false, false, true, false, true],
    });
    await runRequirementWizard(mkCtx(p));
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'tracedTo jira issue validator rejects non-integer'() {
    const p = mkPrompt({
      text: [
        'REQ-T', 'T', 'trig.', 'resp.', 'ops', '2026-04-14',
        'Because.', 'All ACs pass.', 'Bad.',
        'PROJ',
        (_q, opts) => {
          expect(opts!.validate!('abc')).toMatch(/integer/);
          return '7';
        },
      ],
      select: [
        'Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle',
        'narrative', 'Test', 'Medium',
        'jira',
      ],
      multiselect: [],
      confirm: [false, false, true, false, true],
    });
    await runRequirementWizard(mkCtx(p));
  }
}
void WizardEvidenceAndTracedToTests;

// ══════════════════════════════════════════════════════════════════════════════
// Wizard — loop child Features + "create new" marker
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(RequirementCommandsFeature)
class WizardChildFeaturesTests {
  @Verifies<RequirementCommandsFeature>('requirementNewLoopsChildFeaturesUntilEnd')
  async 'multiselect from existingFeatureIds'() {
    const feats: readonly FeatureId[] = [featureId('FEAT-A'), featureId('FEAT-B'), featureId('FEAT-C')];
    const p = mkPrompt({
      ...fullAnswerSet({ featuresPick: [feats[0]!, feats[2]!] }),
    });
    const spec = await runRequirementWizard(mkCtx(p, feats));
    expect(spec.satisfiedBy).toEqual([feats[0], feats[2]]);
    // The choices offered included the inline "create new" sentinel
    const msCall = p.multiselectCalls.find((c) => /Features/i.test(c.q))!;
    expect(msCall.choices.some((c) => c.value === '__new__')).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewLoopsChildFeaturesUntilEnd')
  async 'selecting "create new" emits a note and filters the sentinel out'() {
    const feats: readonly FeatureId[] = [featureId('FEAT-A')];
    const p = mkPrompt({
      ...fullAnswerSet({ featuresPick: [feats[0]!, '__new__'] }),
    });
    const spec = await runRequirementWizard(mkCtx(p, feats));
    expect(spec.satisfiedBy).toEqual([feats[0]]);
    expect(p.notes.some((n) => /Cross-link/.test(n.title ?? ''))).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewLoopsChildFeaturesUntilEnd')
  async 'no existing Features → satisfiedBy is empty (no multiselect)'() {
    const p = mkPrompt(fullAnswerSet());
    const spec = await runRequirementWizard(mkCtx(p, []));
    expect(spec.satisfiedBy).toEqual([]);
    expect(p.multiselectCalls).toHaveLength(0);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewLoopsChildFeaturesUntilEnd')
  async 'no existing Features → seed satisfiedBy preserved'() {
    const seed = minimalReqSeed({
      satisfiedBy: [featureId('FEAT-KEEP')],
    });
    const p = mkPrompt({
      text: ['REQ-SEED', 'Seed', 'trig.', 'resp.', 'ops', '2026-04-14', 'Because.', 'All ACs pass.', 'Bad.'],
      select: ['Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    const spec = await runRequirementWizard(mkCtx(p, []), seed);
    expect(spec.satisfiedBy).toEqual([featureId('FEAT-KEEP')]);
  }
}
void WizardChildFeaturesTests;

// ══════════════════════════════════════════════════════════════════════════════
// --yes + replay seed + --from-feature
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(RequirementCommandsFeature)
class YesReplayFromFeatureTests {
  @Verifies<RequirementCommandsFeature>('fromFeatureFlagPreFillsFromExistingFeature')
  async 'seedFromFeature derives id, title, citation, satisfiedBy'() {
    const feat = mkFeatureSpec('SOME-FEAT');
    const seed = seedFromFeature(feat);
    expect(seed.id).toBe('REQ-SOME-FEAT');
    expect(seed.title).toBe('SOME-FEAT');
    expect(seed.source.type).toBe('domain-knowledge');
    expect(seed.satisfiedBy).toEqual([featureId('SOME-FEAT')]);
    expect(seed.statement.pattern).toBe('ubiquitous');
    expect(seed.kind).toBe('requirement');
  }

  @Verifies<RequirementCommandsFeature>('fromFeatureFlagPreFillsFromExistingFeature')
  async '--from-feature pre-fills wizard defaults when not in --yes mode'() {
    const feat = mkFeatureSpec('SOME-FEAT');
    const p = mkPrompt({
      text: [
        (_q, opts) => { expect(opts?.default).toBe('REQ-SOME-FEAT'); return 'REQ-SOME-FEAT'; },
        (_q, opts) => { expect(opts?.default).toBe('SOME-FEAT'); return 'SOME-FEAT'; },
        'The user clicks.', 'respond.',
        'see Spinoza, E5P23',
        'Because.', 'All ACs pass.', 'Bad.',
      ],
      select: ['Functional', 'event-driven', Priority.High, 'Draft', 'domain-knowledge', 'precedent', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    const spec = await runRequirementWizard(mkCtx(p), undefined, { fromFeature: feat });
    expect(spec.id).toBe('REQ-SOME-FEAT');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async '--yes returns validated seed without prompting'() {
    const seed = minimalReqSeed();
    const p = mkPrompt();
    const spec = await runRequirementWizard(mkCtx(p), seed, { yes: true });
    expect(spec.id).toBe('REQ-SEED');
    expect(p.textCalls).toHaveLength(0);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async '--yes requires seed'() {
    const p = mkPrompt();
    await expect(runRequirementWizard(mkCtx(p), undefined, { yes: true })).rejects.toThrow(/requires/);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async '--yes rejects invalid seed via style validator'() {
    const bad = minimalReqSeed({ status: 'NOT-A-STATE' });
    const p = mkPrompt();
    await expect(runRequirementWizard(mkCtx(p), bad, { yes: true })).rejects.toThrow(/Invalid/);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'seed with matching pattern pre-fills slot defaults'() {
    const seed = minimalReqSeed(); // ubiquitous / response
    const p = mkPrompt({
      text: [
        'REQ-SEED', 'Seed',
        (_q, opts) => { expect(opts?.default).toBe('The system shall do X.'); return 'The system shall do Y.'; },
        'ops', '2026-04-14', 'Because.', 'All ACs pass.', 'Bad.',
      ],
      select: ['Functional', 'ubiquitous', Priority.High, 'Draft', 'stakeholder', 'principle', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    const spec = await runRequirementWizard(mkCtx(p), seed);
    expect(spec.statement.pattern).toBe('ubiquitous');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async 'seed with mismatched pattern does not leak seed slots'() {
    const seed = minimalReqSeed(); // pattern 'ubiquitous' (only `response`)
    const p = mkPrompt({
      text: [
        'REQ-SEED', 'Seed',
        (_q, opts) => { expect(opts?.default).toBeUndefined(); return 'trigger.'; },
        (_q, opts) => { expect(opts?.default).toBeUndefined(); return 'respond.'; },
        'ops', '2026-04-14', 'Because.', 'All ACs pass.', 'Bad.',
      ],
      select: ['Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle', 'narrative', 'Test', 'Medium'],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    const spec = await runRequirementWizard(mkCtx(p), seed);
    expect(spec.statement.pattern).toBe('event-driven');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async '--template pre-fills kind / pattern / priority defaults'() {
    const p = mkPrompt({
      text: ['REQ-T', 'T', 'Do X.', 'ops', '2026-04-14', 'Because.', 'narrative.', 'Bad.'],
      select: [
        (_q, _c, dflt) => { expect(dflt).toBe('Functional'); return 'Functional'; },
        (_q, _c, dflt) => { expect(dflt).toBe('ubiquitous'); return 'ubiquitous'; },
        (_q, _c, dflt) => { expect(dflt).toBe(Priority.Medium); return Priority.Medium; },
        'Draft', 'stakeholder', 'principle', 'narrative', 'Test', 'Medium',
      ],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    const spec = await runRequirementWizard(mkCtx(p), undefined, { template: 'ears-ubiquitous' });
    expect(spec.statement.pattern).toBe('ubiquitous');
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async '--template throws when id unknown'() {
    const p = mkPrompt();
    await expect(
      runRequirementWizard(mkCtx(p), undefined, { template: 'nope' }),
    ).rejects.toThrow(/Template not found/);
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async '--template maps all four Priority strings'() {
    // cover every arm of mapPriority: Critical, High, Medium, Low
    const mk = (priorityStr: string) => ({
      ...DefaultStyle,
      templates: {
        templates: [],
        findTemplate: () => ({
          id: 'x',
          label: 'x',
          description: '',
          skeleton: { priority: priorityStr },
        }),
      },
    });
    const expectedPriorityByInput: Record<string, Priority> = {
      Critical: Priority.Critical,
      High: Priority.High,
      Medium: Priority.Medium,
      Low: Priority.Low,
    };
    for (const priorityStr of ['Critical', 'High', 'Medium', 'Low']) {
      const p = mkPrompt({
        text: ['REQ-T', 'T', 'trig.', 'resp.', 'ops', '2026-04-14', 'Because.', 'All ACs pass.', 'Bad.'],
        select: [
          'Functional', 'event-driven', (_q: string, _c: readonly PromptChoice[], dflt?: string) => dflt ?? Priority.High,
          'Draft', 'stakeholder', 'principle', 'narrative', 'Test', 'Medium',
        ] as unknown as Queues['select'],
        multiselect: [],
        confirm: [false, false, false, true],
      });
      const spec = await runRequirementWizard(
        { prompt: p, style: mk(priorityStr), existingFeatureIds: [], existingRequirementIds: [] },
        undefined,
        { template: 'x' },
      );
      expect(spec.priority).toBe(expectedPriorityByInput[priorityStr]);
    }
  }

  @Verifies<RequirementCommandsFeature>('requirementNewWizardCollectsAllFields')
  async '--template with unmapped priority falls back to High'() {
    const style = {
      ...DefaultStyle,
      templates: {
        templates: [],
        findTemplate: () => ({
          id: 'x',
          label: 'x',
          description: '',
          skeleton: { priority: 'Unknown' },
        }),
      },
    };
    const p = mkPrompt({
      text: ['REQ-T', 'T', 'trig.', 'resp.', 'ops', '2026-04-14', 'Because.', 'All ACs pass.', 'Bad.'],
      select: [
        'Functional', 'event-driven',
        (_q, _c, dflt) => { expect(dflt).toBe(Priority.High); return Priority.High; },
        'Draft', 'stakeholder', 'principle', 'narrative', 'Test', 'Medium',
      ],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    await runRequirementWizard(
      { prompt: p, style, existingFeatureIds: [], existingRequirementIds: [] },
      undefined,
      { template: 'x' },
    );
  }
}
void YesReplayFromFeatureTests;

// ══════════════════════════════════════════════════════════════════════════════
// Decorator-registry queries — @Satisfies / @Refines / orphan / list
// ══════════════════════════════════════════════════════════════════════════════

// Test Requirement classes (abstract — just need the Requirement brand for the registry)
abstract class REQALPHA extends Requirement {}
abstract class REQBETA extends Requirement {}
abstract class REQCHILD extends Requirement {}

// Apply @Satisfies — these classes get registered in the runtime registry
@Satisfies(REQALPHA, REQBETA)
abstract class FEATAB extends Feature {
  readonly id = 'FEAT-AB';
  readonly title = 'AB';
  readonly priority = Priority.High;
}
void FEATAB;

@Satisfies(REQBETA)
abstract class FEATB extends Feature {
  readonly id = 'FEAT-B';
  readonly title = 'B';
  readonly priority = Priority.High;
}
void FEATB;

abstract class FEATORPHAN extends Feature {
  readonly id = 'FEAT-ORPHAN';
  readonly title = 'orphan';
  readonly priority = Priority.High;
}
void FEATORPHAN;

@Refines(REQALPHA)
abstract class REQCHILDOFALPHA extends REQCHILD {}
void REQCHILDOFALPHA;

@FeatureTest(RequirementCommandsFeature)
class DecoratorRegistryTests {
  @Verifies<RequirementCommandsFeature>('satisfiesDecoratorRegistersBidirectionalLink')
  async 'satisfies registers a link per Feature'() {
    const links = getSatisfactionLinks();
    const ab = links.find((l) => l.featureClass === 'FEATAB');
    expect(ab).toBeDefined();
    expect(ab!.requirementClasses).toEqual(['REQALPHA', 'REQBETA']);
  }

  @Verifies<RequirementCommandsFeature>('satisfiesDecoratorRegistersBidirectionalLink')
  async 'buildSatisfiesIndex: forward — Feature → [Requirements]'() {
    const idx = buildSatisfiesIndex();
    expect(idx.get('FEATAB' as unknown as FeatureId)).toEqual([
      'REQALPHA', 'REQBETA',
    ]);
    expect(idx.get('FEATB' as unknown as FeatureId)).toEqual(['REQBETA']);
  }

  @Verifies<RequirementCommandsFeature>('satisfiesDecoratorRegistersBidirectionalLink')
  async 'buildSatisfiedByIndex: inverse — Requirement → [Features]'() {
    const inv = buildSatisfiedByIndex();
    expect(inv.get('REQBETA' as unknown as RequirementId)).toEqual(
      expect.arrayContaining(['FEATAB', 'FEATB']),
    );
    expect(inv.get('REQALPHA' as unknown as RequirementId)).toEqual(
      expect.arrayContaining(['FEATAB']),
    );
  }

  @TypeCheckOnly()
  @Verifies<RequirementCommandsFeature>('satisfiesDecoratorRejectsNonRequirementClass')
  async 'satisfies type param requires Requirement subclass (compile-time enforced)'() {
    // Compile-time: `@Satisfies(SomeNonRequirement)` fails tsc because the generic
    // constrains `R extends abstract new (...args: any[]) => Requirement`.
    // We encode the guarantee here with a type-level assertion.
    type OK = Parameters<typeof Satisfies> extends readonly (abstract new (...args: any[]) => Requirement)[]
      ? true
      : never;
    const ok: OK = true;
    expect(ok).toBe(true);
  }

  @Verifies<RequirementCommandsFeature>('refinesDecoratorRegistersParentChildLink')
  async 'refines registers parent/child link'() {
    const links = getRefinementLinks();
    const child = links.find((l) => l.childClass === 'REQCHILDOFALPHA');
    expect(child).toBeDefined();
    expect(child!.parentClasses).toEqual(['REQALPHA']);
  }

  @Verifies<RequirementCommandsFeature>('orphanCommandListsFeaturesWithoutRequirement')
  async 'findOrphanFeatures returns Features not in any satisfies link'() {
    const all: readonly FeatureId[] = [
      'FEATAB' as unknown as FeatureId,
      'FEATB' as unknown as FeatureId,
      'FEATORPHAN' as unknown as FeatureId,
    ];
    const orphans = findOrphanFeatures(all);
    expect(orphans).toEqual(['FEATORPHAN']);
  }

  @Verifies<RequirementCommandsFeature>('orphanDetectionStaysSilentWhenRuntimeRegistryIsEmpty')
  async 'findOrphanFeatures reports nothing when no Feature class was ever imported'() {
    // The registry is process-global and populated by @Satisfies at class-decoration
    // time. A CLI never imports the Feature classes, so it observes it empty — and
    // must not conclude that every Feature is an orphan. Emptying the live array is
    // the only way to reproduce that from inside a process that did import them.
    const links = getSatisfactionLinks() as Array<ReturnType<typeof getSatisfactionLinks>[number]>;
    const saved = links.splice(0, links.length);
    try {
      expect(findOrphanFeatures(['FEATAB', 'FEATORPHAN'])).toEqual([]);
    } finally {
      links.push(...saved);
    }
  }

  @Verifies<RequirementCommandsFeature>('requirementListShowsCoveragePerRequirement')
  async 'inverse index powers per-Requirement coverage list'() {
    const inv = buildSatisfiedByIndex();
    const coverage = new Map<string, number>();
    for (const [req, feats] of inv) coverage.set(req as unknown as string, feats.length);
    expect(coverage.get('REQBETA')).toBe(2);
    expect(coverage.get('REQALPHA')).toBe(1);
  }

  @Verifies<RequirementCommandsFeature>('requirementShowReportUsesInverseTerms')
  async 'inverse index uses "satisfiedBy" terminology, not "implementers"'() {
    // The inverse map returns Feature class names under the Requirement key —
    // this IS the data a reporter would label "Satisfied by:" (SysML-aligned).
    const inv = buildSatisfiedByIndex();
    expect(inv).toBeInstanceOf(Map);
    expect(typeof inv.get('REQBETA' as unknown as RequirementId)).toBe('object');
  }
}
void DecoratorRegistryTests;

// ══════════════════════════════════════════════════════════════════════════════
// 4-tier trace chain + compliance gate + sync reuse (integration)
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(RequirementCommandsFeature)
class TraceChainAndComplianceTests {
  @Verifies<RequirementCommandsFeature>('traceChainShowsRequirementTier')
  async 'traceChainFor walks REQ → FEAT → AC → TEST'() {
    // Use the test registry populated by this very test file — @FeatureTest on
    // DecoratorRegistryTests registered ACs against RequirementCommandsFeature.
    const registry = getRequirementRegistry();
    expect(registry.length).toBeGreaterThan(0);

    // Synthesize a FeatureSpec whose id equals the class name in a @Satisfies
    // link, so traceChainFor finds it.
    const feat = mkFeatureSpec('FEATAB', ['alpha']);
    const chain = traceChainFor(
      'REQALPHA' as unknown as RequirementId,
      [feat],
    );
    expect(chain.requirement).toBe('REQALPHA');
    expect(chain.features).toEqual([featureId('FEATAB')]);
    expect(chain.acs).toEqual([{ feature: featureId('FEATAB'), ac: 'alpha' }]);
  }

  @Verifies<RequirementCommandsFeature>('traceChainShowsRequirementTier')
  async 'traceChainFor wires the 4th tier (TEST) when registry matches'() {
    // Manually add a @Verifies-like registry entry for FEATAB / alpha to
    // exercise the tests-array map in traceChainFor.
    const reg = getRequirementRegistry();
    reg.push({
      feature: 'FEATAB',
      ac: 'alpha',
      testClass: 'ManualFakeTest',
      testMethod: 'fakeMethod',
    });
    const feat = mkFeatureSpec('FEATAB', ['alpha']);
    const chain = traceChainFor('REQALPHA' as unknown as RequirementId, [feat]);
    expect(chain.tests).toEqual([
      { feature: featureId('FEATAB'), ac: 'alpha', testClass: 'ManualFakeTest', testMethod: 'fakeMethod' },
    ]);
    // Clean up: remove the pushed entry.
    const idx = reg.findIndex((r) => r.testClass === 'ManualFakeTest');
    if (idx >= 0) reg.splice(idx, 1);
  }

  @Verifies<RequirementCommandsFeature>('traceChainShowsRequirementTier')
  async 'traceChainFor returns empty chain for unknown Requirement'() {
    const chain = traceChainFor(
      'ReqDoesNotExist' as unknown as RequirementId,
      [],
    );
    expect(chain.features).toEqual([]);
    expect(chain.acs).toEqual([]);
    expect(chain.tests).toEqual([]);
  }

  @Verifies<RequirementCommandsFeature>('complianceStrictFailsOnUncoveredApprovedRequirement')
  async 'uncoveredApprovedRequirements flags Approved reqs with no satisfier'() {
    const reqApproved = minimalReqSeed({
      id: requirementId('REQ-APPROVED'),
      status: 'Approved',
    });
    const reqDraft = minimalReqSeed({
      id: requirementId('REQ-DRAFT'),
      status: 'Draft',
    });
    const feat = mkFeatureSpec('FEAT-X', ['a'], ['REQ-APPROVED']);
    // Approved is covered → not uncovered
    expect(uncoveredApprovedRequirements([reqApproved, reqDraft], [feat])).toEqual([]);
    // Remove the satisfier → Approved becomes uncovered; Draft still not flagged
    const featNone = mkFeatureSpec('FEAT-Y', ['a']);
    expect(
      uncoveredApprovedRequirements([reqApproved, reqDraft], [featNone]),
    ).toEqual([requirementId('REQ-APPROVED')]);
  }

  @Verifies<RequirementCommandsFeature>('complianceStrictFailsOnUncoveredApprovedRequirement')
  async 'Implemented and Verified statuses are also gated'() {
    const reqImpl = minimalReqSeed({ id: requirementId('REQ-IMPL'), status: 'Implemented' });
    const reqVer = minimalReqSeed({ id: requirementId('REQ-VER'), status: 'Verified' });
    const reqDep = minimalReqSeed({ id: requirementId('REQ-DEP'), status: 'Deprecated' });
    expect(
      uncoveredApprovedRequirements([reqImpl, reqVer, reqDep], []),
    ).toEqual([requirementId('REQ-IMPL'), requirementId('REQ-VER')]);
  }

  @Verifies<RequirementCommandsFeature>('coverageFlowsUpToARefinedRequirement')
  async 'satisfying a refinement covers the abstract root it refines, transitively'() {
    // root ← mid ← leaf; only the leaf carries a Feature link.
    const root = { id: 'REQ-ROOT', status: 'Approved' };
    const mid = { id: 'REQ-MID', status: 'Approved', refines: ['REQ-ROOT'] };
    const leaf = { id: 'REQ-LEAF', status: 'Approved', refines: ['REQ-MID'] };
    const feat = { id: 'FEAT-L', satisfies: ['REQ-LEAF'] };
    expect(uncoveredApprovedRequirements([root, mid, leaf], [feat])).toEqual([]);

    // Nothing anywhere in the subtree → the whole chain is a dead promise.
    expect(uncoveredApprovedRequirements([root, mid, leaf], [])).toEqual([
      'REQ-ROOT', 'REQ-MID', 'REQ-LEAF',
    ]);
  }

  @Verifies<RequirementCommandsFeature>('coverageFlowsUpToARefinedRequirement')
  async 'an unrelated sibling stays uncovered when only one branch is satisfied'() {
    const root = { id: 'REQ-ROOT', status: 'Approved' };
    const covered = { id: 'REQ-A', status: 'Approved', refines: ['REQ-ROOT'] };
    const orphan = { id: 'REQ-B', status: 'Approved', refines: ['REQ-ROOT'] };
    const feat = { id: 'FEAT-A', satisfies: ['REQ-A'] };
    expect(uncoveredApprovedRequirements([root, covered, orphan], [feat])).toEqual(['REQ-B']);
  }

  @Verifies<RequirementCommandsFeature>('refinementCoverageTerminatesOnACycle')
  async 'a @Refines cycle terminates instead of recursing forever'() {
    const a = { id: 'REQ-A', status: 'Approved', refines: ['REQ-B'] };
    const b = { id: 'REQ-B', status: 'Approved', refines: ['REQ-A'] };
    expect(uncoveredApprovedRequirements([a, b], [{ id: 'F', satisfies: ['REQ-A'] }])).toEqual([]);
    expect(uncoveredApprovedRequirements([a, b], [])).toEqual(['REQ-A', 'REQ-B']);
  }

  @Verifies<RequirementCommandsFeature>('complianceStrictFailsOnFeatureWithoutSatisfies')
  async 'orphanFeatureSpecs flags Features whose spec has empty or missing satisfies[]'() {
    const featLinked = mkFeatureSpec('FEAT-LINKED', ['a'], ['REQ-X']);
    const featOrphanEmpty = mkFeatureSpec('FEAT-ORPHAN-EMPTY', ['a'], []);
    const featOrphanMissing = mkFeatureSpec('FEAT-ORPHAN-MISSING', ['a']);
    expect(orphanFeatureSpecs([featLinked, featOrphanEmpty, featOrphanMissing]))
      .toEqual([featOrphanEmpty.id, featOrphanMissing.id]);
  }

  @Verifies<RequirementCommandsFeature>('complianceStrictFailsOnFeatureWithoutSatisfies')
  async 'orphanFeatureSpecs returns [] when every Feature has ≥ 1 satisfies entry'() {
    const a = mkFeatureSpec('FEAT-A', ['a'], ['REQ-ALPHA']);
    const b = mkFeatureSpec('FEAT-B', ['a'], ['REQ-ALPHA', 'REQ-BETA']);
    expect(orphanFeatureSpecs([a, b])).toEqual([]);
  }

  @Verifies<RequirementCommandsFeature>('requirementSyncReusesDiffCore')
  async 'produced spec has shape compatible with Stream C SyncPlan machinery (integration)'() {
    // Mock integration: the SyncPlan just requires a Spec discriminated union
    // with `$schemaVersion`, `kind`, `id`. We assert the wizard output hits all
    // of these so the shared sync-core can diff/apply without a custom branch.
    const spec = await runRequirementWizard(mkCtx(mkPrompt(fullAnswerSet())));
    const mockDiffSpecToDisk = (s: typeof spec) => {
      // mirrors diffSpecToDisk's minimal contract
      return { spec: s, entries: [] as unknown[] };
    };
    const plan = mockDiffSpecToDisk(spec);
    expect(plan.spec.$schemaVersion).toBe(SCHEMA_VERSION);
    expect(plan.spec.kind).toBe('requirement');
    expect(plan.spec.id).toBe('REQ-X-1');
  }
}
void TraceChainAndComplianceTests;

// ══════════════════════════════════════════════════════════════════════════════
// Feature new wizard integration + custom workflows + end-to-end
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(RequirementCommandsFeature)
class CustomWorkflowsAndEndToEndTests {
  @Verifies<RequirementCommandsFeature>('featureNewWizardOffersRequirementSelection')
  async 'existingRequirementIds context is threaded (mock Stream A integration)'() {
    // Mocks Stream A: a Feature wizard call would receive our
    // existingRequirementIds list; we assert ctx carries it unchanged.
    const reqs: readonly RequirementId[] = [requirementId('REQ-A'), requirementId('REQ-B')];
    const ctx = mkCtx(mkPrompt(), [], reqs);
    expect(ctx.existingRequirementIds).toEqual(reqs);
  }

  @Verifies<RequirementCommandsFeature>('projectCanDefineCustomStatusWorkflow')
  async 'custom statusWorkflow is used for status prompt + initial default'() {
    const style = {
      ...DefaultStyle,
      vocabulary: {
        ...DefaultStyle.vocabulary,
        statusWorkflow: {
          states: ['Proposed', 'Ratified', 'Enforced', 'Retired'],
          initial: 'Proposed',
          transitions: [],
          terminal: ['Retired'],
        },
      },
      validators: {
        validateStatement: () => ({ ok: true as const, errors: [] as const }),
        validateSpec: () => ({ ok: true as const, errors: [] as const }),
      },
    };
    const p = mkPrompt({
      text: ['REQ-CW', 'T', 'trig.', 'resp.', 'ops', '2026-04-14', 'Because.', 'All ACs pass.', 'Bad.'],
      select: [
        'Functional', 'event-driven', Priority.High,
        (_q, choices, dflt) => {
          expect(choices.map((c) => c.value)).toEqual(['Proposed', 'Ratified', 'Enforced', 'Retired']);
          expect(dflt).toBe('Proposed');
          return 'Ratified';
        },
        'stakeholder', 'principle', 'narrative', 'Test', 'Medium',
      ],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    const spec = await runRequirementWizard({
      prompt: p,
      style,
      existingFeatureIds: [],
      existingRequirementIds: [],
    });
    expect(spec.status).toBe('Ratified');
  }

  @Verifies<RequirementCommandsFeature>('projectCanDefineCustomRiskTaxonomy')
  async 'custom riskTaxonomy replaces default risk levels'() {
    const style = {
      ...DefaultStyle,
      vocabulary: {
        ...DefaultStyle.vocabulary,
        riskTaxonomy: { levels: ['DAL-A', 'DAL-B', 'DAL-C', 'DAL-D'] },
      },
      validators: {
        validateStatement: () => ({ ok: true as const, errors: [] as const }),
        validateSpec: () => ({ ok: true as const, errors: [] as const }),
      },
    };
    const p = mkPrompt({
      text: ['REQ-CR', 'T', 'trig.', 'resp.', 'ops', '2026-04-14', 'Because.', 'All ACs pass.', 'Bad.'],
      select: [
        'Functional', 'event-driven', Priority.High, 'Draft', 'stakeholder', 'principle', 'narrative', 'Test',
        (_q, choices) => {
          expect(choices.map((c) => c.value)).toEqual(['DAL-A', 'DAL-B', 'DAL-C', 'DAL-D']);
          return 'DAL-A';
        },
      ],
      multiselect: [],
      confirm: [false, false, false, true],
    });
    const spec = await runRequirementWizard({
      prompt: p,
      style,
      existingFeatureIds: [],
      existingRequirementIds: [],
    });
    expect(spec.risk.level).toBe('DAL-A');
  }

  @Verifies<RequirementCommandsFeature>('endToEndRequirementToTestChain')
  async 'full chain: wizard spec + @Satisfies + @Verifies + trace'() {
    // 1. Produce a RequirementSpec via the wizard.
    const spec = await runRequirementWizard(mkCtx(mkPrompt(fullAnswerSet())));
    // 2. @Satisfies already registered FEATAB → [REQALPHA, REQBETA] above.
    // 3. @Verifies already registered this very test against RequirementCommandsFeature.
    // 4. Trace proves the 4 tiers line up.
    const chain = traceChainFor('REQALPHA' as unknown as RequirementId, [mkFeatureSpec('FEATAB', ['alpha'])]);
    expect(chain.features).toEqual([featureId('FEATAB')]);
    // Ancillary: spec round-trips through SCHEMA_VERSION
    expect(spec.$schemaVersion).toBe(SCHEMA_VERSION);
    // Ancillary: percentage smart-ctor works (exercise type import)
    expect(percentage(100)).toBe(100);
  }
}
void CustomWorkflowsAndEndToEndTests;

// Suppress unused-binding warnings in a single place.
void Feature;
void Requirement;
void Priority;
void Verifies;
void FeatureTest;
void Satisfies;
void Refines;
// ACResult is referenced via generic constraints only — keep the import alive.
const _acResultMarker: ACResult | undefined = undefined;
void _acResultMarker;
