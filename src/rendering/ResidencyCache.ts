import type { WorldRect } from './chunkMath';
import { intersects, RETENTION_MS } from './WorldVisibility';

interface Resident<T> {
  readonly value: T;
  readonly bounds: Readonly<WorldRect>;
  readonly bytes: number;
  lastUsed: number;
}

/** Owns disposable presentation resources, never world data or shared texture sources. */
export class ResidencyCache<T> {
  readonly entries = new Map<string, Resident<T>>();
  bytes = 0;
  evictions = 0;

  constructor(private readonly dispose: (value: T) => void) {}

  set(key: string, value: T, bounds: Readonly<WorldRect>, bytes: number, now: number): void {
    this.delete(key);
    this.entries.set(key, { value, bounds, bytes, lastUsed: now });
    this.bytes += bytes;
  }

  delete(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.dispose(entry.value);
    this.bytes -= entry.bytes;
    this.entries.delete(key);
  }

  prune(
    required: ReadonlySet<string>,
    retention: Readonly<WorldRect>,
    now: number,
    budget: number,
  ): void {
    const candidates: [string, Resident<T>][] = [];
    for (const [key, entry] of this.entries) {
      if (required.has(key)) {
        entry.lastUsed = now;
        continue;
      }
      if (!intersects(entry.bounds, retention) && now - entry.lastUsed >= RETENTION_MS) {
        this.delete(key);
        this.evictions++;
      } else candidates.push([key, entry]);
    }
    if (this.bytes <= budget) return;
    candidates.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key] of candidates) {
      if (this.bytes <= budget) break;
      this.delete(key);
      this.evictions++;
    }
  }

  clear(): void {
    for (const key of this.entries.keys()) this.delete(key);
    this.evictions = 0;
  }
}
