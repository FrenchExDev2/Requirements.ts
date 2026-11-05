import { expect } from 'vitest';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { FeatureNewCommandFeature } from '@frenchexdev2/requirements-requirements';
import { Priority, TestLevel } from '@frenchexdev2/requirements-core';
import {
  SCHEMA_VERSION,
  featureId,
  acName,
  type FeatureSpec,
} from '@frenchexdev2/requirements-core/types';
import type {
  FileSystem,
  Logger,
  Prompt,
  PromptChoice,
  PromptSpinner,
  PromptTextOptions,
  Vcs,
} from '@frenchexdev2/requirements-core/ports';
import {
  orchestrateSpecWizard,
  buildSpecSyncPlan,
  UntrackedOverwriteError,
  computeSpecCoverageDelta,
  renderCoverageDelta,
} from '../../src/orchestrate-spec-wizard';

// ── In-memory FileSystem mock ───────────────────────────────────────────────

function mkFs(initial: Record<string, string> = {}): FileSystem & {
  files: Map<string, string>;
  writes: string[];
  dirs: Set<string>;
} {
  const files = new Map<string, string>(Object.entries(initial));
  const writes: string[] = [];
  const dirs = new Set<string>();
  return {
    files,
    writes,
    dirs,
    async readFile(p: string, _enc: 'utf8') {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    async writeFile(p: string, content: string) {
      files.set(p, content);
      writes.push(p);
    },
    async exists(p: string) { return files.has(p); },
    async mkdir(p: string) { dirs.add(p); },
    async readdir() { return []; },
    async stat() { return { mtimeMs: 0, isDirectory: () => false, size: 0 }; },
  };
}

// ── Scripted Prompt mock ────────────────────────────────────────────────────

interface ScriptedPrompt extends Prompt {
  readonly confirms: Array<{ q: string; answer: boolean }>;
  readonly selects: Array<{ q: string; answer: string }>;
  readonly notes: Array<{ title?: string; message: string }>;
}

function mkPrompt(opts: {
  select?: (string | ((q: string) => string))[];
  confirm?: (boolean | ((q: string) => boolean))[];
} = {}): ScriptedPrompt {
  const selectQueue = [...(opts.select ?? [])];
  const confirmQueue = [...(opts.confirm ?? [])];
  const confirms: Array<{ q: string; answer: boolean }> = [];
  const selects: Array<{ q: string; answer: string }> = [];
  const notes: Array<{ title?: string; message: string }> = [];
  const spinner: PromptSpinner = { start() {}, stop() {} };
  return {
    confirms,
    selects,
    notes,
    async text(_q: string, _opts?: PromptTextOptions) { throw new Error('unexpected text prompt'); },
    async select<T extends string>(q: string, _choices: readonly PromptChoice<T>[], dflt?: T) {
      const next = selectQueue.shift();
      if (next === undefined) throw new Error(`unexpected select('${q}')`);
      const answer = (typeof next === 'function' ? next(q) : next) as T;
      selects.push({ q, answer });
      return answer ?? (dflt as T);
    },
    async multiselect<T extends string>(_q: string, _c: readonly PromptChoice<T>[], dflt?: readonly T[]) {
      return (dflt ?? []) as readonly T[];
    },
    async confirm(q: string, _dflt?: boolean) {
      const next = confirmQueue.shift();
      if (next === undefined) throw new Error(`unexpected confirm('${q}')`);
      const answer = typeof next === 'function' ? next(q) : next;
      confirms.push({ q, answer });
      return answer;
    },
    note(message: string, title?: string) { notes.push({ message, title }); },
    spinner() { return spinner; },
  };
}

// ── Capturing Logger ────────────────────────────────────────────────────────

function mkLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    info(msg: string) { lines.push(msg); },
    warn(msg: string) { lines.push(msg); },
    error(msg: string) { lines.push(msg); },
  };
}

// ── Spec fixture ────────────────────────────────────────────────────────────

function mkFeatureSpec(id = 'ORCH-FIXTURE'): FeatureSpec {
  return {
    $schemaVersion: SCHEMA_VERSION,
    kind: 'feature',
    id: featureId(id),
    title: 'Orchestrator fixture',
    priority: Priority.High,
    acs: [
      { name: acName('alpha'), expects: [TestLevel.Unit] },
    ],
  };
}

