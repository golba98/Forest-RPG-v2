import assets from '../world/environmentAssets.json' with { type: 'json' };
import { BIOMES, biomeAt } from '../world/Biomes';
import type { WorldData, WorldProp } from '../types/world';
import type { VegetationFrame } from './vegetationArt';
import { coordinateRandom } from '../world/Geography';

export const ENV_GROUND = 'environment_ground';
export const ENV_RELIEF = 'environment_relief';
const ENV_UPLAND = 'environment_upland';
export function environmentAssets(): { alias: string; src: string }[] {
  const base = 'assets/images/environment';
  return [
    { alias: ENV_GROUND, src: `${base}/shared/ground.png` },
    { alias: ENV_RELIEF, src: `${base}/shared/relief.png` },
    { alias: ENV_UPLAND, src: `${base}/shared/upland.png` },
    ...Array.from({ length: 14 }, (_, i) => ({
      alias: `environment_tree_${i}`,
      src: `${base}/shared/tree-${i}.png`,
    })),
    ...Array.from({ length: 6 }, (_, i) => ({
      alias: `environment_rock_${i}`,
      src: `${base}/shared/rock-${i}.png`,
    })),
    ...BIOMES.map((b) => ({ alias: `${b.assets}_upland`, src: `${base}/${b.id}/upland.png` })),
    ...BIOMES.map((b) => ({ alias: b.assets, src: `${base}/${b.id}/plants.png` })),
  ];
}
export function environmentVegetation(p: WorldProp, w: WorldData): VegetationFrame | null {
  if (p.sourceGeneratorVersion !== undefined) return null;
  if (p.assetKey) {
    const [kind, selection, frame] = p.assetKey.split(':');
    if (kind === 'tree') {
      const id = Number(selection),
        a = assets.trees[id];
      if (a)
        return {
          atlas: `environment_tree_${id}`,
          rect: { x: 0, y: 0, w: a.width, h: a.height },
          root: [a.anchor[0]!, a.anchor[1]!],
        };
    }
    if (kind === 'plant') {
      const b = BIOMES.find((v) => v.id === selection);
      if (b)
        return {
          atlas: b.assets,
          rect: { x: Number(frame) * 32, y: 0, w: 32, h: 32 },
          root: [16, 30],
        };
    }
    return null;
  }
  if (!w.environment) return null;
  const i = p.tileY * w.meta.width + p.tileX;
  const biome =
    BIOMES[
      coordinateRandom(w.meta.seed, p.tileX, p.tileY, 94) < (w.environment.blend[i] ?? 0) / 255
        ? (w.environment.secondary[i] ?? 0)
        : biomeAt(w, p.tileX, p.tileY)
    ]!;
  const hash = p.variant ?? Math.floor(coordinateRandom(w.meta.seed, p.tileX, p.tileY, 93) * 256);
  if (p.kind === 'rock_boulder' && !p.hilltop && p.variant !== undefined)
    return {
      atlas: `environment_rock_${p.variant % 6}`,
      rect: { x: 0, y: 0, w: 32, h: 32 },
      root: [16, 32],
    };
  if (p.kind === 'tree') {
    const id =
      p.variant !== undefined && p.variant < 14
        ? p.variant
        : biome.trees[hash % biome.trees.length]!;
    const asset = assets.trees[id] ?? assets.trees[12]!;
    return {
      atlas: `environment_tree_${id}`,
      rect: { x: 0, y: 0, w: asset.width, h: asset.height },
      root: [asset.anchor[0] ?? 0, asset.anchor[1] ?? 0],
    };
  }
  if (['flower_clump', 'flower_pink', 'flower_yellow', 'bush_small'].includes(p.kind)) {
    const id = hash % biome.plants.length;
    return { atlas: biome.assets, rect: { x: id * 32, y: 0, w: 32, h: 32 }, root: [16, 30] };
  }
  return null;
}
/** Modulate the original textured grass; forest retains its approved pixels. */
export function biomeGroundTint(w: WorldData, x: number, y: number): number {
  const e = w.environment;
  if (!e) return 0xffffff;
  const i = y * w.meta.width + x,
    t = (e.blend[i] ?? 0) / 255;
  const colors = [0xffffff, 0xf1f4c9, 0xb9bfb0, 0x92b3a3, 0xffa77b];
  const a = colors[e.biome[i] ?? 0]!,
    b = colors[e.secondary[i] ?? 0]!;
  let result = 0;
  for (const shift of [16, 8, 0])
    result |= Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t) << shift;
  return result;
}

/** Shared by plateau rendering and the ground exposed beneath stair overlays. */
export function uplandVariantOffset(x: number, y: number): number {
  return (
    (((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0) % assets.upland.variants) *
    assets.upland.variantStride
  );
}
export function raisedSurfaceTint(tint: number, level: number): number {
  const light = level === 1 ? 0.94 : level === 2 ? 0.97 : 1;
  return [16, 8, 0].reduce(
    (value, shift) => value | (Math.round(((tint >> shift) & 255) * light) << shift),
    0,
  );
}
