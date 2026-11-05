/**
 * ProjectLifecycleFsm — top-level scenario pipeline state machine.
 *
 * Pure logic, zero I/O. The orchestrator is responsible for driving side
 * effects; this class only validates transitions and records them.
 *
 * Design: see `docs/scenarii-player-design.md` — FSM A.
 */

export type ProjectLifecycleState =
  | 'Empty'
  | 'Seeded'
  | 'RequirementsDrafted'
  | 'FeaturesDerived'
  | 'ScaffoldingReady'
  | 'Implementing'
  | 'Verifying'
  | 'Published'
  | 'Failed';

export type ProjectLifecycleEvent =
  | { readonly kind: 'LoadScenario' }
  | { readonly kind: 'GenerateRequirements' }
  | { readonly kind: 'DeriveFeatures' }
  | { readonly kind: 'Scaffold' }
  | { readonly kind: 'Implement' }
  | { readonly kind: 'AllAcsDone' }
  | { readonly kind: 'Verify' }
  | { readonly kind: 'Fail'; readonly reason: string };

export interface ProjectLifecycleTransition {
  readonly from: ProjectLifecycleState;
  readonly to: ProjectLifecycleState;
  readonly event: ProjectLifecycleEvent;
}

export type ProjectLifecycleListener = (t: ProjectLifecycleTransition) => void;

/** Declarative transition table — mirrors the mermaid diagram in the design doc. */
export const PROJECT_LIFECYCLE_TRANSITIONS: readonly {
  readonly from: ProjectLifecycleState;
  readonly to: ProjectLifecycleState;
  readonly on: ProjectLifecycleEvent['kind'];
}[] = [
  { from: 'Empty',               to: 'Seeded',               on: 'LoadScenario' },
  { from: 'Seeded',               to: 'RequirementsDrafted',  on: 'GenerateRequirements' },
  { from: 'RequirementsDrafted',  to: 'FeaturesDerived',       on: 'DeriveFeatures' },
  { from: 'FeaturesDerived',      to: 'ScaffoldingReady',      on: 'Scaffold' },
  { from: 'ScaffoldingReady',     to: 'Implementing',          on: 'Implement' },
  { from: 'Implementing',         to: 'Verifying',             on: 'AllAcsDone' },
  { from: 'Verifying',            to: 'Published',             on: 'Verify' },
  // Fail edges from every non-terminal state
  { from: 'Empty',               to: 'Failed',                on: 'Fail' },
  { from: 'Seeded',               to: 'Failed',                on: 'Fail' },
  { from: 'RequirementsDrafted',  to: 'Failed',                on: 'Fail' },
  { from: 'FeaturesDerived',      to: 'Failed',                on: 'Fail' },
  { from: 'ScaffoldingReady',     to: 'Failed',                on: 'Fail' },
  { from: 'Implementing',         to: 'Failed',                on: 'Fail' },
  { from: 'Verifying',            to: 'Failed',                on: 'Fail' },
] as const;

export class ProjectLifecycleFsm {
  private state: ProjectLifecycleState = 'Empty';
  private readonly log: ProjectLifecycleTransition[] = [];
  private readonly listeners: ProjectLifecycleListener[] = [];

  currentState(): ProjectLifecycleState {
    return this.state;
  }

  replay(): readonly ProjectLifecycleTransition[] {
    return this.log.slice();
  }

  onTransition(listener: ProjectLifecycleListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  dispatch(event: ProjectLifecycleEvent): ProjectLifecycleState {
    const rule = PROJECT_LIFECYCLE_TRANSITIONS.find(
      (r) => r.from === this.state && r.on === event.kind,
    );
    if (!rule) {
      throw new Error(
        `ProjectLifecycleFsm: invalid transition ${this.state} --${event.kind}-->`,
      );
    }
    const from = this.state;
    this.state = rule.to;
    const t: ProjectLifecycleTransition = { from, to: rule.to, event };
    this.log.push(t);
    for (const l of this.listeners) l(t);
    return this.state;
  }
}