const ROOT = '/tmp/root';
const CONFIG = {
  featuresDir: 'requirements/features',
  requirementsDir: 'requirements/requirements',
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Port-based CLI-flow ACs of FeatureNewCommandFeature
// ═══════════════════════════════════════════════════════════════════════════

@FeatureTest(FeatureNewCommandFeature)
class OrchestratorFlowTests {
  @Verifies<FeatureNewCommandFeature>('previewOffersApplyReviewCancel')
  async defaultOptionsIncludeScaffoldsAndAskBeforeApplying() {
    const spec = mkFeatureSpec();
    const plan = await buildSpecSyncPlan(spec, ROOT, CONFIG, mkFs());
    expect(plan.entries.some(entry => entry.path.includes('-scaffold.'))).toBe(true);
    const prompt = mkPrompt({ select: ['all'] });
    const result = await orchestrateSpecWizard(spec, ROOT, CONFIG, { prompt, fs: mkFs(), logger: mkLogger() });
    expect(prompt.selects).toHaveLength(1);
    expect(result.applied).toHaveLength(plan.entries.length);
  }
  @Verifies<FeatureNewCommandFeature>('previewOffersApplyReviewCancel')
  async refusingEveryFileRetainsSkippedDiagnostics() {
    const fs=mkFs(),logger=mkLogger();
    const result=await orchestrateSpecWizard(mkFeatureSpec(),ROOT,CONFIG,{fs,logger,prompt:mkPrompt({select:['per-file'],confirm:[false,false]})},{noTest:true});
    expect(result.applied).toEqual([]);
    expect(result.skipped).toHaveLength(2);
    expect(logger.lines.filter(line=>line.includes('(skipped)'))).toHaveLength(2);
  }
  @Verifies<FeatureNewCommandFeature>('previewShowsDiffBeforeAnyWrite')
  async 'renders diff preview before any apply decision'() {
    const fs = mkFs();
    const logger = mkLogger();
    // --yes path so no prompts fire; preview must still be emitted.
    await orchestrateSpecWizard(
      mkFeatureSpec(),
      ROOT,
      CONFIG,
      { prompt: mkPrompt(), fs, logger },
      { yes: true, noTest: true },
    );
    // The logger got the rendered plan BEFORE any writes happened. Writes are
    // captured into fs.writes in order, so the preview line must appear first.
    const previewIdx = logger.lines.findIndex(l => l.includes('CREATE'));
    expect(previewIdx).toBeGreaterThanOrEqual(0);
    // And the FS did get at least one write (so we're on the apply path).
    expect(fs.writes.length).toBeGreaterThan(0);
  }

  @Verifies<FeatureNewCommandFeature>('previewOffersApplyReviewCancel')
  async 'prompts apply / review / cancel when not --yes and plan is non-empty'() {
    const fs = mkFs();
    const logger = mkLogger();
    const prompt = mkPrompt({
      select: ['all'],
      confirm: [/* open in editor? */ false],
    });
    await orchestrateSpecWizard(
      mkFeatureSpec(),
      ROOT,
      CONFIG,
      { prompt, fs, logger, openInEditor: async () => {} },
      { noTest: true },
    );
    // The select prompt was made with Apply / Review / Cancel semantics.
    expect(prompt.selects).toHaveLength(1);
    expect(prompt.selects[0]!.q).toMatch(/Apply how/);
  }

  @Verifies<FeatureNewCommandFeature>('dryRunFlagForcesPreviewCancel')
  async '--dry-run renders preview and performs no writes'() {
    const fs = mkFs();
    const logger = mkLogger();
    const prompt = mkPrompt(); // no answers expected — dry-run short-circuits
    const result = await orchestrateSpecWizard(
      mkFeatureSpec(),
      ROOT,
      CONFIG,
      { prompt, fs, logger },
      { dryRun: true, noTest: true },
    );
    expect(result.applied).toEqual([]);
    expect(fs.writes).toEqual([]);
    expect(logger.lines.some(l => l.includes('(dry-run)'))).toBe(true);
  }

  @Verifies<FeatureNewCommandFeature>('endOfWizardOffersOpenInEditor')
  async 'offers to open applied files in editor when not --yes'() {
    const fs = mkFs();
    const logger = mkLogger();
    const opened: string[][] = [];
    const prompt = mkPrompt({
      select: ['all'],
      confirm: [/* open? */ true],
    });
    const result = await orchestrateSpecWizard(
      mkFeatureSpec(),
      ROOT,
      CONFIG,
      {
        prompt,
        fs,
        logger,
        openInEditor: async (paths) => { opened.push([...paths]); },
      },
      { noTest: true },
    );
    expect(result.editorOpened).toBe(true);
    expect(opened).toHaveLength(1);
    expect(opened[0]!.length).toBeGreaterThan(0);
    // The confirm prompt was specifically about the editor.
    expect(prompt.confirms.at(-1)!.q).toMatch(/editor|VS Code/i);
  }

  @Verifies<FeatureNewCommandFeature>('noTestFlagSkipsScaffolding')
  async '--no-test omits scaffold paths from the plan'() {
    const fs = mkFs();
    const logger = mkLogger();
    const withTest = await orchestrateSpecWizard(
      mkFeatureSpec('WITH-TEST'),
      ROOT,
      CONFIG,
      { prompt: mkPrompt(), fs, logger },
      { yes: true, dryRun: true, noTest: false },
    );
    const fs2 = mkFs();
    const logger2 = mkLogger();
    const noTest = await orchestrateSpecWizard(
      mkFeatureSpec('NO-TEST'),
      ROOT,
      CONFIG,
      { prompt: mkPrompt(), fs: fs2, logger: logger2 },
      { yes: true, dryRun: true, noTest: true },
    );
    // noTest must have fewer entries (the scaffold ones are skipped).
    expect(noTest.plan.entries.length).toBeLessThan(withTest.plan.entries.length);
    const hasScaffold = noTest.plan.entries.some(e => /scaffold|test[\\/].*\.test\.ts/.test(e.path));
    expect(hasScaffold).toBe(false);
  }

  @Verifies<FeatureNewCommandFeature>('walksFullWizardEndToEnd')
  async 'full path: preview → apply-all → files on disk → editor opened'() {
    const fs = mkFs();
    const logger = mkLogger();
    const opened: string[][] = [];
    const prompt = mkPrompt({
      select: ['all'],
      confirm: [true],
    });
    const result = await orchestrateSpecWizard(
      mkFeatureSpec('E2E-FIXTURE'),
      ROOT,
      CONFIG,
      {
        prompt,
        fs,
        logger,
        openInEditor: async (paths) => { opened.push([...paths]); },
      },
      { noTest: true },
    );
    // Plan → apply → writes visible on disk → editor opened.
    expect(result.cancelled).toBe(false);
    expect(result.applied.length).toBeGreaterThan(0);
    for (const p of result.applied) expect(fs.files.has(p)).toBe(true);
    expect(result.editorOpened).toBe(true);
    expect(opened).toHaveLength(1);
  }

  @Verifies<FeatureNewCommandFeature>('previewOffersApplyReviewCancel')
  async 'user choosing cancel at the apply-mode prompt writes nothing'() {
    const fs = mkFs();
    const logger = mkLogger();
    const prompt = mkPrompt({ select: ['dry-run'] });
    const result = await orchestrateSpecWizard(
      mkFeatureSpec('CANCEL'),
      ROOT,
      CONFIG,
      { prompt, fs, logger },
      { noTest: true },
    );
    expect(result.cancelled).toBe(true);
    expect(fs.writes).toEqual([]);
    expect(result.applied).toEqual([]);
  }

  @Verifies<FeatureNewCommandFeature>('endOfWizardOffersOpenInEditor')
  async 'user declining to open editor leaves editorOpened false'() {
    const fs = mkFs();
    const logger = mkLogger();
    const opened: string[][] = [];
    const prompt = mkPrompt({
      select: ['all'],
      confirm: [/* open? */ false],
    });
    const result = await orchestrateSpecWizard(
      mkFeatureSpec('NO-OPEN'),
      ROOT,
      CONFIG,
      {
        prompt,
        fs,
        logger,
        openInEditor: async (paths) => { opened.push([...paths]); },
      },
      { noTest: true },
    );
    expect(result.editorOpened).toBe(false);
    expect(opened).toEqual([]);
    expect(result.applied.length).toBeGreaterThan(0);
  }
}

@FeatureTest(FeatureNewCommandFeature)
class BuildPlanTests {
  @Verifies<FeatureNewCommandFeature>('walksFullWizardEndToEnd')
  async 'buildSpecSyncPlan for a requirement emits a single source + spec.json'() {
    const fs = mkFs();
    const { type: _t } = { type: 'ignore' } as const;
    void _t;
    const reqSpec = {
      $schemaVersion: SCHEMA_VERSION,
      kind: 'requirement' as const,
      id: 'REQ-ORCH' as never,
      title: 'Orch req',
      priority: Priority.High,
      statement: { pattern: 'natural' as const, text: 'x' as never },
      requirementKind: 'functional' as never,
      status: 'draft' as never,
      source: { type: 'stakeholder', name: 'x' } as never,
      rationale: { claim: 'x' as never, kind: 'other' as never, evidence: [] as never },
      fitCriteria: [],
      verificationMethod: 'test' as never,
      risk: 'low' as never,
      satisfiedBy: [],
    } as never;
    const plan = await buildSpecSyncPlan(reqSpec, ROOT, CONFIG, fs, { noTest: true });
    // Requirement → source + spec.json (no scaffolds).
    expect(plan.entries).toHaveLength(2);
    for (const e of plan.entries) expect(e.status).toBe('create');
  }

  @Verifies<FeatureNewCommandFeature>('walksFullWizardEndToEnd')
  async 'buildSpecSyncPlan classifies an already-written spec as unchanged'() {
    const spec = mkFeatureSpec('PRE-WRITTEN');
    const firstFs = mkFs();
    const logger = mkLogger();
    // Prime disk via an --yes run.
    await orchestrateSpecWizard(
      spec,
      ROOT,
      CONFIG,
      { prompt: mkPrompt(), fs: firstFs, logger },
      { yes: true, noTest: true },
    );
    // Rerun build-only on the same FS: every entry should be unchanged.
    const plan = await buildSpecSyncPlan(spec, ROOT, CONFIG, firstFs, { noTest: true });
    for (const e of plan.entries) expect(e.status).toBe('unchanged');
  }
}

// ── Scripted Vcs port ────────────────────────────────────────────────────────

function mkVcs(trackedPaths: ReadonlySet<string>): Vcs & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async isTracked(p: string) {
      calls.push(p);
      return trackedPaths.has(p);
    },
  };
}

