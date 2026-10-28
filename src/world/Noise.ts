import { Rng } from './Rng';

const YWRAP_BITS = 4;
const YWRAP = 1 << YWRAP_BITS;
const TABLE_MASK = 4095;
const OCTAVES = 4;
const AMP_FALLOFF = 0.5;

function scaledCosine(t: number): number {
  return 0.5 * (1 - Math.cos(t * Math.PI));
}

/**
 * Seeded 2D Perlin noise using the same lattice + fractal octave scheme as
 * p5.js 1.6 `noise()` (4 octaves, 0.5 falloff, cosine interpolation).
 *
 * The legacy generator's thresholds (forest wobble, river radius, hill
 * threshold 0.48) were tuned against p5's value distribution — roughly
 * [0, 0.94) with mean ≈ 0.47 — so matching the algorithm keeps the
 * generated terrain statistically faithful while being fully seed-driven.
 */
export class PerlinNoise {
  private readonly table: Float64Array;

  constructor(seed: number | Rng) {
    const rng = typeof seed === 'number' ? new Rng(seed) : seed;
    this.table = new Float64Array(TABLE_MASK + 1);
    for (let i = 0; i < this.table.length; i++) {
      this.table[i] = rng.nextFloat();
    }
  }

  /** Fractal noise at (x, y); deterministic per seed, range ≈ [0, 0.94). */
  noise2(x: number, y: number): number {
    const t = this.table;
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    let xi = Math.floor(ax);
    let yi = Math.floor(ay);
    let xf = ax - xi;
    let yf = ay - yi;
    let result = 0;
    let amplitude = 0.5;

    for (let octave = 0; octave < OCTAVES; octave++) {
      const offset = xi + (yi << YWRAP_BITS);
      const rx = scaledCosine(xf);
      const ry = scaledCosine(yf);

      const a = t[offset & TABLE_MASK] ?? 0;
      const b = t[(offset + 1) & TABLE_MASK] ?? 0;
      const c = t[(offset + YWRAP) & TABLE_MASK] ?? 0;
      const d = t[(offset + YWRAP + 1) & TABLE_MASK] ?? 0;
      const top = a + rx * (b - a);
      const bottom = c + rx * (d - c);
      result += (top + ry * (bottom - top)) * amplitude;

      amplitude *= AMP_FALLOFF;
      xi <<= 1;
      xf *= 2;
      yi <<= 1;
      yf *= 2;
      if (xf >= 1) {
        xi++;
        xf--;
      }
      if (yf >= 1) {
        yi++;
        yf--;
      }
    }
    return result;
  }
}
