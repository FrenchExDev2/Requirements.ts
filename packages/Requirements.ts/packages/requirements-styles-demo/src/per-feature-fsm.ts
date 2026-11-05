/**
 * PerFeatureFsm — one instance per FeatureSeed.
 *
 * Pure logic; tracks acImplementedCount against a declared total, and fires
 * AllAcsImplemented when the two are equal.
 *
 * Design: `docs/scenarii-player-design.md` — FSM B.
 */

export type PerFeatureState =
  | 'Empty'
  | 'HasSpec'
  | 'HasScaffold'
  | 'AllAcsImplemented'
  | 'AllTestsPassing'
  | 'Verified'
  | 'Failed';

export type PerFeatureEvent =
  | { readonly kind: 'SpecWritten' }
  | { readonly kind: 'ScaffoldWritten' }
  | { readonly kind: 'AcImplemented'; readonly acName: string }
  | { readonly kind: 'TestsPass' }
  | { readonly kind: 'Verified' }
  | { readonly kind: 'Fail'; readonly reason: string };

export interface PerFeatureTransition {
  readonly from: PerFeatureState;
  readonly to: PerFeatureState;
  readonly event: PerFeatureEvent;
}

export type PerFeatureListener = (t: PerFeatureTransition) => void;

export class PerFeatureFsm {
  private state: PerFeatureState = 'Empty';
  private readonly log: PerFeatureTransition[] = [];
  private readonly listeners: PerFeatureListener[] = [];
  private readonly implementedAcs: Set<string> = new Set();

  constructor(
    public readonly featureId: string,
    public readonly totalAcs: number,
  ) {}

  currentState(): PerFeatureState {
    return this.state;
  }

  implementedCount(): number {
    return this.implementedAcs.size;
  }

  replay(): readonly PerFeatureTransition[] {
    return this.log.slice();
  }

  onTransition(listener: PerFeatureListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  dispatch(event: PerFeatureEvent): PerFeatureState {
    const next = this.resolveNext(event);
    if (next === undefined) {
      throw new Error(
        `PerFeatureFsm(${this.featureId}): invalid transition ${this.state} --${event.kind}-->`,
      );
    }
    const from = this.state;
    this.state = next;
    const t: PerFeatureTransition = { from, to: next, event };
    this.log.push(t);
    for (const l of this.listeners) l(t);
    return next;
  }

  private resolveNext(event: PerFeatureEvent): PerFeatureState | undefined {
    if (event.kind === 'Fail') {
      if (this.state === 'Verified' || this.state === 'Failed') return undefined;
      return 'Failed';
    }
    if (event.kind === 'SpecWritten' && this.state === 'Empty') return 'HasSpec';
    if (event.kind === 'ScaffoldWritten' && this.state === 'HasSpec') return 'HasScaffold';
    if (event.kind === 'AcImplemented' && this.state === 'HasScaffold') {
      this.implementedAcs.add(event.acName);
      // Guard: only move to AllAcsImplemented when count === total.
      if (this.implementedAcs.size === this.totalAcs) {
        return 'AllAcsImplemented';
      }
      return 'HasScaffold';
    }
    if (event.kind === 'TestsPass' && this.state === 'AllAcsImplemented') return 'AllTestsPassing';
    if (event.kind === 'Verified' && this.state === 'AllTestsPassing') return 'Verified';
    return undefined;
  }
}