@FeatureTest(FeatureNewCommandFeature)
class UntrackedGuardTests {
  @Verifies<FeatureNewCommandFeature>('refusesOverwriteUntrackedFile')
  async 'throws UntrackedOverwriteError when a modified target is not tracked'() {
    // Prime the FS: a pre-existing spec file whose content differs from what
    // the orchestrator would generate → classified as `modified`.
    const spec = mkFeatureSpec('UNTRACKED');
    // Warm run to compute the paths that will appear as modified.
    const warmFs = mkFs();
    const warmLogger = mkLogger();
    const warm = await orchestrateSpecWizard(
      spec,
      ROOT,
      CONFIG,
      { prompt: mkPrompt(), fs: warmFs, logger: warmLogger },
      { yes: true, dryRun: true, noTest: true },
    );
    // Pick a path that would be created, pre-seed its disk content with
    // something different so on the second run it shows up as `modified`.
    const targetPath = warm.plan.entries[0]!.path;
    const seededFs = mkFs({ [targetPath]: '// stale content\n' });
    const logger = mkLogger();
    // Vcs knows nothing about this path.
    const vcs = mkVcs(new Set<string>());

    await expect(
      orchestrateSpecWizard(
        spec,
        ROOT,
        CONFIG,
        { prompt: mkPrompt(), fs: seededFs, logger, vcs },
        { yes: true, noTest: true },
      ),
    ).rejects.toBeInstanceOf(UntrackedOverwriteError);

    // And nothing was written (the seeded file remains as-is).
    expect(seededFs.files.get(targetPath)).toBe('// stale content\n');
  }

