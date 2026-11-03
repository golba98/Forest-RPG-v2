import { BIOMES, type WorldEnvironment } from './Biomes';

/** Signed lattice hashing: neither coordinate is mirrored; no mutable random stream. */
export function coordinateRandom(seed: number, x: number, y: number, salt = 0): number {
  let h =
    Math.imul(x | 0, 0x45d9f3b) ^ Math.imul(y | 0, 0x27d4eb2d) ^ seed ^ Math.imul(salt, 0x165667b1);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
export function field(seed: number, x: number, y: number, scale: number, salt = 0): number {
  const px = x / scale,
    py = y / scale,
    ix = Math.floor(px),
    iy = Math.floor(py);
  const fx = smooth(px - ix),
    fy = smooth(py - iy);
  const a = coordinateRandom(seed, ix, iy, salt),
    b = coordinateRandom(seed, ix + 1, iy, salt);
  const c = coordinateRandom(seed, ix, iy + 1, salt),
    d = coordinateRandom(seed, ix + 1, iy + 1, salt);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
interface Site {
  x: number;
  y: number;
  biome: number;
}
export interface GeographySample {
  biome: number;
  secondary: number;
  blend: number;
  cover: number;
  moisture: number;
  relief: number;
  material: number;
  riverDistance: number;
  riverWidth: number;
}
/** A sampler owns only a small site cache; discard it after generating a window. */
export class Geography {
  private sites = new Map<string, readonly Site[]>();
  constructor(readonly seed: number) {}
  private region(cx: number, cy: number): readonly Site[] {
    const key = `${cx},${cy}`;
    const hit = this.sites.get(key);
    if (hit) return hit;
    const order = [0, 1, 2, 3, 4].sort(
      (a, b) =>
        coordinateRandom(this.seed, cx, cy, 100 + a) - coordinateRandom(this.seed, cx, cy, 100 + b),
    );
    const points = [
      [34, 34],
      [116, 34],
      [34, 116],
      [116, 116],
      [75, 75],
    ];
    const result = points.map(([x, y], i) => ({
      x: cx * 150 + x! + (coordinateRandom(this.seed, cx, cy, 120 + i) - 0.5) * 10,
      y: cy * 150 + y! + (coordinateRandom(this.seed, cx, cy, 130 + i) - 0.5) * 10,
      biome: order[i]!,
    }));
    // Bounded even when a preview reuses the sampler for long journeys.
    if (this.sites.size >= 64) this.sites.delete(this.sites.keys().next().value!);
    this.sites.set(key, result);
    return result;
  }
  sample(x: number, y: number): GeographySample {
    const wx = x + (field(this.seed, x, y, 29, 1) - 0.5) * 14,
      wy = y + (field(this.seed, x, y, 31, 2) - 0.5) * 14;
    const cx = Math.floor(wx / 150),
      cy = Math.floor(wy / 150);
    let d1 = Infinity,
      d2 = Infinity,
      b1 = 0,
      b2 = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const s of this.region(cx + dx, cy + dy)) {
          const d = (wx - s.x) ** 2 + (wy - s.y) ** 2;
          if (d < d1) {
            d2 = d1;
            b2 = b1;
            d1 = d;
            b1 = s.biome;
          } else if (d < d2) {
            d2 = d;
            b2 = s.biome;
          }
        }
    const blend = Math.max(0, (10 - (Math.sqrt(d2) - Math.sqrt(d1))) / 20),
      a = BIOMES[b1]!,
      b = BIOMES[b2]!;
    const mix = (p: number, q: number) => p * (1 - blend) + q * blend;
    const { riverDistance, riverWidth } = riverAt(this.seed, x, y);
    const relief = Math.max(
      0,
      Math.min(
        1,
        field(this.seed, x, y, 38, 3) * 0.7 +
          field(this.seed, x, y, 15, 4) * 0.3 +
          mix(a.elevation, b.elevation) -
          Math.max(0, 1 - riverDistance / 10) * 0.5,
      ),
    );
    const moisture = Math.min(
      1,
      mix(a.moisture, b.moisture) * 0.7 +
        field(this.seed, x, y, 20, 5) * 0.3 +
        Math.max(0, 1 - riverDistance / 9) * 0.3,
    );
    const grove = field(this.seed, x, y, 14, 6),
      clearing = field(this.seed, x, y, 9, 7);
    const cover = Math.max(
      0,
      Math.min(
        1,
        mix(a.treeDensity, b.treeDensity) * (grove * 0.9 + 0.25) * (clearing < 0.3 ? 0.15 : 1),
      ),
    );
    const material =
      moisture > 0.8
        ? 4
        : relief > 0.74
          ? 5
          : cover > 0.3
            ? 3
            : clearing < 0.3
              ? 1
              : field(this.seed, x, y, 8, 8) > 0.65
                ? 2
                : 0;
    return {
      biome: b1,
      secondary: b2,
      blend,
      cover,
      moisture,
      relief,
      material,
      riverDistance,
      riverWidth,
    };
  }
}
export function generateEnvironment(
  seed: number,
  x: number,
  y: number,
  width: number,
  height: number,
): WorldEnvironment {
  const geo = new Geography(seed),
    biome: number[] = [],
    secondary: number[] = [],
    blend: number[] = [],
    cover: number[] = [],
    moisture: number[] = [],
    relief: number[] = [],
    material: number[] = [];
  for (let iy = 0; iy < height; iy++)
    for (let ix = 0; ix < width; ix++) {
      const s = geo.sample(x + ix, y + iy);
      biome.push(s.biome);
      secondary.push(s.secondary);
      blend.push(Math.round(s.blend * 255));
      cover.push(Math.round(s.cover * 255));
      moisture.push(Math.round(s.moisture * 255));
      relief.push(Math.round(s.relief * 255));
      material.push(s.material);
    }
  return { version: 1, biome, secondary, blend, cover, moisture, relief, material };
}

export function riverAt(
  seed: number,
  x: number,
  y: number,
): { riverDistance: number; riverWidth: number } {
  const phase = coordinateRandom(seed, 0, 0, 33) * 6.28;
  const riverY = 75 + Math.sin(x / 29 + phase) * 10 + Math.sin(x / 63 + phase) * 12;
  const riverX = 32 + Math.sin(y / 41 + phase) * 15;
  const distance = (v: number) => Math.abs(v - Math.round(v / 150) * 150);
  return {
    riverDistance: Math.min(distance(y - riverY), distance(x - riverX)),
    riverWidth: 1.3 + field(seed, x, y, 38, 44) * 1.05,
  };
}
