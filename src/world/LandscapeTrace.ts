import type { TilePoint, WorldData } from '../types/world';

export interface PlacementDecision {
  readonly consumer: 'woodland' | 'hilltop';
  readonly source: TilePoint;
  readonly at: TilePoint | null;
  readonly outcome: 'accepted' | 'relocated' | 'rejected';
  readonly reasons: readonly string[];
}
/** Opt-in, bounded observational sidecar. Never consumes RNG or enters a save payload. */
export class LandscapeTrace {
  private entries: PlacementDecision[] = [];
  private counts = {
    woodland: { accepted: 0, relocated: 0, rejected: 0 },
    hilltop: { accepted: 0, relocated: 0, rejected: 0 },
  };
  record(decision: PlacementDecision): void {
    this.counts[decision.consumer][decision.outcome]++;
    if (this.entries.filter((e) => e.consumer === decision.consumer).length < 256)
      this.entries.push(decision);
  }
  inspect() {
    return {
      limitPerConsumer: 256,
      counts: structuredClone(this.counts),
      entries: this.entries.slice(),
    };
  }
}
let enabled = false;
const traces = new WeakMap<WorldData, LandscapeTrace>();
export function enableLandscapeDiagnostics(value: boolean): void {
  enabled = value;
}
export function createLandscapeTrace(): LandscapeTrace | undefined {
  return enabled ? new LandscapeTrace() : undefined;
}
export function attachLandscapeTrace(
  world: WorldData,
  trace: LandscapeTrace | undefined,
): WorldData {
  if (trace) traces.set(world, trace);
  return world;
}
export function landscapeTrace(world: WorldData) {
  return traces.get(world)?.inspect() ?? null;
}
