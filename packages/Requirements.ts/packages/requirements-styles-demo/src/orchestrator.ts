/**
 * ScenarioOrchestrator — the conductor of the 3 FSMs.
 *
 * Design: see `docs/scenarii-player-design.md`. Pure logic; all I/O flows
 * through injected ports (FileSystem / Clock / Logger / Prompt / AiAdapter).
 *
 * Determinism: the orchestrator appends every significant event to a
 * replay log. Given the same Scenario + same deterministic AiAdapter stub
 * and same Prompt script, the log and the final FSM states are byte-identical
 * between runs.
 */

import type { Clock, FileSystem, Logger, Prompt } from '@frenchexdev2/requirements-core/ports';
import type { runFeatureWizard as RunFeatureWizardFn } from '@frenchexdev2/requirements-wizards/feature-new-core';
import type { runRequirementWizard as RunRequirementWizardFn } from '@frenchexdev2/requirements-wizards/requirement-core';

import type { Scenario, FeatureSeed, FeatureSeedAc } from './types.js';
import { ProjectLifecycleFsm } from './project-lifecycle-fsm.js';
import { PerFeatureFsm } from './per-feature-fsm.js';
import { PerAcFsm } from './per-ac-fsm.js';
// Canonical AI adapter port lives in `./ai-adapter`. Re-export here to keep
// historical import paths alive for downstream callers; the orchestrator
// itself consumes them via the canonical module to avoid drift.
import type { AiAdapter } from './ai-adapter.js';
export type { AiAdapter, AcContext, AcImplementationResult } from './ai-adapter.js';

// ── Ports aggregation ──────────────────────────────────────────────────────

export interface OrchestratorDeps {
  readonly fs: FileSystem;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly prompt: Prompt;
  readonly aiAdapter: AiAdapter;
  readonly runFeatureWizard: typeof RunFeatureWizardFn;
  readonly runRequirementWizard: typeof RunRequirementWizardFn;
  /** When true, PerAcFsm uses AiImplement; otherwise ImplementStub. */
  readonly ai?: boolean;
}

// ── Event log types ─────────────────────────────────────────────────────────

export type OrchestratorEvent =
  | { readonly kind: 'ProjectLifecycle'; readonly from: string; readonly to: string; readonly event: string }
  | { readonly kind: 'PerFeature'; readonly featureId: string; readonly from: string; readonly to: string; readonly event: string; readonly acName?: string }
  | { readonly kind: 'PerAc'; readonly featureId: string; readonly acName: string; readonly from: string; readonly to: string; readonly event: string }
  | { readonly kind: 'Narration'; readonly message: string }
  | { readonly kind: 'Error'; readonly reason: string };

export interface OrchestratorResult {
  readonly finalState: string;
  readonly published: boolean;
  readonly events: readonly OrchestratorEvent[];
}

export type OrchestratorListener = (e: OrchestratorEvent) => void;
export type Cancel = () => void;

// ── The orchestrator ────────────────────────────────────────────────────────

export class ScenarioOrchestrator {
  private readonly lifecycle: ProjectLifecycleFsm;
  private readonly perFeatures: Map<string, PerFeatureFsm> = new Map();
  private readonly perAcs: Map<string, PerAcFsm> = new Map();
  private readonly log: OrchestratorEvent[] = [];
  private readonly listeners: OrchestratorListener[] = [];

  constructor(
    private readonly deps: OrchestratorDeps,
    private readonly scenario: Scenario,
  ) {
    this.lifecycle = new ProjectLifecycleFsm();
    this.lifecycle.onTransition((t) => {
      this.append({ kind: 'ProjectLifecycle', from: t.from, to: t.to, event: t.event.kind });
    });
  }