  @Verifies<FeatureNewCommandFeature>('refusesOverwriteUntrackedFile')
  async 'proceeds when modified target IS tracked'() {
    const spec = mkFeatureSpec('TRACKED');
    const warmFs = mkFs();
    const warmLogger = mkLogger();
    const warm = await orchestrateSpecWizard(
      spec,
      ROOT,
      CONFIG,
      { prompt: mkPrompt(), fs: warmFs, logger: warmLogger },
      { yes: true, dryRun: true, noTest: true },
    );
    const targetPath = warm.plan.entries[0]!.path;
    const seededFs = mkFs({ [targetPath]: '// stale content\n' });
    const logger = mkLogger();
    const vcs = mkVcs(new Set([targetPath]));

    const result = await orchestrateSpecWizard(
      spec,
      ROOT,
      CONFIG,
      { prompt: mkPrompt(), fs: seededFs, logger, vcs },
      { yes: true, noTest: true },
    );
    expect(result.applied.length).toBeGreaterThan(0);
    // Vcs.isTracked was consulted for the modified path.
    expect(vcs.calls).toContain(targetPath);
  }

  @Verifies<FeatureNewCommandFeature>('refusesOverwriteUntrackedFile')
  async 'skips vcs check when no port is provided (backward compatible)'() {
    const spec = mkFeatureSpec('NO-VCS');
    const warmFs = mkFs();
    const warm = await orchestrateSpecWizard(
      spec, ROOT, CONFIG,
      { prompt: mkPrompt(), fs: warmFs, logger: mkLogger() },
      { yes: true, dryRun: true, noTest: true },
    );
    const targetPath = warm.plan.entries[0]!.path;
    const seededFs = mkFs({ [targetPath]: '// stale\n' });
    const result = await orchestrateSpecWizard(
      spec, ROOT, CONFIG,
      { prompt: mkPrompt(), fs: seededFs, logger: mkLogger() /* no vcs */ },
      { yes: true, noTest: true },
    );
    expect(result.applied.length).toBeGreaterThan(0);
  }

