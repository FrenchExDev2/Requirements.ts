import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { FeatureNewCommandFeature } from '@frenchexdev2/requirements-requirements';
import { Priority, TestLevel } from '@frenchexdev2/requirements-core';
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
  requirementId,
  type FeatureSpec,
  type RequirementId,
} from '@frenchexdev2/requirements-core/types';
import {
  runFeatureWizard,
  type FeatureWizardContext,
} from '../../src/feature-new-core';

// ── Scripted mock Prompt ────────────────────────────────────────────────────

type Queues = {
  text: Array<string | ((q: string, opts?: PromptTextOptions) => string)>;
  select: Array<string | ((q: string, choices: readonly PromptChoice[], dflt?: string) => string)>;
  multiselect: Array<
    readonly string[] | ((q: string, choices: readonly PromptChoice[], dflt?: readonly string[]) => readonly string[])
  >;
  confirm: Array<boolean | ((q: string, dflt?: boolean) => boolean)>;
};

interface MockPrompt extends Prompt {
  readonly notes: Array<{ message: string; title?: string }>;
  readonly textCalls: Array<{ q: string; opts?: PromptTextOptions }>;
  readonly selectCalls: Array<{ q: string; choices: readonly PromptChoice[]; dflt?: string }>;
  readonly multiselectCalls: Array<{ q: string; choices: readonly PromptChoice[]; dflt?: readonly string[] }>;
}

function mkPrompt(q: Partial<Queues> = {}): MockPrompt {
  const queues: Queues = {
    text: [...(q.text ?? [])],
    select: [...(q.select ?? [])],
    multiselect: [...(q.multiselect ?? [])],
    confirm: [...(q.confirm ?? [])],
  };
  const notes: Array<{ message: string; title?: string }> = [];
  const textCalls: MockPrompt['textCalls'] = [];
  const selectCalls: MockPrompt['selectCalls'] = [];
  const multiselectCalls: MockPrompt['multiselectCalls'] = [];

  const spinner: PromptSpinner = { start: () => {}, stop: () => {} };

  const p: MockPrompt = {
    notes,
    textCalls,
    selectCalls,
    multiselectCalls,
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
      const next = queues.confirm.shift();
      if (next === undefined) throw new Error(`unexpected confirm('${question}')`);
      return typeof next === 'function' ? next(question, dflt) : next;
    },
    note(message, title) { notes.push({ message, title }); },
    spinner() { return spinner; },
  };
  return p;
}

function mkCtx(prompt: Prompt, existingRequirementIds: readonly RequirementId[] = []): FeatureWizardContext {
  return {
    prompt,
    style: DefaultStyle,
    existingFeatureIds: [],
    existingRequirementIds,
  };
}

// ── Shared fixtures ─────────────────────────────────────────────────────────

