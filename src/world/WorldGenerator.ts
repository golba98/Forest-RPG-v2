import { GAME_CONFIG } from '../config/GameConfig';
import { Tile } from '../types/tiles';
import { WORLD_GENERATOR_VERSION } from '../types/world';
import type { TilePoint, WorldData, WorldGenOptions } from '../types/world';
import { applyBorderRing, computeClearArea, fillBaseTerrain } from './generation/baseTerrain';
import { placeBridges } from './generation/bridges';
import { GenGrid } from './generation/GenGrid';
import { generateHills } from './generation/hills';
import {
  findPortalTile,
  placeProps,
  planSpawns,
  pruneUnreachable,
  restoreSpawnClearing,
} from './generation/placement';
import {
  applySpawnSafeArea,
  carveGuidedRivers,
  carveMainRiver,
  carveSpawnBranch,
  roundRiverTips,
  smoothRiverDiagonals,
} from './generation/rivers';
import { PerlinNoise } from './Noise';
import { Rng } from './Rng';

export const MIN_WORLD_SIZE = 32;
const MAX_ATTEMPTS = 8;
const MAX_BRIDGE_PASSES = 5;
const SPAWN_BRANCH_CHANCE = 0.55;

/**
 * Deterministic procedural world: identical options always produce
 * byte-identical output. Ports the legacy pipeline (base forest → rivers →
 * bridges → CA hills → reachability pruning → portal → props → spawns).
 *
 * If an attempt cannot fit all spawns (e.g. hills wall the spawn in), the
 * next attempt re-rolls from a seed derived from (seed, attempt), so the
 * result is still a pure function of the options.
 */
export function generateWorld(opts: WorldGenOptions): WorldData {
  const width = opts.width ?? GAME_CONFIG.world.width;
  const height = opts.height ?? GAME_CONFIG.world.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < MIN_WORLD_SIZE || height < MIN_WORLD_SIZE) {
    throw new RangeError(`generateWorld: size must be integers >= ${MIN_WORLD_SIZE}, got ${width}x${height}`);
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const world = tryGenerate(opts, width, height, attempt);
    if (world) return world;
  }
  throw new Error(`generateWorld: no valid layout for seed ${opts.seed} after ${MAX_ATTEMPTS} attempts`);
}

function tryGenerate(opts: WorldGenOptions, width: number, height: number, attempt: number): WorldData | null {
  const baseSeed = attempt === 0 ? opts.seed >>> 0 : Rng.derive(opts.seed, `attempt-${attempt}`).nextUint32();
  const stream = (stage: string): Rng => Rng.derive(baseSeed, stage);

  const grid = new GenGrid(width, height, Tile.GRASS);
  const noise = new PerlinNoise(stream('noise'));
  const spawn: TilePoint = { x: Math.floor(width / 2), y: Math.floor(height / 2) };

  // Part 1 — base terrain.
  const terrainRng = stream('terrain');
  const clear = computeClearArea(width, height, terrainRng);
  fillBaseTerrain(grid, clear, terrainRng, noise);

  // Part 2 — rivers, spawn safe area, smoothing, border, bridges.
  const riverRng = stream('rivers');
  carveMainRiver(grid, riverRng, noise);
  carveGuidedRivers(grid, clear, riverRng, noise);
  if (riverRng.chance(SPAWN_BRANCH_CHANCE)) carveSpawnBranch(grid, spawn, riverRng, noise);
  applySpawnSafeArea(grid, clear, spawn);
  smoothRiverDiagonals(grid, clear);
  roundRiverTips(grid, clear);
  applyBorderRing(grid);
  placeBridges(grid, spawn, stream('bridges'), MAX_BRIDGE_PASSES);

  // Part 3 — hills (then re-open the spawn clearing they may cover).
  generateHills(grid, stream('hills'), noise);
  restoreSpawnClearing(grid, spawn);

  // Part 4 — anything the player cannot reach becomes forest.
  pruneUnreachable(grid, spawn);

  // Part 5 — portal, props, enemies and coins.
  const portal = findPortalTile(grid, spawn);
  if (!portal) return null;
  const props = placeProps(grid, spawn, portal, stream('props'), true);
  const enemyCount = GAME_CONFIG.world.enemiesByDifficulty[opts.difficulty];
  const plan = planSpawns(grid, spawn, portal, props, enemyCount, GAME_CONFIG.world.coinsPerLevel, stream('spawns'));
  if (!plan) return null;

  return {
    meta: {
      seed: opts.seed,
      generatorVersion: WORLD_GENERATOR_VERSION,
      width,
      height,
      isTutorial: false,
      level: opts.level,
      difficulty: opts.difficulty,
    },
    tiles: grid.tiles,
    props,
    spawn,
    portal,
    enemySpawns: plan.enemySpawns,
    pickupSpawns: plan.pickupSpawns,
  };
}
