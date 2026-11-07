import type { WorldData } from '../types/world';
import assets from './environmentAssets.json' with { type: 'json' };

export const BIOME_IDS = ['forest', 'meadow', 'highlands', 'wetlands', 'autumn'] as const;
export type BiomeId = (typeof BIOME_IDS)[number];
export interface BiomeDefinition {
  readonly id: BiomeId;
  readonly palette: readonly [string, string, string];
  readonly treeDensity: number;
  readonly elevation: number;
  /** Local raised terrain, separate from the climate elevation used to select biomes. */
  readonly landform: {
    readonly scale: number;
    readonly maxTier: 2 | 3;
    readonly terraceFrequency: number;
    readonly threshold: number;
    readonly ridgeWeight: number;
  };
  readonly moisture: number;
  readonly trees: readonly number[];
  readonly plants: readonly number[];
  readonly assets: string;
  readonly spawns: readonly ['mantis', 'maggot', 'beetle', 'ghost'];
}
export const BIOMES: readonly BiomeDefinition[] = [
  {
    id: 'forest',
    palette: ['#547344', '#65834b', '#799153'],
    treeDensity: 0.48,
    elevation: 0.05,
    landform: { scale: 23, maxTier: 3, terraceFrequency: 70, threshold: 0.57, ridgeWeight: 0.2 },
    moisture: 0.6,
    trees: [12, 13],
    plants: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    assets: 'environment_forest',
    spawns: ['mantis', 'maggot', 'beetle', 'ghost'],
  },
  {
    id: 'meadow',
    palette: ['#829451', '#94a55f', '#abb573'],
    treeDensity: 0.055,
    elevation: -0.08,
    landform: { scale: 28, maxTier: 2, terraceFrequency: 65, threshold: 0.54, ridgeWeight: 0.12 },
    moisture: 0.35,
    trees: [1, 8],
    plants: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    assets: 'environment_meadow',
    spawns: ['mantis', 'maggot', 'beetle', 'ghost'],
  },
  {
    id: 'highlands',
    palette: ['#777e65', '#8b9073', '#a3a589'],
    treeDensity: 0.12,
    elevation: 0.26,
    landform: { scale: 19, maxTier: 3, terraceFrequency: 100, threshold: 0.55, ridgeWeight: 0.42 },
    moisture: 0.2,
    trees: [2, 3, 10],
    plants: [0, 1, 2, 3, 4, 5],
    assets: 'environment_highlands',
    spawns: ['mantis', 'maggot', 'beetle', 'ghost'],
  },
  {
    id: 'wetlands',
    palette: ['#536b53', '#65785b', '#82916a'],
    treeDensity: 0.22,
    elevation: -0.25,
    landform: { scale: 20, maxTier: 2, terraceFrequency: 38, threshold: 0.66, ridgeWeight: 0.1 },
    moisture: 0.95,
    trees: [4, 5],
    plants: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    assets: 'environment_wetlands',
    spawns: ['mantis', 'maggot', 'beetle', 'ghost'],
  },
  {
    id: 'autumn',
    palette: ['#85754a', '#9d8853', '#b49b65'],
    treeDensity: 0.4,
    elevation: 0.03,
    landform: { scale: 24, maxTier: 3, terraceFrequency: 70, threshold: 0.55, ridgeWeight: 0.22 },
    moisture: 0.45,
    trees: [6, 7, 9],
    plants: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    assets: 'environment_autumn',
    spawns: ['mantis', 'maggot', 'beetle', 'ghost'],
  },
];
/** Persisted material decisions. Collision always comes from tiles and object semantics. */
export interface WorldEnvironment {
  readonly version: 1;
  readonly biome: readonly number[];
  readonly secondary: readonly number[];
  readonly blend: readonly number[];
  readonly cover: readonly number[];
  readonly moisture: readonly number[];
  readonly relief: readonly number[];
  readonly material: readonly number[];
}
export function biomeAt(world: WorldData, x: number, y: number): number {
  return world.environment?.biome[Math.floor(y) * world.meta.width + Math.floor(x)] ?? 0;
}
export function validEnvironment(value: unknown, length: number): value is WorldEnvironment {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    ['biome', 'secondary', 'blend', 'cover', 'moisture', 'relief', 'material'].every((key) => {
      const a = v[key],
        max = key === 'biome' || key === 'secondary' ? 4 : key === 'material' ? 7 : 255;
      return (
        Array.isArray(a) &&
        a.length === length &&
        a.every((n) => Number.isInteger(n) && n >= 0 && n <= max)
      );
    })
  );
}

/** Optional stable source selection in saved world edits. Reject malformed atlas references. */
export function validEnvironmentAssetKey(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'string') return false;
  if (/^native:(young|tall|broad|compact)$/.test(value)) return true;
  const tree = /^tree:(\d+)$/.exec(value);
  if (tree) return Number(tree[1]) < assets.trees.length;
  const plant = /^plant:([a-z]+):(\d+)$/.exec(value);
  if (!plant) return false;
  const biome = BIOMES.find((b) => b.id === plant[1]);
  return !!biome && Number(plant[2]) < biome.plants.length;
}