function seedSpec(): FeatureSpec {
  return {
    $schemaVersion: SCHEMA_VERSION,
    kind: 'feature',
    id: featureId('SEED-FEATURE'),
    title: 'Seeded',
    priority: Priority.High,
    acs: [
      { name: 'first' as never, expects: [TestLevel.Unit] },
      { name: 'second' as never, expects: [TestLevel.Unit, TestLevel.EndToEnd] },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Wizard flow tests
// ═══════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureNewCommandFeature)
class WizardFlowTests {
  @Verifies<FeatureNewCommandFeature>('wizardCollectsIdTitlePriority')
  async 'collects id, title, priority in order'() {
    const prompt = mkPrompt({
      text:        ['MY-FEATURE', 'My title'],
      select:      [Priority.Medium],
      multiselect: [[TestLevel.Unit]],
      confirm:     [/*add AC?*/ true, /*add another?*/ false, /*create?*/ true],
    });
    // inject AC name prompt in between
    prompt.textCalls; // touch
    // Rewrite: need text for id, title, then ac name. Put ac name in text queue:
    const p2 = mkPrompt({
      text:        ['MY-FEATURE', 'My title', 'doesStuff'],
      select:      [Priority.Medium],
      multiselect: [[TestLevel.Unit]],
      confirm:     [true, false, true],
    });
    const spec = await runFeatureWizard(mkCtx(p2));
    expect(spec.id).toBe('MY-FEATURE');
    expect(spec.title).toBe('My title');
    expect(spec.priority).toBe(Priority.Medium);
    expect(spec.acs).toHaveLength(1);
    expect(spec.acs[0]!.name).toBe('doesStuff');
    expect(spec.$schemaVersion).toBe(SCHEMA_VERSION);
    expect(spec.$schema).toBe('./feature-spec.schema.json');
    expect(spec.kind).toBe('feature');
  }

  @Verifies<FeatureNewCommandFeature>('wizardLoopsAcsUntilEnd')
  async 'loops ACs until user answers no'() {
    const p = mkPrompt({
      text:        ['LOOP', 'Loop', 'acOne', 'acTwo', 'acThree'],
      select:      [Priority.Low],
      multiselect: [[TestLevel.Unit], [TestLevel.Unit], [TestLevel.Unit]],
      confirm:     [/*add?*/ true, /*add?*/ true, /*add?*/ true, /*add?*/ false, /*create?*/ true],
    });
    const spec = await runFeatureWizard(mkCtx(p));
    expect(spec.acs.map(a => a.name)).toEqual(['acOne', 'acTwo', 'acThree']);
  }

  @Verifies<FeatureNewCommandFeature>('wizardValidatesIdFormat')
  async 'rejects lowercase / bad id via validate'() {
    const p = mkPrompt({
      text: [
        (_q, opts) => {
          // First call → validator must reject 'bad id'
          expect(opts?.validate).toBeDefined();
          expect(opts!.validate!('bad id')).toMatch(/must match/);
          expect(opts!.validate!('lowercase')).toMatch(/must match/);
          expect(opts!.validate!('GOOD-ID')).toBeUndefined();
          return 'GOOD-ID';
        },
        'title',
        'acX',
      ],
      select:      [Priority.High],
      multiselect: [[TestLevel.Unit]],
      confirm:     [true, false, true],
    });
    const spec = await runFeatureWizard(mkCtx(p));
    expect(spec.id).toBe('GOOD-ID');
  }

  @Verifies<FeatureNewCommandFeature>('wizardValidatesAcNameFormat')
  async 'rejects non-camelCase AC name via validate'() {
    const p = mkPrompt({
      text: [
        'ID-OK',
        'title',
        (_q, opts) => {
          expect(opts?.validate).toBeDefined();
          expect(opts!.validate!('Bad-Name')).toMatch(/camelCase|must be/);
          expect(opts!.validate!('UPPER')).toMatch(/camelCase|must be/);
          expect(opts!.validate!('good')).toBeUndefined();
          return 'good';
        },
      ],
      select:      [Priority.High],
      multiselect: [[TestLevel.Unit]],
      confirm:     [true, false, true],
    });
    const spec = await runFeatureWizard(mkCtx(p));
    expect(spec.acs[0]!.name).toBe('good');
  }

  @Verifies<FeatureNewCommandFeature>('wizardRefusesEmptyExpects')
  async 're-asks when user picks zero test levels'() {
    const p = mkPrompt({
      text:        ['ID-OK', 'title', 'acOne'],
      select:      [Priority.High],
      // first multiselect empty → re-asked; second returns one
      multiselect: [[], [TestLevel.Unit]],
      confirm:     [true, false, true],
    });
    const spec = await runFeatureWizard(mkCtx(p));
    expect(spec.acs[0]!.expects).toEqual([TestLevel.Unit]);
    // The note about "at least one" was emitted
    expect(p.notes.some(n => /At least one/.test(n.message))).toBe(true);
  }
}
void WizardFlowTests;

// ═══════════════════════════════════════════════════════════════════════════
// Replay tests
// ═══════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureNewCommandFeature)
class ReplayTests {
  @Verifies<FeatureNewCommandFeature>('replaySeedsDefaultsFromSpec')
  async 'replay pre-fills text/select defaults from seed'() {
    const seed = seedSpec();
    const p = mkPrompt({
      text: [
        (_q, opts) => { expect(opts?.default).toBe('SEED-FEATURE'); return 'SEED-FEATURE'; },
        (_q, opts) => { expect(opts?.default).toBe('Seeded');       return 'Seeded'; },
      ],
      select: [
        (_q, _choices, dflt) => { expect(dflt).toBe(Priority.High); return Priority.High; },
        'keep', 'keep',
      ],
      multiselect: [],
      confirm:     [/*add another?*/ false, /*create?*/ true],
    });
    const spec = await runFeatureWizard(mkCtx(p), seed);
    expect(spec.id).toBe('SEED-FEATURE');
    expect(spec.acs).toHaveLength(2);
  }

  @Verifies<FeatureNewCommandFeature>('replayOffersKeepEditDeletePerAc')
  async 'replay offers keep/edit/delete per existing AC'() {
    const seed = seedSpec();
    const p = mkPrompt({
      text:   ['SEED-FEATURE', 'Seeded', /*edit name*/ 'firstEdited'],
      select: [
        Priority.High,
        'edit',   // first
        'delete', // second
      ],
      multiselect: [[TestLevel.Functional]], // edited expects
      confirm:     [/*add another?*/ false, /*create?*/ true],
    });
    const spec = await runFeatureWizard(mkCtx(p), seed);
    expect(spec.acs).toHaveLength(1);
    expect(spec.acs[0]!.name).toBe('firstEdited');
    expect(spec.acs[0]!.expects).toEqual([TestLevel.Functional]);
    // select queue had three entries (priority + two per-AC actions)
    expect(p.selectCalls.length).toBe(3);
  }

  @Verifies<FeatureNewCommandFeature>('yesFlagSkipsAllPromptsAndApplies')
  async 'yes flag returns validated seed with no prompts'() {
    const seed = seedSpec();
    const p = mkPrompt(); // no queues → would throw if any prompt invoked
    const spec = await runFeatureWizard(mkCtx(p), seed, { yes: true });
    expect(spec.id).toBe('SEED-FEATURE');
    expect(spec.$schemaVersion).toBe(SCHEMA_VERSION);
    expect(spec.$schema).toBe('./feature-spec.schema.json');
    expect(p.textCalls).toHaveLength(0);
    expect(p.selectCalls).toHaveLength(0);
  }

  @Verifies<FeatureNewCommandFeature>('replayValidatesSpecAgainstSchema')
  async 'yes flag rejects invalid seed (no ACs) and requires seed'() {
    // Missing seed
    const p0 = mkPrompt();
    await expect(
      runFeatureWizard(mkCtx(p0), undefined, { yes: true }),
    ).rejects.toThrow(/--yes requires/);

    // Seed with empty ACs
    const bad: FeatureSpec = { ...seedSpec(), acs: [] };
    const p1 = mkPrompt();
    await expect(
      runFeatureWizard(mkCtx(p1), bad, { yes: true }),
    ).rejects.toThrow(/at least one AC/);

    // Seed with an AC having empty expects
    const bad2: FeatureSpec = {
      ...seedSpec(),
      acs: [{ name: 'x' as never, expects: [] }],
    };
    const p2 = mkPrompt();
    await expect(
      runFeatureWizard(mkCtx(p2), bad2, { yes: true }),
    ).rejects.toThrow(/at least one expected test level/);
  }
}
void ReplayTests;

// ═══════════════════════════════════════════════════════════════════════════
// Requirement cross-link + templates + cancellation
// ═══════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureNewCommandFeature)
class CrossLinkTemplateTests {
  @Verifies<FeatureNewCommandFeature>('wizardOffersRequirementSelection')
  async 'offers multiselect of existing Requirement ids'() {
    const reqs: readonly RequirementId[] = [
      requirementId('REQ-A'),
      requirementId('REQ-B'),
      requirementId('REQ-C'),
    ];
    const p = mkPrompt({
      text:        ['MY-F', 'title', 'doIt'],
      select:      [Priority.High],
      multiselect: [[TestLevel.Unit], [reqs[0]!, reqs[2]!]],
      confirm:     [true, false, true],
    });
    const spec = await runFeatureWizard(mkCtx(p, reqs));
    expect(spec.satisfies).toEqual([reqs[0], reqs[2]]);
    // The choices offered matched existingRequirementIds exactly
    const msCall = p.multiselectCalls.find(c => /Requirements/i.test(c.q))!;
    expect(msCall).toBeDefined();
    expect(msCall.choices.map(c => c.value)).toEqual([...reqs]);
  }

  @Verifies<FeatureNewCommandFeature>('wizardOffersRequirementSelection')
  async 'omits satisfies when pool is empty and none from seed'() {
    const p = mkPrompt({
      text:        ['MY-F', 'title', 'doIt'],
      select:      [Priority.High],
      multiselect: [[TestLevel.Unit]],
      confirm:     [true, false, true],
    });
    const spec = await runFeatureWizard(mkCtx(p, []));
    expect(spec.satisfies).toBeUndefined();
  }

  @Verifies<FeatureNewCommandFeature>('wizardOffersRequirementSelection')
  async 'carries seed.satisfies through when pool empty'() {
    const seed: FeatureSpec = {
      ...seedSpec(),
      satisfies: [requirementId('REQ-PRESERVED')],
    };
    const p = mkPrompt({
      text:   ['SEED-FEATURE', 'Seeded'],
      select: [Priority.High, 'keep', 'keep'],
      confirm:[/*add another?*/ false, /*create?*/ true],
    });
    const spec = await runFeatureWizard(mkCtx(p, []), seed);
    expect(spec.satisfies).toEqual([requirementId('REQ-PRESERVED')]);
  }

  @Verifies<FeatureNewCommandFeature>('templateFlagPreFillsSpec')
  async 'template flag pre-fills priority from skeleton'() {
    // 'compliance-regulation' skeleton declares priority: 'Critical'
    const p = mkPrompt({
      text:   ['MY-F', 'title', 'doIt'],
      select: [
        (_q, _choices, dflt) => {
          expect(dflt).toBe(Priority.Critical);
          return Priority.Critical;
        },
      ],
      multiselect: [[TestLevel.Unit]],
      confirm:     [true, false, true],
    });
    const spec = await runFeatureWizard(mkCtx(p), undefined, {
      template: 'compliance-regulation',
    });
    expect(spec.priority).toBe(Priority.Critical);
  }

  @Verifies<FeatureNewCommandFeature>('templateFlagPreFillsSpec')
  async 'template flag throws when template unknown'() {
    const p = mkPrompt();
    await expect(
      runFeatureWizard(mkCtx(p), undefined, { template: 'does-not-exist' }),
    ).rejects.toThrow(/Template not found/);
  }

  @Verifies<FeatureNewCommandFeature>('templateFlagPreFillsSpec')
  async 'template with unmapped priority falls back to High'() {
    // Synthesize a style whose template has a bogus priority string
    const style = {
      ...DefaultStyle,
      templates: {
        templates: [],
        findTemplate: () => ({
          id: 'bogus',
          label: 'bogus',
          description: '',
          skeleton: { priority: 'Unknown' },
        }),
      },
    };
    const p = mkPrompt({
      text:   ['MY-F', 'title', 'doIt'],
      select: [
        (_q, _choices, dflt) => {
          expect(dflt).toBe(Priority.High);
          return Priority.High;
        },
      ],
      multiselect: [[TestLevel.Unit]],
      confirm:     [true, false, true],
    });
    await runFeatureWizard(
      { prompt: p, style, existingFeatureIds: [], existingRequirementIds: [] },
      undefined,
      { template: 'bogus' },
    );
  }

  @Verifies<FeatureNewCommandFeature>('templateFlagPreFillsSpec')
  async 'template maps every priority string from skeleton'() {
    for (const [skeletonPriority, mapped] of [
      ['High',   Priority.High],
      ['Medium', Priority.Medium],
      ['Low',    Priority.Low],
    ] as const) {
      const style = {
        ...DefaultStyle,
        templates: {
          templates: [],
          findTemplate: () => ({
            id: 't', label: 't', description: '',
            skeleton: { priority: skeletonPriority },
          }),
        },
      };
      const p = mkPrompt({
        text:        ['MY-F', 'title', 'doIt'],
        select:      [(_q, _c, dflt) => { expect(dflt).toBe(mapped); return mapped; }],
        multiselect: [[TestLevel.Unit]],
        confirm:     [true, false, true],
      });
      const spec = await runFeatureWizard(
        { prompt: p, style, existingFeatureIds: [], existingRequirementIds: [] },
        undefined,
        { template: 't' },
      );
      expect(spec.priority).toBe(mapped);
    }
  }

  @Verifies<FeatureNewCommandFeature>('replayValidatesSpecAgainstSchema')
  async 'surface style validator errors'() {
    const style = {
      ...DefaultStyle,
      validators: {
        validateStatement: DefaultStyle.validators.validateStatement,
        validateSpec: () => ({ ok: false as const, errors: [{ path: 'id', message: 'nope' }] }),
      },
    };
    const seed = seedSpec();
    await expect(
      runFeatureWizard(
        { prompt: mkPrompt(), style, existingFeatureIds: [], existingRequirementIds: [] },
        seed,
        { yes: true },
      ),
    ).rejects.toThrow(/Invalid FeatureSpec: id: nope/);
  }

  @Verifies<FeatureNewCommandFeature>('wizardCollectsIdTitlePriority')
  async 'cancelling summary throws'() {
    const p = mkPrompt({
      text:        ['MY-F', 'title', 'doIt'],
      select:      [Priority.High],
      multiselect: [[TestLevel.Unit]],
      confirm:     [true, false, /*create?*/ false],
    });
    await expect(runFeatureWizard(mkCtx(p))).rejects.toThrow(/cancelled/);
  }

  @Verifies<FeatureNewCommandFeature>('wizardCollectsIdTitlePriority')
  async 'title validator rejects blank'() {
    const p = mkPrompt({
      text: [
        'MY-F',
        (_q, opts) => {
          expect(opts?.validate!('')).toMatch(/empty/);
          expect(opts?.validate!('   ')).toMatch(/empty/);
          expect(opts?.validate!('ok')).toBeUndefined();
          return 'ok';
        },
        'doIt',
      ],
      select:      [Priority.High],
      multiselect: [[TestLevel.Unit]],
      confirm:     [true, false, true],
    });
    const spec = await runFeatureWizard(mkCtx(p));
    expect(spec.title).toBe('ok');
  }

  @Verifies<FeatureNewCommandFeature>('replaySeedsDefaultsFromSpec')
  async 'edit action uses existing AC as defaults'() {
    const seed = seedSpec();
    const p = mkPrompt({
      text: [
        'SEED-FEATURE',
        'Seeded',
        (_q, opts) => { expect(opts?.default).toBe('first'); return 'firstRenamed'; },
      ],
      select: [
        Priority.High,
        'edit',
        'keep',
      ],
      multiselect: [
        (_q, _choices, dflt) => {
          expect(dflt).toEqual([TestLevel.Unit]);
          return [TestLevel.Unit, TestLevel.Visual];
        },
      ],
      confirm: [/*add another?*/ false, /*create?*/ true],
    });
    const spec = await runFeatureWizard(mkCtx(p), seed);
    expect(spec.acs[0]!.name).toBe('firstRenamed');
    expect(spec.acs[0]!.expects).toEqual([TestLevel.Unit, TestLevel.Visual]);
    expect(spec.acs[1]!.name).toBe('second');
  }
}
void CrossLinkTemplateTests;
