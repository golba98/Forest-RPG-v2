/** Replaced by Vite. Ordinary builds discard the profiling entry point and hooks. */
export const PERF_BUILD = typeof import.meta.env !== 'undefined' && import.meta.env.VITE_PERF_PROFILE === '1';

export class Ring<T> {
  private values: (T | undefined)[];
  private first = 0;
  private size = 0;
  dropped = 0;
  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Invalid ring capacity');
    this.values = new Array<T | undefined>(capacity);
  }
  push(value: T): void {
    if (this.size === this.capacity) {
      this.values[this.first] = value;
      this.first = (this.first + 1) % this.capacity;
      this.dropped++;
    } else {
      this.values[(this.first + this.size++) % this.capacity] = value;
    }
  }
  drain(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.size; i++) {
      const index = (this.first + i) % this.capacity;
      result.push(this.values[index] as T);
      this.values[index] = undefined;
    }
    this.first = this.size = 0;
    return result;
  }
  clear(): void {
    this.drain();
    this.dropped = 0;
  }
  get length(): number {
    return this.size;
  }
}

export interface ProfileFrame {
  readonly t: number;
  readonly dt: number;
  readonly cpu: number;
  /** Repeated [stage ID, inclusive milliseconds, exclusive milliseconds, calls]. */
  readonly stages: number[];
  /** Repeated [counter ID, count]. */
  readonly counts: number[];
}
export interface ProfileEvent {
  readonly name: string;
  readonly t: number;
  readonly duration: number;
  readonly detail?: unknown;
}
export class PerformanceCollector {
  active = false;
  label = '';
  startedAt = 0;
  readonly names: string[] = [];
  private readonly ids = new Map<string, number>();
  private readonly frames = new Ring<ProfileFrame>(4096);
  private readonly events = new Ring<ProfileEvent>(16384);
  private readonly rafs = new Ring<readonly [number, number]>(8192);
  private readonly inclusive = new Float64Array(256);
  private readonly exclusive = new Float64Array(256);
  private readonly calls = new Uint32Array(256);
  private readonly counts = new Float64Array(256);
  private readonly starts = new Float64Array(128);
  private readonly children = new Float64Array(128);
  private readonly stack = new Uint16Array(128);
  private depth = 0;
  private frameStart = 0;
  private previousFrame = 0;
  private previousRaf = 0;
  private inFrame = false;
  constructor(private readonly now: () => number = () => performance.now()) {}
  id(name: string): number {
    let id = this.ids.get(name);
    if (id === undefined) {
      id = this.names.length;
      if (id >= 256) throw new Error('Profiling stage limit exceeded');
      this.ids.set(name, id);
      this.names.push(name);
    }
    return id;
  }
  start(label: string): void {
    this.clear();
    this.label = label;
    this.startedAt = this.now();
    this.active = true;
  }
  stop(): void {
    this.active = false;
  }
  clear(): void {
    this.active = false;
    this.frames.clear();
    this.events.clear();
    this.rafs.clear();
    this.depth = 0;
    this.inFrame = false;
    this.previousFrame = this.previousRaf = 0;
    this.inclusive.fill(0);
    this.exclusive.fill(0);
    this.calls.fill(0);
    this.counts.fill(0);
  }
  begin(id: number): number {
    if (!this.active) return -1;
    const token = this.depth++;
    if (token >= 128) throw new Error('Profiling scope limit exceeded');
    this.starts[token] = this.now();
    this.children[token] = 0;
    this.stack[token] = id;
    return token;
  }
  end(token: number): void {
    if (token < 0) return;
    const end = this.now(),
      start = this.starts[token] ?? end;
    const duration = end - start,
      own = Math.max(0, duration - (this.children[token] ?? 0));
    const id = this.stack[token] ?? 0;
    this.depth = token;
    if (token > 0) this.children[token - 1] = (this.children[token - 1] ?? 0) + duration;
    if (this.inFrame) {
      this.inclusive[id] = (this.inclusive[id] ?? 0) + duration;
      this.exclusive[id] = (this.exclusive[id] ?? 0) + own;
      this.calls[id] = (this.calls[id] ?? 0) + 1;
    } else this.event(this.names[id] ?? 'unknown', start, duration, { exclusive: own });
  }
  count(id: number, amount = 1): void {
    if (this.active) this.counts[id] = (this.counts[id] ?? 0) + amount;
  }
  event(name: string, t: number, duration: number, detail?: unknown): void {
    if (this.active)
      this.events.push({ name, t, duration, ...(detail === undefined ? {} : { detail }) });
  }
  raf(t: number): void {
    if (!this.active) return;
    if (this.previousRaf) this.rafs.push([t, t - this.previousRaf]);
    this.previousRaf = t;
  }
  beginFrame(): void {
    if (!this.active) return;
    this.frameStart = this.now();
    this.inFrame = true;
  }
  endFrame(): void {
    if (!this.active || !this.inFrame) return;
    const stages: number[] = [],
      counts: number[] = [];
    for (let i = 0; i < this.names.length; i++) {
      if (this.calls[i])
        stages.push(i, this.inclusive[i] ?? 0, this.exclusive[i] ?? 0, this.calls[i] ?? 0);
      if (this.counts[i]) counts.push(i, this.counts[i] ?? 0);
    }
    if (this.previousFrame)
      this.frames.push({
        t: this.frameStart,
        dt: this.frameStart - this.previousFrame,
        cpu: this.now() - this.frameStart,
        stages,
        counts,
      });
    this.previousFrame = this.frameStart;
    this.inFrame = false;
    this.inclusive.fill(0);
    this.exclusive.fill(0);
    this.calls.fill(0);
    this.counts.fill(0);
  }
  drain() {
    return {
      label: this.label,
      timeOrigin: performance.timeOrigin,
      startedAt: this.startedAt,
      names: [...this.names],
      frames: this.frames.drain(),
      events: this.events.drain(),
      rafs: this.rafs.drain(),
      dropped: {
        frames: this.frames.dropped,
        events: this.events.dropped,
        rafs: this.rafs.dropped,
      },
    };
  }
  snapshot() {
    return {
      active: this.active,
      label: this.label,
      frames: this.frames.length,
      events: this.events.length,
      rafs: this.rafs.length,
      dropped: this.frames.dropped + this.events.dropped + this.rafs.dropped,
    };
  }
}
let current: PerformanceCollector | undefined;
export function collector(): PerformanceCollector | undefined {
  return current;
}
export function activateCollector(): PerformanceCollector {
  return (current ??= new PerformanceCollector());
}
const sampleCounts = new Uint32Array(256);
export function profileBegin(name: string, every = 1): number {
  if (!current?.active) return -1;
  const id = current.id(name);
  if (every > 1) {
    current.count(current.id('calls.' + name));
    sampleCounts[id] = (sampleCounts[id] ?? 0) + 1;
    if ((sampleCounts[id] ?? 0) % every !== 0) return -1;
  }
  return current.begin(id);
}
export function profileEnd(token: number): void {
  current?.end(token);
}
export function profileEvent(name: string, t: number, duration: number, detail?: unknown): void {
  current?.event(name, t, duration, detail);
}