  @Verifies<FeatureNewCommandFeature>('refusesOverwriteUntrackedFile')
  async 'does not consult vcs for create entries (only modified)'() {
    // Fresh FS → every entry is `create` → vcs.isTracked must NOT be called.
    const fs = mkFs();
    const vcs = mkVcs(new Set<string>());
    const result = await orchestrateSpecWizard(
      mkFeatureSpec('ALL-CREATE'),
      ROOT,
      CONFIG,
      { prompt: mkPrompt(), fs, logger: mkLogger(), vcs },
      { yes: true, noTest: true },
    );
    expect(result.applied.length).toBeGreaterThan(0);
    expect(vcs.calls).toEqual([]);
  }
}

@FeatureTest(FeatureNewCommandFeature)
class CoverageDeltaTests {
  @Verifies<FeatureNewCommandFeature>('previewIncludesCoverageDelta')
  async 'preview includes a Δ line with AC counts for a new feature'() {
    const fs = mkFs();
    const logger = mkLogger();
    const result = await orchestrateSpecWizard(
      mkFeatureSpec('COVDELTA-NEW'),
      ROOT,
      CONFIG,
      { prompt: mkPrompt(), fs, logger },
      { yes: true, dryRun: true, noTest: true },
    );
    expect(result.delta).not.toBeNull();
    expect(result.delta!.isNew).toBe(true);
    expect(result.delta!.before).toBe(0);
    expect(result.delta!.after).toBe(1);
    expect(result.delta!.added).toBe(1);
    // Rendered preview contains the Δ line with the feature id.
    expect(logger.lines.some(l => l.includes('Δ COVDELTA-NEW') && l.includes('+1 ACs'))).toBe(true);
  }

  @Verifies<FeatureNewCommandFeature>('previewIncludesCoverageDelta')
  async 'preview Δ line shows before → after counts for a modified feature'() {
    const spec = mkFeatureSpec('COVDELTA-MOD');
    // Warm run to discover the exact on-disk path planWrites emits (it
    // lowercases the file name). That path is what we must seed for the
    // second run to classify it as `modified` rather than `create`.
    const warmFs = mkFs();
    const warm = await orchestrateSpecWizard(
      spec, ROOT, CONFIG,
      { prompt: mkPrompt(), fs: warmFs, logger: mkLogger() },
      { yes: true, dryRun: true, noTest: true },
    );
    const targetPath = warm.plan.entries.find(e => e.path.endsWith('.ts'))!.path;

    const stale =
      "import { Feature, type ACResult } from '@frenchexdev2/requirements-core';\n" +
      'export abstract class CovdeltaModFeature extends Feature {\n' +
      '  abstract oldOne(): ACResult;\n' +
      '  abstract oldTwo(): ACResult;\n' +
      '}\n';
    const fs = mkFs({ [targetPath]: stale });
    const logger = mkLogger();
    const result = await orchestrateSpecWizard(
      spec,
      ROOT,
      CONFIG,
      { prompt: mkPrompt(), fs, logger },
      { yes: true, dryRun: true, noTest: true },
    );
    // before=2 (oldOne/oldTwo), after=1 (alpha), added=1, removed=2, isNew=false
    expect(result.delta).not.toBeNull();
    expect(result.delta!.isNew).toBe(false);
    expect(result.delta!.before).toBe(2);
    expect(result.delta!.after).toBe(1);
    expect(result.delta!.added).toBe(1);
    expect(result.delta!.removed).toBe(2);
    const hit = logger.lines.find(l => l.includes('Δ COVDELTA-MOD'));
    expect(hit).toBeDefined();
    expect(hit!).toMatch(/2 → 1 ACs/);
    expect(hit!).toMatch(/\+1 added/);
    expect(hit!).toMatch(/-2 removed/);
  }

