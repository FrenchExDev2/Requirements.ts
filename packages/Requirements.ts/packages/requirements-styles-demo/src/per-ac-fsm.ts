/**
 * PerAcFsm — one instance per AC.
 *
 * Pure logic; emits 'AcImplemented(acName)' on the parent PerFeatureFsm via
 * a listener callback registered by the orchestrator when the AC enters
 * TestPassing.
 *
 * Design: `docs/scenarii-player-design.md` — FSM C.
 */

export type PerAcState =
  | 'Declared'
  | 'Scaffolded'
  | 'ImplementedByAI'
  | 'TestPassing'
  | 'Reviewed'
  | 'Verified'
  | 'Failed';

export type PerAcEvent =
  | { readonly kind: 'ScaffoldEmitted' }
  | { readonly kind: 'AiImplement'; readonly prompt: string }
  | { readonly kind: 'ImplementStub' }
  | { readonly kind: 'TestRunPass' }
  | { readonly kind: 'TestRunFail'; readonly retry: boolean }
  | { readonly kind: 'Review'; readonly reviewer: string; readonly approved: boolean }
  | { readonly kind: 'Verified' }
  | { readonly kind: 'Fail'; readonly reason: string };

export interface PerAcTransition {
  readonly from: PerAcState;
  readonly to: PerAcState;
  readonly event: PerAcEvent;
}

export type PerAcListener = (t: PerAcTransition) => void;

export class PerAcFsm {
  private state: PerAcState = 'Declared';
  private readonly log: PerAcTransition[] = [];
  private readonly listeners: PerAcListener[] = [];
  private attempts = 0;

  constructor(
    public readonly featureId: string,
    public readonly acName: string,
  ) {}

  currentState(): PerAcState {
    return this.state;
  }

  attemptCount(): number {
    return this.attempts;
  }

  replay(): readonly PerAcTransition[] {
    return this.log.slice();
  }

  onTransition(listener: PerAcListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  dispatch(event: PerAcEvent): PerAcState {
    const next = this.resolveNext(event);
    if (next === undefined) {
      throw new Error(
        `PerAcFsm(${this.featureId}.${this.acName}): invalid transition ${this.state} --${event.kind}-->`,
      );
    }
    const from = this.state;
    this.state = next;
    const t: PerAcTransition = { from, to: next, event };
    this.log.push(t);
    for (const l of this.listeners) l(t);
    return next;
  }

  private resolveNext(event: PerAcEvent): PerAcState | undefined {
    if (event.kind === 'Fail') {
      if (this.state === 'Verified' || this.state === 'Failed') return undefined;
      return 'Failed';
    }
    if (event.kind === 'ScaffoldEmitted' && this.state === 'Declared') return 'Scaffolded';
    if (event.kind === 'AiImplement' && this.state === 'Scaffolded') {
      this.attempts += 1;
      return 'ImplementedByAI';
    }
    if (event.kind === 'ImplementStub' && this.state === 'Scaffolded') {
      this.attempts += 1;
      return 'ImplementedByAI';
    }
    if (event.kind === 'TestRunPass' && this.state === 'ImplementedByAI') return 'TestPassing';
    if (event.kind === 'TestRunFail' && this.state === 'ImplementedByAI') {
      if (event.retry) {
        this.attempts += 1;
        return 'ImplementedByAI';
      }
      return 'Failed';
    }
    if (event.kind === 'Review' && this.state === 'TestPassing') {
      return event.approved ? 'Reviewed' : 'Failed';
    }
    if (event.kind === 'Verified' && this.state === 'Reviewed') return 'Verified';
    return undefined;
  }
}
