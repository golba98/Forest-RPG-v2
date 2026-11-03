export type BlinkPhase = 'open' | 'closing' | 'closed' | 'opening';
const durations = { closing: 40, closed: 60, opening: 60 } as const;

/** Cosmetic clock only: never consumes simulation randomness or action time. */
export class PlayerBlink {
  phase: BlinkPhase = 'open';
  private last: number | undefined;
  private remaining = 0;
  private random = 0;
  constructor(private readonly seed = 0x31fa820d) {
    this.reset();
  }
  private interval(): number {
    let n = this.random;
    n ^= n << 13;
    n ^= n >>> 17;
    n ^= n << 5;
    this.random = n >>> 0;
    return 2800 + (this.random / 0x100000000) * 2400;
  }
  update(timeMs: number, frozen = false): BlinkPhase {
    if (!Number.isFinite(timeMs)) return this.phase;
    if (this.last !== undefined && timeMs < this.last) this.reset();
    let dt = this.last === undefined || frozen ? 0 : timeMs - this.last;
    this.last = timeMs;
    while (dt >= this.remaining) {
      dt -= this.remaining;
      if (this.phase === 'open') this.startBlink();
      else if (this.phase === 'closing') {
        this.phase = 'closed';
        this.remaining = durations.closed;
      } else if (this.phase === 'closed') {
        this.phase = 'opening';
        this.remaining = durations.opening;
      } else {
        this.phase = 'open';
        this.remaining = this.interval();
      }
    }
    this.remaining -= dt;
    return this.phase;
  }
  /** Also used by the local frame inspector's repeatable blink demonstration. */
  startBlink(): void {
    this.phase = 'closing';
    this.remaining = durations.closing;
  }
  get nextChangeMs(): number {
    return this.remaining;
  }
  reset(): void {
    this.phase = 'open';
    this.last = undefined;
    this.random = this.seed >>> 0 || 1;
    this.remaining = this.interval();
  }
}