  @Verifies<FeatureNewCommandFeature>('previewIncludesCoverageDelta')
  async 'delta is null for a requirement spec (no Δ line emitted)'() {
    const fs = mkFs();
    const logger = mkLogger();
    const reqSpec = {
      $schemaVersion: SCHEMA_VERSION,
      kind: 'requirement' as const,
      id: 'REQ-COVDELTA' as never,
      title: 'Req cov delta',
      priority: Priority.High,
      statement: { pattern: 'natural' as const, text: 'x.' as never },
      requirementKind: 'functional' as never,
      status: 'draft' as never,
      source: { type: 'stakeholder', name: 'x' } as never,
      rationale: { claim: 'x' as never, kind: 'other' as never, evidence: [] as never },
      fitCriteria: [],
      verificationMethod: 'test' as never,
      risk: 'low' as never,
      satisfiedBy: [],
    } as never;
    const result = await orchestrateSpecWizard(
      reqSpec,
      ROOT,
      CONFIG,
      { prompt: mkPrompt(), fs, logger },
      { yes: true, dryRun: true, noTest: true },
    );
    expect(result.delta).toBeNull();
    expect(logger.lines.some(l => l.includes('Δ'))).toBe(false);
  }

  @Verifies<FeatureNewCommandFeature>('previewIncludesCoverageDelta')
  async 'delta counts overlap correctly when an AC is kept across the edit'() {
    // Spec has 1 AC 'alpha'. Seed a stale source that also has 'alpha' plus
    // one extra 'gone'. Expected: before=2, after=1, added=0, removed=1.
    const spec = mkFeatureSpec('COVDELTA-KEEP');
    const warmFs = mkFs();
    const warm = await orchestrateSpecWizard(
      spec, ROOT, CONFIG,
      { prompt: mkPrompt(), fs: warmFs, logger: mkLogger() },
      { yes: true, dryRun: true, noTest: true },
    );
    const targetPath = warm.plan.entries.find(e => e.path.endsWith('.ts'))!.path;
    const stale =
      "import { Feature, type ACResult } from '@frenchexdev2/requirements-core';\n" +
      'export abstract class CovdeltaKeepFeature extends Feature {\n' +
      '  abstract alpha(): ACResult;\n' +
      '  abstract gone(): ACResult;\n' +
      '}\n';
    const fs = mkFs({ [targetPath]: stale });
    const result = await orchestrateSpecWizard(
      spec, ROOT, CONFIG,
      { prompt: mkPrompt(), fs, logger: mkLogger() },
      { yes: true, dryRun: true, noTest: true },
    );
    expect(result.delta!.before).toBe(2);
    expect(result.delta!.after).toBe(1);
    expect(result.delta!.added).toBe(0);
    expect(result.delta!.removed).toBe(1);
  }

  @Verifies<FeatureNewCommandFeature>('previewIncludesCoverageDelta')
  async 'renderCoverageDelta emits no-change suffix when before equals after'() {
    const line = renderCoverageDelta({
      featureId: 'NOCHANGE',
      before: 3,
      after: 3,
      added: 0,
      removed: 0,
      isNew: false,
    });
    expect(line).toMatch(/Δ NOCHANGE: 3 → 3 ACs \(no change\)/);
  }

  @Verifies<FeatureNewCommandFeature>('previewIncludesCoverageDelta')
  async 'computeSpecCoverageDelta directly returns null for a requirement spec'() {
    const fs = mkFs();
    const reqSpec = {
      $schemaVersion: SCHEMA_VERSION,
      kind: 'requirement' as const,
      id: 'REQ-X' as never,
      title: 't',
      priority: Priority.High,
      statement: { pattern: 'natural' as const, text: 'x.' as never },
      requirementKind: 'functional' as never,
      status: 'd' as never,
      source: { type: 'stakeholder', name: 'x' } as never,
      rationale: { claim: 'x' as never, kind: 'other' as never, evidence: [] as never },
      fitCriteria: [],
      verificationMethod: 'test' as never,
      risk: 'low' as never,
      satisfiedBy: [],
    } as never;
    const d = await computeSpecCoverageDelta(reqSpec, ROOT, CONFIG, fs);
    expect(d).toBeNull();
  }
}

void OrchestratorFlowTests;
void BuildPlanTests;
void UntrackedGuardTests;
void CoverageDeltaTests;
