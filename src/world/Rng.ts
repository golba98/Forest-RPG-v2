/**
 * Seeded pseudo-random number generator (mulberry32).
 *
 * All world generation and simulation randomness flows through this class so
 * that a seed fully determines the output. The whole generator state is one
 * uint32, which makes it trivial to persist in save files.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /**
   * Builds an independent stream for a named purpose (e.g. one per generation
   * stage) so tweaking one stage does not shift the random sequence of others.
   */
  static derive(seed: number, salt: string): Rng {
    let h = (seed ^ 0x9e3779b9) >>> 0;
    for (let i = 0; i < salt.length; i++) {
      h = Math.imul(h ^ salt.charCodeAt(i), 0x01000193) >>> 0;
    }
    // Final avalanche so similar salts produce unrelated seeds.
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return new Rng((h ^ (h >>> 16)) >>> 0);
  }

  /** Next raw 32-bit unsigned integer. */
  nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Uniform float in [0, 1). */
  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Uniform integer in [min, maxInclusive]. */
  nextInt(min: number, maxInclusive: number): number {
    if (maxInclusive < min) {
      throw new RangeError(`Rng.nextInt: max (${maxInclusive}) < min (${min})`);
    }
    return min + Math.floor(this.nextFloat() * (maxInclusive - min + 1));
  }

  /** True with probability `p` (clamped to [0, 1]). */
  chance(p: number): boolean {
    return this.nextFloat() < p;
  }

  /** Uniformly picks one element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError('Rng.pick: cannot pick from an empty array');
    }
    return items[Math.floor(this.nextFloat() * items.length)] as T;
  }

  /** In-place Fisher–Yates shuffle. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.nextFloat() * (i + 1));
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }

  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }
}
