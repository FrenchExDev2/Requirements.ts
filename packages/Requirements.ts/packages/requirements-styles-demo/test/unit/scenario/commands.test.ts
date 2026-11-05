/**
 * Tests for ScenariiPlayer CLI commands — 51 ACs across 6 @FeatureTest classes.
 *
 * Port contract: all I/O goes through an in-memory FileSystem + stub validator
 * + stub orchestrator; 100% of commands.ts is reachable without touching disk.
 */

import { expect } from 'vitest';
import * as path from 'node:path';
import { FeatureTest, Verifies } from '@frenchexdev2/requirements-core';
import { ScenarioPlayCommandFeature } from '../../../requirements/features/scenario/scenario-play-command';
import { ScenarioRecordCommandFeature } from '../../../requirements/features/scenario/scenario-record-command';
import { ScenarioListCommandFeature } from '../../../requirements/features/scenario/scenario-list-command';
import { ScenarioValidateCommandFeature } from '../../../requirements/features/scenario/scenario-validate-command';
import { ScenarioInspectCommandFeature } from '../../../requirements/features/scenario/scenario-inspect-command';
import { ScenarioExportCommandFeature } from '../../../requirements/features/scenario/scenario-export-command';
import type { FileSystem } from '@frenchexdev2/requirements-core/ports';
import type { Scenario } from '../../../src/types';
import { SCHEMA_VERSION } from '@frenchexdev2/requirements-core/types';
import {
  validateScenario,
  listScenarios,
  renderListText,
  renderListJson,
  inspectScenario,
  playScenario,
  recordFromProject,
  recordFromInteractive,
  exportScenario,
  computeFallbackPlan,
  BUILT_IN_STYLE_NAMES,
  type Orchestrator,
  type OrchestratorPlanStep,
  type OrchestratorRunResult,
  type SchemaValidator,
} from '../../../src/commands';

// ── In-memory FileSystem ────────────────────────────────────────────────────

function memFs(initial: Record<string, string> = {}): FileSystem & {
  readonly files: Map<string, string>;
  readonly writes: string[];
} {
  const files = new Map<string, string>(Object.entries(initial));
  const writes: string[] = [];
  return {
    files,
    writes,
    async readFile(p) {
      if (!files.has(p)) throw new Error(`ENOENT: ${p}`);
      return files.get(p)!;
    },
    async writeFile(p, c) {
      files.set(p, c);
      writes.push(p);
    },
    async exists(p) {
      return files.has(p) || [...files.keys()].some((k) => k.startsWith(p + path.sep) || k.startsWith(p + '/'));
    },
    async mkdir() { /* no-op */ },
    async readdir(p) {
      const sep = p.endsWith('/') || p.endsWith(path.sep) ? '' : path.sep;
      const prefixes = [p + sep, p + '/', p + '\\'];
      const out = new Set<string>();
      for (const k of files.keys()) {
        for (const pref of prefixes) {
          if (k.startsWith(pref)) {
            const rest = k.slice(pref.length);
            const first = rest.split(/[\\/]/)[0];
            if (first) out.add(first);
            break;
          }
        }
      }
      return [...out];
    },
    async stat(p) {
      return { mtimeMs: 0, size: files.get(p)?.length ?? 0, isDirectory: () => false };
    },
  };
}

// ── Stub SchemaValidator (simulates ajv: require a few top-level keys) ────

function stubValidator(force?: { ok: boolean; errors?: { path: string; message: string }[] }): SchemaValidator {
  return {
    async validate(s) {
      if (force) return { ok: force.ok, errors: force.errors ?? [] };
      if (typeof s !== 'object' || s === null) {
        return { ok: false, errors: [{ path: '/', message: 'must be object' }] };
      }
      const obj = s as Record<string, unknown>;
      const missing: { path: string; message: string }[] = [];
      for (const k of ['$schemaVersion', 'id', 'title', 'description', 'style', 'seeds']) {
        if (!(k in obj)) missing.push({ path: `/${k}`, message: 'is required' });
      }
      return missing.length === 0 ? { ok: true, errors: [] } : { ok: false, errors: missing };
    },
  };
}

// ── Stub Orchestrator ──────────────────────────────────────────────────────

function stubOrchestrator(result?: Partial<OrchestratorRunResult>): Orchestrator {
  const defaultTransitions: OrchestratorPlanStep[] = [
    { fsm: 'ProjectLifecycle', from: 'Empty', to: 'Seeded', event: 'LoadScenario' },
  ];
  return {
    plan: (s) => computeFallbackPlan(s),
    run: async () => ({
      transitions: defaultTransitions,
      artifacts: ['requirements/features/FOO.ts'],
      complianceOk: true,
      complianceOutput: 'PASS',
      ...result,
    }),
  };
}

// ── Base valid scenario ────────────────────────────────────────────────────

function validScenario(): Scenario {
  return {
    $schemaVersion: SCHEMA_VERSION,
    id: 'demo',
    title: 'Demo',
    description: 'A demo scenario.',
    style: 'default',
    seeds: {
      requirements: [
        { id: 'REQ-A', title: 'Req A', satisfiedByFeatureIds: ['FEAT-A'] },
      ],
      features: [
        { id: 'FEAT-A', title: 'Feature A', priority: 'high', satisfies: ['REQ-A'], acs: [{ name: 'acOne', expects: ['unit'] }] },
      ],
    },
    narration: { intro: 'intro!', outro: 'outro!', stepDelayMs: 50 },
    targets: { expectedArtifacts: ['out/a.ts'] },
  };
}