  onEvent(listener: OrchestratorListener): Cancel {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  replay(): readonly OrchestratorEvent[] {
    return this.log.slice();
  }

  async run(): Promise<OrchestratorResult> {
    try {
      await this.stepLoad();
      await this.stepGenerateRequirements();
      await this.stepDeriveFeatures();
      await this.stepScaffold();
      await this.stepImplement();
      await this.stepVerify();
      return this.finalize(true);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.append({ kind: 'Error', reason });
      // Repeated runs and failing terminal observers must not dispatch Fail twice.
      const s = this.lifecycle.currentState();
      if (s === 'Failed' || s === 'Published') return this.finalize(false);
      
      this.lifecycle.dispatch({ kind: 'Fail', reason });
      return this.finalize(false);
    }
  }

  // ── Step 1 ──
  private async stepLoad(): Promise<void> {
    if (this.scenario.narration?.intro) {
      this.append({ kind: 'Narration', message: this.scenario.narration.intro });
    }
    this.lifecycle.dispatch({ kind: 'LoadScenario' });
  }

  // ── Step 2 ──
  private async stepGenerateRequirements(): Promise<void> {
    const ctx = this.wizardCtx();
    for (const seed of this.scenario.seeds.requirements) {
      await this.deps.runRequirementWizard(
        ctx,
        // Seeds are partial-by-intent; we pass them through as-is. The wizard
        // in --yes mode validates against the style. Any invalid seed will
        // throw and the error is caught by run() to emit a Fail transition.
        seed as unknown as Parameters<typeof RunRequirementWizardFn>[1],
        { yes: true, template: seed.template },
      );
    }
    this.lifecycle.dispatch({ kind: 'GenerateRequirements' });
  }

  // ── Step 3 ──
  private async stepDeriveFeatures(): Promise<void> {
    const ctx = this.wizardCtx();
    for (const seed of this.scenario.seeds.features) {
      const fsm = new PerFeatureFsm(seed.id, seed.acs.length);
      fsm.onTransition((t) => {
        const base = { kind: 'PerFeature' as const, featureId: seed.id, from: t.from, to: t.to, event: t.event.kind };
        this.append(t.event.kind === 'AcImplemented'
          ? { ...base, acName: t.event.acName }
          : base);
      });
      this.perFeatures.set(seed.id, fsm);

      await this.deps.runFeatureWizard(
        ctx,
        seed as unknown as Parameters<typeof RunFeatureWizardFn>[1],
        { yes: true },
      );
      fsm.dispatch({ kind: 'SpecWritten' });
    }
    this.lifecycle.dispatch({ kind: 'DeriveFeatures' });
  }

  // ── Step 4 ──
  private async stepScaffold(): Promise<void> {
    for (const seed of this.scenario.seeds.features) {
      // Derivation registers every feature before scaffolding begins.
      const ff = this.perFeatures.get(seed.id)!;
      ff.dispatch({ kind: 'ScaffoldWritten' });
      for (const ac of seed.acs) {
        const key = this.acKey(seed.id, ac.name);
        const ac_fsm = new PerAcFsm(seed.id, ac.name);
        ac_fsm.onTransition((t) => {
          this.append({
            kind: 'PerAc', featureId: seed.id, acName: ac.name,
            from: t.from, to: t.to, event: t.event.kind,
          });
        });
        this.perAcs.set(key, ac_fsm);
        ac_fsm.dispatch({ kind: 'ScaffoldEmitted' });
      }
    }
    this.lifecycle.dispatch({ kind: 'Scaffold' });
  }

  // ── Step 5 ──
  private async stepImplement(): Promise<void> {
    this.lifecycle.dispatch({ kind: 'Implement' });
    for (const seed of this.scenario.seeds.features) {
      for (const ac of seed.acs) {
        await this.implementOneAc(seed, ac);
      }
    }
    this.lifecycle.dispatch({ kind: 'AllAcsDone' });
  }

  private async implementOneAc(seed: FeatureSeed, ac: FeatureSeedAc): Promise<void> {
    // Scaffolding registers every AC before implementation begins.
    const acFsm = this.perAcs.get(this.acKey(seed.id, ac.name))!;
    if (this.deps.ai) {
      const promptKey = `${seed.id}.${ac.name}`;
      const promptBody = this.scenario.targets?.aiPrompts?.[promptKey] ?? `Implement ${promptKey}`;
      // Scaffolded feature/test code is not yet threaded through to this
      // seam — placeholders keep the contract honest (no lies about cache
      // keys) until the generator wires real sources through.
      await this.deps.aiAdapter.implementAc(promptBody, {
        featureId: seed.id,
        acName: ac.name,
        expectedLevels: ac.expects ?? [],
        featureCode: '',
      });
      acFsm.dispatch({ kind: 'AiImplement', prompt: promptBody });
    } else {
      acFsm.dispatch({ kind: 'ImplementStub' });
    }
    acFsm.dispatch({ kind: 'TestRunPass' });
    // Propagate to the parent PerFeatureFsm (cross-FSM coupling = events only).
    const featureFsm = this.perFeatures.get(seed.id)!;
    featureFsm.dispatch({ kind: 'AcImplemented', acName: ac.name });
  }

  // ── Step 6 ──
  private async stepVerify(): Promise<void> {
    this.lifecycle.dispatch({ kind: 'Verify' });
    if (this.scenario.narration?.outro) {
      this.append({ kind: 'Narration', message: this.scenario.narration.outro });
    }
  }

  // ── Helpers ──
  private finalize(published: boolean): OrchestratorResult {
    return {
      finalState: this.lifecycle.currentState(),
      published,
      events: this.log.slice(),
    };
  }

  private wizardCtx() {
    return {
      prompt: this.deps.prompt,
      style: { name: this.scenario.style } as unknown as Parameters<typeof RunFeatureWizardFn>[0]['style'],
      existingFeatureIds: [] as readonly string[] as unknown as Parameters<typeof RunFeatureWizardFn>[0]['existingFeatureIds'],
      existingRequirementIds: [] as readonly string[] as unknown as Parameters<typeof RunFeatureWizardFn>[0]['existingRequirementIds'],
    };
  }

  private acKey(featureId: string, acName: string): string {
    return `${featureId}::${acName}`;
  }

  private append(e: OrchestratorEvent): void {
    this.log.push(e);
    for (const l of this.listeners) l(e);
  }
}
