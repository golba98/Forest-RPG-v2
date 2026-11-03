import { BIOMES, type WorldEnvironment } from '../Biomes';
import { coordinateHash, valueNoise } from './coordinates';

export interface BiomeSample {
  biome: number;
  secondary: number;
  blend: number;
  temperature: number;
  moisture: number;
  relief: number;
  upland: number;
  cover: number;
  material: number;
  water: boolean;
  shallow: boolean;
}
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
};
/** Versioned climate and hydrology. No window dimensions or mutable random state. */
export class BiomeGeography {
  private readonly cache = new Map<string, BiomeSample>();
  readonly anchors: readonly { x: number; y: number; biome: number }[];
  private readonly waterOffset: number;
  constructor(
    readonly seed: number,
    readonly version: 14 | 15 = 15,
  ) {
    const phase = (coordinateHash(seed, 0, 0, 'climate-orientation') / 0xffffffff) * Math.PI * 2;
    this.anchors = [
      { x: 0, y: 0, biome: 0 },
      ...[1, 2, 3, 4].map((biome, i) => {
        const angle = phase + (i * Math.PI) / 2;
        const radius = 440 + (coordinateHash(seed, biome, 0, 'climate-distance') % 160);
        return {
          x: Math.round(Math.cos(angle) * radius),
          y: Math.round(Math.sin(angle) * radius),
          biome,
        };
      }),
    ];
    let offset = 0;
    while (offset < 4096 && Math.abs(this.noise(offset, 0, 150, 'river') - 0.5) < 0.16)
      offset += 137;
    this.waterOffset = offset;
  }
  private noise(x: number, y: number, scale: number, salt: string): number {
    return valueNoise(this.seed, x / scale, y / scale, salt);
  }
  sample(x: number, y: number): BiomeSample {
    const key = `${x},${y}`,
      hit = this.cache.get(key);
    if (hit) return hit;
    const wx = x + (this.noise(x, y, 180, 'climate-warp-x') - 0.5) * 100;
    const wy = y + (this.noise(x, y, 180, 'climate-warp-y') - 0.5) * 100;
    let temperature = this.noise(wx, wy, 620, 'temperature');
    let moisture = this.noise(wx, wy, 440, 'moisture');
    let relief =
      this.noise(wx, wy, 380, 'elevation') * 0.75 + this.noise(wx, wy, 90, 'ridges') * 0.25;
    let season = this.noise(wx, wy, 510, 'season');
    // A few broad ecological regions make the starting landscape diverse. These
    // change climate, never paint rectangles or separate showcase maps.
    const climate = [
      [0.56, 0.62, 0.42, 0.25],
      [0.72, 0.3, 0.35, 0.22],
      [0.3, 0.26, 0.73, 0.2],
      [0.6, 0.96, 0.18, 0.2],
      [0.4, 0.58, 0.42, 0.94],
    ];
    for (const a of this.anchors) {
      const influence = 1 - smooth((Math.hypot(wx - a.x, wy - a.y) - 90) / 210);
      if (influence <= 0) continue;
      const target = climate[a.biome]!;
      temperature += (target[0]! - temperature) * influence;
      moisture += (target[1]! - moisture) * influence;
      relief += (target[2]! - relief) * influence;
      season += (target[3]! - season) * influence;
    }
    const riverWarp = (this.noise(x, y, 240, 'river-warp') - 0.5) * 48;
    const channel = Math.abs(this.noise(x + this.waterOffset + riverWarp, y, 150, 'river') - 0.5);
    const width = 0.012 + this.noise(x, y, 80, 'river-width') * 0.008;
    const valley = 1 - smooth(channel / 0.085);
    const water = channel < width;
    const regionalRelief = relief;
    relief = clamp(
      relief -
        valley * 0.25 +
        (this.noise(x, y, 38, 'hill-shape') - 0.5) * (regionalRelief > 0.65 ? 0.65 : 0.27),
    );
    moisture = clamp(moisture + valley * 0.12);
    const scores = [
      0.55 - Math.abs(moisture - 0.6) * 0.9 - Math.abs(temperature - 0.55) * 0.2,
      0.55 - Math.abs(moisture - 0.27) * 1.35 + (temperature - 0.5) * 0.1,
      (regionalRelief - 0.48) * 2.6,
      (moisture - 0.55) * 1.7 + (0.43 - regionalRelief) * 0.8,
      (season - 0.45) * 1.45 + 0.13 - Math.abs(moisture - 0.58) * 0.45,
    ];
    const order = [0, 1, 2, 3, 4].sort((a, b) => scores[b]! - scores[a]! || a - b);
    const biome = order[0]!,
      secondary = order[1]!;
    const blend = 0.5 * (1 - smooth((scores[biome]! - scores[secondary]!) / 0.13));
    // Regional height chooses the biome; local landforms must also exist in
    // low-elevation regions. Blend fixed-frequency fields, not their coordinate
    // scales: a varying divisor would amplify tiny climate changes far from zero.
    // River valleys and the spawn hollow stay low.
    let upland = relief - 0.65;
    if (this.version >= 15) {
      const hx =
        x +
        (this.noise(x, y, 39, 'landform-warp-x') - 0.5) * 14 +
        (this.noise(x, y, 11, 'landform-fold-x') - 0.5) * 5;
      const hy =
        y +
        (this.noise(x, y, 39, 'landform-warp-y') - 0.5) * 14 +
        (this.noise(x, y, 11, 'landform-fold-y') - 0.5) * 5;
      const field = (form: (typeof BIOMES)[number]['landform']) => {
        const broad = this.noise(hx, hy, form.scale, 'upland');
        const ridge = 1 - Math.abs(this.noise(hx, hy, form.scale * 1.8, 'upland-ridge') - 0.5) * 2;
        return broad * (1 - form.ridgeWeight) + ridge * form.ridgeWeight;
      };
      let shape = 0,
        threshold = 0,
        total = 0;
      for (const [index, definition] of BIOMES.entries()) {
        // Include every close climate score: choosing only the runner-up can
        // introduce a height jump where three biomes meet.
        const weight = 1 - smooth((scores[biome]! - scores[index]!) / 0.13);
        if (weight === 0) continue;
        shape += field(definition.landform) * weight;
        threshold += definition.landform.threshold * weight;
        total += weight;
      }
      const detail = (this.noise(hx, hy, 7, 'upland-detail') - 0.5) * 0.08;
      const hollow = 1 - smooth((Math.hypot(x, y) - 8) / 16);
      upland = (shape - threshold) / total + detail - valley * 0.38 - hollow * 0.6;
    }
    const density =
      BIOMES[biome]!.treeDensity * (1 - blend) + BIOMES[secondary]!.treeDensity * blend;
    const clearing = this.noise(x, y, 24, 'clearing');
    const cover =
      density * (0.4 + this.noise(x, y, 48, 'groves') * 0.9) * (clearing < 0.28 ? 0.12 : 1);
    const shallow =
      !water &&
      biome === 3 &&
      this.noise(x, y, 27, 'marsh-pools') > 0.64 &&
      relief < 0.35 &&
      (this.version === 14 || upland < -0.025);
    const material =
      moisture > 0.82 ? 4 : relief > 0.68 ? 5 : cover > 0.23 ? 3 : clearing < 0.28 ? 1 : 0;
    const result = {
      biome,
      secondary,
      blend,
      temperature,
      moisture,
      relief,
      upland,
      cover,
      material,
      water,
      shallow,
    };
    if (this.cache.size >= 32768) this.cache.clear();
    this.cache.set(key, result);
    return result;
  }
  environment(x: number, y: number, width: number, height: number): WorldEnvironment {
    const biome: number[] = [],
      secondary: number[] = [],
      blend: number[] = [],
      cover: number[] = [],
      moisture: number[] = [],
      relief: number[] = [],
      material: number[] = [];
    for (let dy = 0; dy < height; dy++)
      for (let dx = 0; dx < width; dx++) {
        const s = this.sample(x + dx, y + dy);
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
}