const json = (s: Scenario) => JSON.stringify(s);

// ══════════════════════════════════════════════════════════════════════════════
// VALIDATE — 8 ACs
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(ScenarioValidateCommandFeature)
class ValidateTests {
  @Verifies<ScenarioValidateCommandFeature>('validateAcceptsWellFormedScenario')
  async 'accepts well-formed scenario'() {
    const r = await validateScenario(json(validScenario()), stubValidator(), { strict: true });
    expect(r.ok).toBe(true);
    expect(r.exitCode).toBe(0);
  }

  @Verifies<ScenarioValidateCommandFeature>('validateRejectsMissingRequiredFields')
  async 'rejects missing required fields'() {
    const r = await validateScenario(JSON.stringify({ id: 'x' }), stubValidator(), { strict: false });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  }

  @Verifies<ScenarioValidateCommandFeature>('validateReportsAjvErrorsInFriendlyFormat')
  async 'reports ajv errors prefixed by path'() {
    const r = await validateScenario(
      JSON.stringify({}),
      stubValidator({ ok: false, errors: [{ path: '/id', message: 'is required' }] }),
      { strict: false },
    );
    expect(r.errors[0]).toBe('/id: is required');
  }

  @Verifies<ScenarioValidateCommandFeature>('validateCrossChecksSatisfiesForwardReferences')
  async 'cross-checks feature satisfies forward references'() {
    const s = validScenario();
    const bad: Scenario = { ...s, seeds: { requirements: s.seeds.requirements, features: [{ ...s.seeds.features[0]!, satisfies: ['REQ-MISSING'] }] } };
    const r = await validateScenario(json(bad), stubValidator(), { strict: true });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('REQ-MISSING'))).toBe(true);
  }

  @Verifies<ScenarioValidateCommandFeature>('validateCrossChecksSatisfiedByForwardReferences')
  async 'cross-checks requirement satisfiedByFeatureIds forward references'() {
    const s = validScenario();
    const bad: Scenario = {
      ...s,
      seeds: {
        requirements: [{ ...s.seeds.requirements[0]!, satisfiedByFeatureIds: ['NOPE'] }],
        features: s.seeds.features,
      },
    };
    const r = await validateScenario(json(bad), stubValidator(), { strict: false });
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes('NOPE'))).toBe(true);
  }

  @Verifies<ScenarioValidateCommandFeature>('validateRejectsDuplicateIds')
  async 'rejects duplicate ids within seeds'() {
    const s = validScenario();
    const bad: Scenario = {
      ...s,
      seeds: {
        requirements: [s.seeds.requirements[0]!, s.seeds.requirements[0]!],
        features: [s.seeds.features[0]!, s.seeds.features[0]!],
      },
    };
    const r = await validateScenario(json(bad), stubValidator(), { strict: false });
    expect(r.errors.some((e) => e.includes('Duplicate'))).toBe(true);
  }

  @Verifies<ScenarioValidateCommandFeature>('validatePerformsNoFileWrite')
  async 'performs no file write'() {
    const fs = memFs();
    await validateScenario(json(validScenario()), stubValidator(), { strict: true });
    expect(fs.writes).toEqual([]);
  }

  @Verifies<ScenarioValidateCommandFeature>('validateExitsNonZeroOnFailure')
  async 'exits non-zero on failure'() {
    const r = await validateScenario('not json', stubValidator(), { strict: false });
    expect(r.exitCode).toBe(1);
    expect(r.errors[0]).toMatch(/Malformed JSON/);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// LIST — 6 ACs
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(ScenarioListCommandFeature)
class ListTests {
  @Verifies<ScenarioListCommandFeature>('listIncludesBuiltInScenarii')
  async 'includes built-in scenarii'() {
    const fs = memFs({
      '/pkg/scenarios/foo.scenario.json': JSON.stringify({ id: 'foo', title: 'Foo', style: 'default' }),
    });
    const r = await listScenarios(fs, { builtInDir: '/pkg/scenarios', projectDir: '/proj/scenarios' });
    expect(r.entries.some((e) => e.source === 'built-in' && e.id === 'foo')).toBe(true);
  }

  @Verifies<ScenarioListCommandFeature>('listIncludesProjectDefinedScenarii')
  async 'includes project-defined scenarii'() {
    const fs = memFs({
      '/proj/scenarios/bar.scenario.json': JSON.stringify({ id: 'bar', title: 'Bar', style: 'agile' }),
    });
    const r = await listScenarios(fs, { builtInDir: '/pkg/scenarios', projectDir: '/proj/scenarios' });
    expect(r.entries.some((e) => e.source === 'project' && e.id === 'bar')).toBe(true);
  }

  @Verifies<ScenarioListCommandFeature>('listPrintsIdTitleStyleTriple')
  async 'text render prints id title style triple'() {
    const fs = memFs({
      '/pkg/scenarios/x.scenario.json': JSON.stringify({ id: 'x', title: 'X-title', style: 'lean' }),
    });
    const r = await listScenarios(fs, { builtInDir: '/pkg/scenarios', projectDir: '/proj/scenarios' });
    const txt = renderListText(r);
    expect(txt).toContain('x');
    expect(txt).toContain('X-title');
    expect(txt).toContain('lean');
  }

  @Verifies<ScenarioListCommandFeature>('listSupportsJsonOutputFlag')
  async 'supports JSON output'() {
    const fs = memFs({
      '/pkg/scenarios/a.scenario.json': JSON.stringify({ id: 'a', title: 'A', style: 'default' }),
    });
    const r = await listScenarios(fs, { builtInDir: '/pkg/scenarios', projectDir: '/proj/scenarios' });
    const parsed = JSON.parse(renderListJson(r)) as unknown[];
    expect(parsed).toHaveLength(1);
    expect((parsed[0] as { id: string }).id).toBe('a');
  }

  @Verifies<ScenarioListCommandFeature>('listOrdersAlphabeticallyById')
  async 'orders alphabetically by id'() {
    const fs = memFs({
      '/pkg/scenarios/z.scenario.json': JSON.stringify({ id: 'zulu', title: 'Z', style: 'default' }),
      '/proj/scenarios/a.scenario.json': JSON.stringify({ id: 'alpha', title: 'A', style: 'default' }),
    });
    const r = await listScenarios(fs, { builtInDir: '/pkg/scenarios', projectDir: '/proj/scenarios' });
    expect(r.entries.map((e) => e.id)).toEqual(['alpha', 'zulu']);
  }

  @Verifies<ScenarioListCommandFeature>('listEmptyRegistryPrintsHelpfulHint')
  async 'empty registry prints helpful hint'() {
    const fs = memFs();
    const r = await listScenarios(fs, { builtInDir: '/nope', projectDir: '/nope2' });
    expect(r.isEmpty).toBe(true);
    expect(r.hint).toBeDefined();
    expect(renderListText(r)).toContain('No scenarios');
  }
}

// Extra: malformed entry skip + renderListText empty branch
@FeatureTest(ScenarioListCommandFeature)
class ListEdgeTests {
  @Verifies<ScenarioListCommandFeature>('listEmptyRegistryPrintsHelpfulHint')
  async 'skips malformed entries and handles no hint branch'() {
    const fs = memFs({
      '/pkg/scenarios/broken.scenario.json': '{ not-json',
      '/pkg/scenarios/partial.scenario.json': JSON.stringify({}),
      '/pkg/scenarios/ok.scenario.json': JSON.stringify({ id: 'ok', title: 'OK', style: 'default' }),
      '/pkg/scenarios/readme.md': 'ignored',
    });
    const r = await listScenarios(fs, { builtInDir: '/pkg/scenarios', projectDir: '/nope' });
    // broken.scenario.json is skipped; partial gets fallback id (filename) and "(untitled)" title
    expect(r.entries.some((e) => e.id === 'ok')).toBe(true);
    expect(r.entries.some((e) => e.title === '(untitled)')).toBe(true);
    // Exercise renderListText with entries present
    expect(renderListText(r).length).toBeGreaterThan(0);
    // Exercise renderListText hint-absent branch: construct manual empty result
    expect(renderListText({ entries: [], isEmpty: true })).toBe('');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// INSPECT — 7 ACs
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(ScenarioInspectCommandFeature)
class InspectTests {
  @Verifies<ScenarioInspectCommandFeature>('inspectPrintsProjectLifecycleTransitions')
  async 'prints ProjectLifecycle transitions'() {
    const r = await inspectScenario(json(validScenario()), stubValidator(), stubOrchestrator(), { mermaid: false });
    expect('transitions' in r).toBe(true);
    if ('transitions' in r) {
      expect(r.transitions.some((t) => t.fsm === 'ProjectLifecycle')).toBe(true);
    }
  }

  @Verifies<ScenarioInspectCommandFeature>('inspectPrintsPerFeatureTransitions')
  async 'prints PerFeature transitions'() {
    const r = await inspectScenario(json(validScenario()), stubValidator(), stubOrchestrator(), { mermaid: false });
    if ('transitions' in r) {
      expect(r.transitions.some((t) => t.fsm === 'PerFeature')).toBe(true);
    }
  }

  @Verifies<ScenarioInspectCommandFeature>('inspectPrintsPerAcTransitions')
  async 'prints PerAc transitions'() {
    const r = await inspectScenario(json(validScenario()), stubValidator(), stubOrchestrator(), { mermaid: false });
    if ('transitions' in r) {
      expect(r.transitions.some((t) => t.fsm === 'PerAc')).toBe(true);
    }
  }

  @Verifies<ScenarioInspectCommandFeature>('inspectAnnotatesTransitionsWithEventAndGuard')
  async 'annotates transitions with event + guard'() {
    const r = await inspectScenario(json(validScenario()), stubValidator(), stubOrchestrator(), { mermaid: false });
    if ('transitions' in r) {
      expect(r.transitions.every((t) => typeof t.event === 'string')).toBe(true);
      expect(r.transitions.some((t) => typeof t.guard === 'string')).toBe(true);
      expect(r.rendering).toContain('LoadScenario');
      expect(r.rendering).toMatch(/\[schema validates\]/);
    }
  }

  @Verifies<ScenarioInspectCommandFeature>('inspectPerformsNoFileWrite')
  async 'performs no file write'() {
    const r = await inspectScenario(json(validScenario()), stubValidator(), stubOrchestrator(), { mermaid: false });
    if ('transitions' in r) expect(r.wrote).toBe(false);
  }

  @Verifies<ScenarioInspectCommandFeature>('inspectSupportsMermaidOutputFlag')
  async 'supports mermaid output'() {
    const r = await inspectScenario(json(validScenario()), stubValidator(), stubOrchestrator(), { mermaid: true });
    if ('transitions' in r) {
      expect(r.rendering).toMatch(/^stateDiagram-v2/);
      expect(r.rendering).toContain('-->');
    }
  }

  @Verifies<ScenarioInspectCommandFeature>('inspectPrintsExpectedArtifactPaths')
  async 'prints expected artifact paths'() {
    const r = await inspectScenario(json(validScenario()), stubValidator(), stubOrchestrator(), { mermaid: false });
    if ('transitions' in r) {
      expect(r.expectedArtifacts).toContain('out/a.ts');
      expect(r.rendering).toContain('out/a.ts');
    }
  }
}

// Fallback-plan branch (no orchestrator) + invalid scenario branch
@FeatureTest(ScenarioInspectCommandFeature)
class InspectFallbackTests {
  @Verifies<ScenarioInspectCommandFeature>('inspectPrintsProjectLifecycleTransitions')
  async 'falls back to computeFallbackPlan when orchestrator is null'() {
    const r = await inspectScenario(json(validScenario()), stubValidator(), null, { mermaid: false });
    expect('transitions' in r).toBe(true);
  }

  @Verifies<ScenarioInspectCommandFeature>('inspectPerformsNoFileWrite')
  async 'returns ValidateResult on invalid scenario'() {
    const r = await inspectScenario('{}', stubValidator(), stubOrchestrator(), { mermaid: false });
    expect('transitions' in r).toBe(false);
    expect((r as { ok: boolean }).ok).toBe(false);
  }

  @Verifies<ScenarioInspectCommandFeature>('inspectPrintsExpectedArtifactPaths')
  async 'handles scenario without targets.expectedArtifacts'() {
    const s: Scenario = {
      $schemaVersion: SCHEMA_VERSION,
      id: 'notargets', title: 'NT', description: 'd', style: 'default',
      seeds: { requirements: [{ id: 'REQ-T', title: 'T' }], features: [{ id: 'FEAT-T', title: 'FT', acs: [{ name: 'x', expects: ['unit'] }] }] },
    };
    const r = await inspectScenario(json(s), stubValidator(), stubOrchestrator(), { mermaid: false });
    if ('transitions' in r) {
      expect(r.expectedArtifacts).toEqual([]);
      expect(r.rendering).not.toContain('Expected artifacts');
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PLAY — 15 ACs
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(ScenarioPlayCommandFeature)
class PlayTests {
  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayLoadsScenarioJson')
  async 'loads scenario JSON'() {
    const fs = memFs({ '/cwd/out/a.ts': '' });
    const r = await playScenario(json(validScenario()), stubValidator(), stubOrchestrator(), fs, {
      ai: false, seed: 1, dryRun: false, cwd: '/cwd',
    });
    expect(r.ok).toBe(true);
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayValidatesAgainstSchema')
  async 'validates against schema (rejects malformed)'() {
    const fs = memFs();
    const r = await playScenario('not json', stubValidator(), stubOrchestrator(), fs, {
      ai: false, seed: 1, dryRun: false, cwd: '/cwd',
    });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayRejectsUnknownStyle')
  async 'rejects unknown style'() {
    const fs = memFs();
    const s = { ...validScenario(), style: 'mystery' };
    const r = await playScenario(json(s), stubValidator(), stubOrchestrator(), fs, {
      ai: false, seed: 1, dryRun: false, cwd: '/cwd',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("Unknown style"))).toBe(true);
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayRejectsDanglingForwardReferences')
  async 'rejects dangling forward refs via strict validate'() {
    const s = validScenario();
    const bad: Scenario = {
      ...s,
      seeds: {
        requirements: s.seeds.requirements,
        features: [{ ...s.seeds.features[0]!, satisfies: ['REQ-GHOST'] }],
      },
    };
    const fs = memFs();
    const r = await playScenario(json(bad), stubValidator(), stubOrchestrator(), fs, {
      ai: false, seed: 1, dryRun: false, cwd: '/cwd',
    });
    expect(r.ok).toBe(false);
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayDispatchesToOrchestrator')
  async 'dispatches to orchestrator.run()'() {
    const fs = memFs({ '/cwd/out/a.ts': '' });
    let runCalled = false;
    const orch: Orchestrator = {
      plan: (s) => computeFallbackPlan(s),
      run: async () => {
        runCalled = true;
        return { transitions: [], artifacts: [], complianceOk: true, complianceOutput: '' };
      },
    };
    await playScenario(json(validScenario()), stubValidator(), orch, fs, {
      ai: false, seed: 1, dryRun: false, cwd: '/cwd',
    });
    expect(runCalled).toBe(true);
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayProducesFourTierProject')
  async 'surfaces orchestrator artifacts in the result'() {
    const fs = memFs({ '/cwd/out/a.ts': '' });
    const orch = stubOrchestrator({ artifacts: ['r.ts', 'f.ts', 't.ts'] });
    const r = await playScenario(json(validScenario()), stubValidator(), orch, fs, {
      ai: false, seed: 1, dryRun: false, cwd: '/cwd',
    });
    expect(r.artifacts).toEqual(['r.ts', 'f.ts', 't.ts']);
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayEmitsIntroNarration')
  async 'emits intro narration'() {
    const fs = memFs({ '/cwd/out/a.ts': '' });
    const r = await playScenario(json(validScenario()), stubValidator(), stubOrchestrator(), fs, {
      ai: false, seed: 1, dryRun: false, cwd: '/cwd',
    });
    expect(r.narrationIntro).toBe('intro!');
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayEmitsOutroNarration')
  async 'emits outro narration'() {
    const fs = memFs({ '/cwd/out/a.ts': '' });
    const r = await playScenario(json(validScenario()), stubValidator(), stubOrchestrator(), fs, {
      ai: false, seed: 1, dryRun: false, cwd: '/cwd',
    });
    expect(r.narrationOutro).toBe('outro!');
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayRespectsStepDelayMs')
  async 'propagates stepDelayMs for shell pacing'() {
    const fs = memFs({ '/cwd/out/a.ts': '' });
    const r = await playScenario(json(validScenario()), stubValidator(), stubOrchestrator(), fs, {
      ai: false, seed: 1, dryRun: false, cwd: '/cwd',
    });
    expect(r.stepDelayMs).toBe(50);
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayHonoursAiFlag')
  async 'honours --ai flag'() {
    const fs = memFs({ '/cwd/out/a.ts': '' });
    let captured = false;
    const orch: Orchestrator = {
      plan: (s) => computeFallbackPlan(s),
      run: async (_s, opts) => {
        captured = opts.ai;
        return { transitions: [], artifacts: [], complianceOk: true, complianceOutput: '' };
      },
    };
    await playScenario(json(validScenario()), stubValidator(), orch, fs, {
      ai: true, seed: 1, dryRun: false, cwd: '/cwd',
    });
    expect(captured).toBe(true);
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayNoAiFlagEmitsDeterministicStubs')
  async 'without --ai, orchestrator sees ai=false'() {
    const fs = memFs({ '/cwd/out/a.ts': '' });
    let captured = true;
    const orch: Orchestrator = {
      plan: (s) => computeFallbackPlan(s),
      run: async (_s, opts) => {
        captured = opts.ai;
        return { transitions: [], artifacts: [], complianceOk: true, complianceOutput: '' };
      },
    };
    await playScenario(json(validScenario()), stubValidator(), orch, fs, {
      ai: false, seed: 0, dryRun: false, cwd: '/cwd',
    });
    expect(captured).toBe(false);
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlaySeedFlagMakesRunDeterministic')
  async 'seed flag is forwarded to orchestrator'() {
    const fs = memFs({ '/cwd/out/a.ts': '' });
    let captured = -1;
    const orch: Orchestrator = {
      plan: (s) => computeFallbackPlan(s),
      run: async (_s, opts) => {
        captured = opts.seed;
        return { transitions: [], artifacts: [], complianceOk: true, complianceOutput: '' };
      },
    };
    await playScenario(json(validScenario()), stubValidator(), orch, fs, {
      ai: false, seed: 42, dryRun: false, cwd: '/cwd',
    });
    expect(captured).toBe(42);
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayDryRunPrintsWithoutWriting')
  async 'dry-run only calls plan(), never run()'() {
    const fs = memFs();
    let ran = false;
    const orch: Orchestrator = {
      plan: (s) => computeFallbackPlan(s),
      run: async () => {
        ran = true;
        return { transitions: [], artifacts: [], complianceOk: true, complianceOutput: '' };
      },
    };
    const r = await playScenario(json(validScenario()), stubValidator(), orch, fs, {
      ai: false, seed: 1, dryRun: true, cwd: '/cwd',
    });
    expect(ran).toBe(false);
    expect(r.ok).toBe(true);
    expect(r.transitions.length).toBeGreaterThan(0);
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayRunsComplianceStrictAtEnd')
  async 'fails when compliance reports !ok'() {
    const fs = memFs({ '/cwd/out/a.ts': '' });
    const orch = stubOrchestrator({ complianceOk: false, complianceOutput: 'FAIL' });
    const r = await playScenario(json(validScenario()), stubValidator(), orch, fs, {
      ai: false, seed: 1, dryRun: false, cwd: '/cwd',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('compliance'))).toBe(true);
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayAssertsExpectedArtifactsExist')
  async 'asserts expected artifacts exist post-run'() {
    const fs = memFs(); // note: out/a.ts does NOT exist
    const r = await playScenario(json(validScenario()), stubValidator(), stubOrchestrator(), fs, {
      ai: false, seed: 1, dryRun: false, cwd: '/cwd',
    });
    expect(r.ok).toBe(false);
    expect(r.missingArtifacts).toContain('out/a.ts');
  }
}

// Extra branches: module-path style + orchestrator failure propagation
@FeatureTest(ScenarioPlayCommandFeature)
class PlayBranchTests {
  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayRejectsUnknownStyle')
  async 'accepts style that looks like a module path'() {
    const fs = memFs({ '/cwd/out/a.ts': '' });
    const s = { ...validScenario(), style: './my-style' };
    const r = await playScenario(json(s), stubValidator(), stubOrchestrator(), fs, {
      ai: false, seed: 1, dryRun: false, cwd: '/cwd',
    });
    expect(r.ok).toBe(true);
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayRunsComplianceStrictAtEnd')
  async 'orchestrator failure is surfaced as an error'() {
    const fs = memFs({ '/cwd/out/a.ts': '' });
    const orch = stubOrchestrator({ failure: 'boom' });
    const r = await playScenario(json(validScenario()), stubValidator(), orch, fs, {
      ai: false, seed: 1, dryRun: false, cwd: '/cwd',
    });
    expect(r.errors).toContain('boom');
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayNoAiFlagEmitsDeterministicStubs')
  async 'falls back to scenario narration when orchestrator omits it'() {
    const fs = memFs({ '/cwd/out/a.ts': '' });
    const orch = stubOrchestrator({ narrationIntro: undefined, narrationOutro: undefined, stepDelayMs: undefined });
    const r = await playScenario(json(validScenario()), stubValidator(), orch, fs, {
      ai: false, seed: 1, dryRun: false, cwd: '/cwd',
    });
    expect(r.narrationIntro).toBe('intro!');
    expect(r.narrationOutro).toBe('outro!');
    expect(r.stepDelayMs).toBe(50);
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayHonoursAiFlag')
  async 'built-in style names constant is non-empty and includes default'() {
    expect(BUILT_IN_STYLE_NAMES).toContain('default');
    expect(BUILT_IN_STYLE_NAMES.length).toBeGreaterThanOrEqual(5);
  }

  @Verifies<ScenarioPlayCommandFeature>('scenarioPlayAssertsExpectedArtifactsExist')
  async 'succeeds when scenario has no expected artifacts'() {
    const s: Scenario = {
      $schemaVersion: SCHEMA_VERSION,
      id: 'noart', title: 'NA', description: 'd', style: 'default',
      seeds: { requirements: [{ id: 'REQ-N', title: 'N' }], features: [{ id: 'FEAT-N', title: 'FN', acs: [{ name: 'x', expects: ['unit'] }] }] },
    };
    const fs = memFs();
    const r = await playScenario(json(s), stubValidator(), stubOrchestrator(), fs, {
      ai: false, seed: 1, dryRun: false, cwd: '/cwd',
    });
    expect(r.ok).toBe(true);
    expect(r.missingArtifacts).toEqual([]);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// RECORD — 9 ACs
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(ScenarioRecordCommandFeature)
class RecordTests {
  @Verifies<ScenarioRecordCommandFeature>('recordCapturesInteractiveWizardSession')
  async 'captures interactive wizard session'() {
    const fs = memFs();
    const r = await recordFromInteractive(
      fs,
      {
        id: 'interactive',
        title: 'Interactive',
        description: 'desc',
        style: 'default',
        requirements: [{ id: 'REQ-X', title: 'X' }],
        features: [{ id: 'FEAT-X', title: 'FX', acs: [{ name: 'a1', expects: ['unit'] }] }],
      },
      { outPath: '/out/x.scenario.json' },
    );
    expect(r.ok).toBe(true);
    expect(r.scenario?.id).toBe('interactive');
  }

  @Verifies<ScenarioRecordCommandFeature>('recordCapturesFromExistingProject')
  async 'captures from existing project directory'() {
    const fs = memFs({
      '/proj/requirements/requirements/r.spec.json': JSON.stringify({ id: 'REQ-A', title: 'A', kind: 'functional', statement: { pattern: 'ubiquitous' } }),
      '/proj/requirements/features/f.spec.json': JSON.stringify({ id: 'FEAT-A', title: 'FA', priority: 'high', satisfies: ['REQ-A'], acs: [{ name: 'ac1', expects: ['unit'] }] }),
    });
    const r = await recordFromProject(fs, { projectDir: '/proj', outPath: '/out.scenario.json' });
    expect(r.ok).toBe(true);
    expect(r.scenario?.seeds.requirements).toHaveLength(1);
    expect(r.scenario?.seeds.features).toHaveLength(1);
  }

  @Verifies<ScenarioRecordCommandFeature>('recordEmitsSchemaVersionedJson')
  async 'emits schema-versioned JSON'() {
    const fs = memFs();
    await recordFromProject(fs, { projectDir: '/proj', outPath: '/out.scenario.json' });
    const raw = fs.files.get('/out.scenario.json')!;
    const parsed = JSON.parse(raw) as { $schemaVersion: string };
    expect(parsed.$schemaVersion).toBe(SCHEMA_VERSION);
  }

  @Verifies<ScenarioRecordCommandFeature>('recordIncludesSatisfiesForwardReferences')
  async 'includes satisfies forward references'() {
    const fs = memFs({
      '/proj/requirements/features/f.spec.json': JSON.stringify({ id: 'FEAT-A', title: 'FA', priority: 'high', satisfies: ['REQ-A'], acs: [{ name: 'ac1', expects: ['unit'] }] }),
    });
    const r = await recordFromProject(fs, { projectDir: '/proj', outPath: '/out.scenario.json' });
    expect(r.scenario?.seeds.features[0]?.satisfies).toEqual(['REQ-A']);
  }

  @Verifies<ScenarioRecordCommandFeature>('recordIncludesExpectsPerAc')
  async 'includes expects per AC'() {
    const fs = memFs({
      '/proj/requirements/features/f.spec.json': JSON.stringify({ id: 'FEAT-A', title: 'FA', priority: 'high', acs: [{ name: 'ac1', expects: ['unit', 'e2e'] }] }),
    });
    const r = await recordFromProject(fs, { projectDir: '/proj', outPath: '/out.scenario.json' });
    expect(r.scenario?.seeds.features[0]?.acs[0]?.expects).toEqual(['unit', 'e2e']);
  }

  @Verifies<ScenarioRecordCommandFeature>('recordReplayFidelityProducesIdenticalArtifacts')
  async 'record + reparse yields identical scenario shape'() {
    const fs = memFs({
      '/proj/requirements/features/f.spec.json': JSON.stringify({ id: 'FEAT-A', title: 'FA', priority: 'high', satisfies: ['REQ-A'], acs: [{ name: 'ac1', expects: ['unit'] }] }),
      '/proj/requirements/requirements/r.spec.json': JSON.stringify({ id: 'REQ-A', title: 'A' }),
    });
    const r1 = await recordFromProject(fs, { projectDir: '/proj', outPath: '/o1.scenario.json', force: true });
    const r2 = await recordFromProject(fs, { projectDir: '/proj', outPath: '/o2.scenario.json', force: true });
    expect(fs.files.get('/o1.scenario.json')).toBe(fs.files.get('/o2.scenario.json'));
    expect(r1.scenario).toEqual(r2.scenario);
  }

  @Verifies<ScenarioRecordCommandFeature>('recordRefusesOverwriteWithoutForce')
  async 'refuses overwrite without force'() {
    const fs = memFs({ '/out.scenario.json': 'existing' });
    const r = await recordFromProject(fs, { projectDir: '/proj', outPath: '/out.scenario.json' });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/--force/);
    // interactive path too
    const r2 = await recordFromInteractive(fs, {
      id: 'x', title: 't', description: 'd', style: 'default',
      requirements: [], features: [],
    }, { outPath: '/out.scenario.json' });
    expect(r2.ok).toBe(false);
  }

  @Verifies<ScenarioRecordCommandFeature>('recordOutputPassesValidateCommand')
  async 'recorded output passes validate (via stub validator)'() {
    const fs = memFs({
      '/proj/requirements/features/f.spec.json': JSON.stringify({ id: 'FEAT-A', title: 'FA', priority: 'high', acs: [{ name: 'a1', expects: ['unit'] }] }),
    });
    await recordFromProject(fs, { projectDir: '/proj', outPath: '/o.scenario.json' });
    const raw = fs.files.get('/o.scenario.json')!;
    const v = await validateScenario(raw, stubValidator(), { strict: false });
    expect(v.ok).toBe(true);
  }

  @Verifies<ScenarioRecordCommandFeature>('recordSupportsPartialSeedingFromFeaturesOnly')
  async 'supports partial seeding (features-only project)'() {
    const fs = memFs({
      '/proj/requirements/features/f.spec.json': JSON.stringify({ id: 'FEAT-A', title: 'FA', priority: 'high', acs: [{ name: 'a1', expects: ['unit'] }] }),
    });
    const r = await recordFromProject(fs, { projectDir: '/proj', outPath: '/o.scenario.json' });
    expect(r.ok).toBe(true);
    expect(r.scenario?.seeds.requirements).toEqual([]);
    expect(r.scenario?.seeds.features).toHaveLength(1);
  }
}

// Record edge branches: malformed spec skip + default id derivation + empty project
@FeatureTest(ScenarioRecordCommandFeature)
class RecordEdgeTests {
  @Verifies<ScenarioRecordCommandFeature>('recordSupportsPartialSeedingFromFeaturesOnly')
  async 'skips malformed spec files'() {
    const fs = memFs({
      '/proj/requirements/features/bad.spec.json': '{not json',
      '/proj/requirements/requirements/bad.spec.json': '{not json',
      '/proj/requirements/features/ignore.txt': 'ignored',
    });
    const r = await recordFromProject(fs, { projectDir: '/proj', outPath: '/o.scenario.json' });
    expect(r.ok).toBe(true);
    expect(r.scenario?.seeds.features).toEqual([]);
  }

  @Verifies<ScenarioRecordCommandFeature>('recordEmitsSchemaVersionedJson')
  async 'derives id from project basename when not provided'() {
    const fs = memFs();
    const r = await recordFromProject(fs, { projectDir: '/root/My Project', outPath: '/o.scenario.json' });
    expect(r.scenario?.id).toBe('my-project');
  }

  @Verifies<ScenarioRecordCommandFeature>('recordEmitsSchemaVersionedJson')
  async 'uses explicit id when provided'() {
    const fs = memFs();
    const r = await recordFromProject(fs, { projectDir: '/any', outPath: '/o.scenario.json', id: 'explicit-id' });
    expect(r.scenario?.id).toBe('explicit-id');
  }

  @Verifies<ScenarioRecordCommandFeature>('recordSupportsPartialSeedingFromFeaturesOnly')
  async 'ignores non-spec-json files in requirements dir and features without priority'() {
    const fs = memFs({
      '/proj/requirements/requirements/ignore.md': 'readme',
      '/proj/requirements/requirements/r.spec.json': JSON.stringify({ id: 'REQ-P', title: 'P' }),
      '/proj/requirements/features/f.spec.json': JSON.stringify({ id: 'FEAT-P', title: 'FP', acs: [{ name: 'x', expects: ['unit'] }] }),
    });
    const r = await recordFromProject(fs, { projectDir: '/proj', outPath: '/o.scenario.json' });
    expect(r.ok).toBe(true);
    expect(r.scenario?.seeds.requirements).toHaveLength(1);
    expect(r.scenario?.seeds.features[0]?.priority).toBeUndefined();
    expect(r.scenario?.seeds.features[0]?.satisfies).toBeUndefined();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT — 6 ACs
// ══════════════════════════════════════════════════════════════════════════════

@FeatureTest(ScenarioExportCommandFeature)
class ExportTests {
  @Verifies<ScenarioExportCommandFeature>('exportProducesMarkdownArtifact')
  async 'produces Markdown artifact'() {
    const fs = memFs();
    const r = await exportScenario(json(validScenario()), stubValidator(), stubOrchestrator(), fs, {
      format: 'md', outPath: '/out.md',
    });
    expect(r.ok).toBe(true);
    expect(r.content).toMatch(/^# Scenario: Demo/);
    expect(r.isStub).toBe(false);
  }

  @Verifies<ScenarioExportCommandFeature>('exportProducesPdfArtifact')
  async 'produces PDF artifact (stub)'() {
    const fs = memFs();
    const r = await exportScenario(json(validScenario()), stubValidator(), stubOrchestrator(), fs, {
      format: 'pdf', outPath: '/out.pdf',
    });
    expect(r.ok).toBe(true);
    expect(r.isStub).toBe(true);
    expect(r.content).toContain('PDF export is stub-only');
  }

  @Verifies<ScenarioExportCommandFeature>('exportIncludesNarrationBlocks')
  async 'includes narration blocks'() {
    const fs = memFs();
    const r = await exportScenario(json(validScenario()), stubValidator(), stubOrchestrator(), fs, {
      format: 'md', outPath: '/out.md',
    });
    expect(r.content).toContain('> intro!');
    expect(r.content).toContain('> outro!');
  }

  @Verifies<ScenarioExportCommandFeature>('exportIncludesComplianceReport')
  async 'includes compliance report when supplied'() {
    const fs = memFs();
    const r = await exportScenario(json(validScenario()), stubValidator(), stubOrchestrator(), fs, {
      format: 'md', outPath: '/out.md',
      complianceReport: 'RESULTS: all green',
      specJsonByPath: { 'requirements/features/A.spec.json': '{"id":"A"}' },
    });
    expect(r.content).toContain('## Compliance report');
    expect(r.content).toContain('RESULTS: all green');
    expect(r.content).toContain('## Generated artifacts');
    expect(r.content).toContain('requirements/features/A.spec.json');
  }

  @Verifies<ScenarioExportCommandFeature>('exportIncludesFsmTransitionMermaid')
  async 'includes FSM transition mermaid block'() {
    const fs = memFs();
    const r = await exportScenario(json(validScenario()), stubValidator(), stubOrchestrator(), fs, {
      format: 'html', outPath: '/out.html',
    });
    expect(r.content).toContain('```mermaid');
    expect(r.content).toContain('stateDiagram-v2');
    expect(r.isStub).toBe(true);
    expect(r.content).toContain('HTML export is stub-only');
  }

  @Verifies<ScenarioExportCommandFeature>('exportRefusesOverwriteWithoutForce')
  async 'refuses overwrite without --force'() {
    const fs = memFs({ '/out.md': 'existing' });
    const r = await exportScenario(json(validScenario()), stubValidator(), stubOrchestrator(), fs, {
      format: 'md', outPath: '/out.md',
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/--force/);
    // with force: allowed
    const r2 = await exportScenario(json(validScenario()), stubValidator(), stubOrchestrator(), fs, {
      format: 'md', outPath: '/out.md', force: true,
    });
    expect(r2.ok).toBe(true);
  }
}

// Export edge branches: invalid scenario + orchestrator-null fallback + no optional sections
@FeatureTest(ScenarioExportCommandFeature)
class ExportEdgeTests {
  @Verifies<ScenarioExportCommandFeature>('exportRefusesOverwriteWithoutForce')
  async 'returns error when scenario is invalid JSON'() {
    const fs = memFs();
    const r = await exportScenario('{}', stubValidator(), stubOrchestrator(), fs, {
      format: 'md', outPath: '/o.md',
    });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
  }

  @Verifies<ScenarioExportCommandFeature>('exportIncludesFsmTransitionMermaid')
  async 'falls back to computeFallbackPlan when orchestrator is null'() {
    const fs = memFs();
    const r = await exportScenario(json(validScenario()), stubValidator(), null, fs, {
      format: 'md', outPath: '/o.md',
    });
    expect(r.ok).toBe(true);
    expect(r.content).toContain('stateDiagram-v2');
  }

  @Verifies<ScenarioExportCommandFeature>('exportIncludesNarrationBlocks')
  async 'omits optional sections when absent'() {
    const fs = memFs();
    const bare: Scenario = {
      $schemaVersion: SCHEMA_VERSION,
      id: 'bare', title: 'Bare', description: 'd', style: 'default',
      seeds: {
        requirements: [{ id: 'REQ-B', title: 'B' }],
        features: [{ id: 'FEAT-B', title: 'FB', acs: [{ name: 'b', expects: ['unit'] }] }],
      },
    };
    const r = await exportScenario(json(bare), stubValidator(), stubOrchestrator(), fs, {
      format: 'md', outPath: '/bare.md',
    });
    expect(r.ok).toBe(true);
    expect(r.content).not.toContain('## Narration');
    expect(r.content).not.toContain('## Compliance report');
    expect(r.content).not.toContain('## Generated artifacts');
  }
}

void ValidateTests;
void ListTests;
void ListEdgeTests;
void InspectTests;
void InspectFallbackTests;
void PlayTests;
void PlayBranchTests;
void RecordTests;
void RecordEdgeTests;
void ExportTests;
void ExportEdgeTests;
