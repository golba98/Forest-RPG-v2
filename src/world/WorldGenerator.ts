import { placeTreasure } from './TreasurePlacement';
import { prepareHilltopObjects } from './HilltopObjects';
import { reserveNest, clearNestReservation, siteBounds, placeGroves } from './EncounterPlacement';
import { canOccupy, hasClearPath } from '../systems/CollisionSystem';
import { bridgeGeometry } from './BridgeGeometry';
import { placeMud } from './generation/mud';
import { placeWoodland } from './generation/woodland';
import { GAME_CONFIG } from '../config/GameConfig';
import { floodFill } from './pathfinding';
import { tileProperties } from './TileMap';
import { Tile } from '../types/tiles';
import { WORLD_GENERATOR_VERSION } from '../types/world';
import type { TilePoint, WorldData, WorldGenOptions } from '../types/world';
import { applyBorderRing, computeClearArea, fillBaseTerrain } from './generation/baseTerrain';
import { placeBridges, validBridgeTerrain } from './generation/bridges';
import { GenGrid } from './generation/GenGrid';
import { generateHills, placeStairs, refreshHillEdges } from './generation/hills';
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
  smoothRiverDiagonals,
} from './generation/rivers';
import { PerlinNoise } from './Noise';
import { Rng } from './Rng';

export const MIN_WORLD_SIZE = 32;
const MAX_ATTEMPTS = 32;

/**
 * Deterministic procedural world: identical options always produce
 * byte-identical output. Ports the legacy pipeline (base forest → rivers →
 * CA hills → bridges → reachability pruning → portal → props → spawns).
 *
 * If an attempt cannot fit all spawns (e.g. hills wall the spawn in), the
 * next attempt re-rolls from a seed derived from (seed, attempt), so the
 * result is still a pure function of the options.
 */
export function generateWorld(opts: WorldGenOptions): WorldData {
  const width = opts.width ?? GAME_CONFIG.world.width;
  const height = opts.height ?? GAME_CONFIG.world.height;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < MIN_WORLD_SIZE ||
    height < MIN_WORLD_SIZE
  ) {
    throw new RangeError(
      `generateWorld: size must be integers >= ${MIN_WORLD_SIZE}, got ${width}x${height}`,
    );
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const world = tryGenerate(opts, width, height, attempt);
    if (world) return world;
  }
  throw new Error(
    `generateWorld: no valid layout for seed ${opts.seed} after ${MAX_ATTEMPTS} attempts`,
  );
}

function tryGenerate(
  opts: WorldGenOptions,
  width: number,
  height: number,
  attempt: number,
): WorldData | null {
  const baseSeed =
    attempt === 0 ? opts.seed >>> 0 : Rng.derive(opts.seed, `attempt-${attempt}`).nextUint32();
  const stream = (stage: string): Rng => Rng.derive(baseSeed, stage);

  const grid = new GenGrid(width, height, Tile.GRASS);
  const noise = new PerlinNoise(stream('noise'));
  const spawn: TilePoint = { x: Math.floor(width / 2), y: Math.floor(height / 2) };

  // Part 1 — base terrain.
  const terrainRng = stream('terrain');
  const clear = computeClearArea(width, height, terrainRng);
  fillBaseTerrain(grid, clear, terrainRng, noise);

  // Part 2 — rivers, spawn safe area, smoothing and border.
  const riverRng = stream('rivers');
  carveMainRiver(grid, riverRng, noise);
  carveGuidedRivers(grid, clear, riverRng, noise);
  applySpawnSafeArea(grid, clear);
  smoothRiverDiagonals(grid);
  applyBorderRing(grid);

  const nest = reserveNest(grid, spawn, opts.seed, opts.level, stream('nest'));
  if (!nest) return null;
  const reservations = [siteBounds(nest)];
  clearNestReservation(grid, nest);

  // Part 3 — hills (then re-open the spawn clearing they may cover).
  generateHills(grid, stream('hills'), noise);
  clearNestReservation(grid, nest);
  restoreSpawnClearing(grid, spawn);
  refreshHillEdges(grid);
  placeStairs(grid, stream('stairs'));
  const bridges = placeBridges(grid, spawn, stream('bridges'), reservations);

  // Part 4 — anything the player cannot reach becomes forest.
  pruneUnreachable(grid, spawn);

  const trees = placeWoodland(grid, stream('woodland'), spawn, bridges, reservations);
  placeMud(grid, spawn, stream('mud'), bridges);

  const trunkCells = new Set(trees.map((t) => t.tileY * width + t.tileX));
  const reached = floodFill(
    grid,
    spawn,
    (x, y) => !tileProperties(grid.get(x, y)).solid && !trunkCells.has(y * width + x),
  );
  for (let i = 0; i < grid.tiles.length; i++) {
    if (grid.tiles[i] !== Tile.RIVER && !tileProperties(grid.tiles[i] ?? 0).solid && !reached[i] && !trunkCells.has(i))
      grid.tiles[i] = Tile.FOREST;
  }

  // Part 5 — portal, props, enemies and coins.
  const portal = findPortalTile(grid, spawn, trees, bridges, reservations);
  if (!portal) return null;
  const decorations = placeProps(grid, spawn, portal, stream('props'), true, trees, bridges, reservations);
  const props = [...trees, ...decorations].map((p, id) => ({ ...p, id }));
  const collisionWorld = { meta: { width, height }, tiles: grid.tiles, props, bridges };
  const finalReached = floodFill(grid, spawn, (x, y) =>
    canOccupy(collisionWorld, x + 0.5, y + 0.5, 0.3),
  );
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++)
      if (grid.get(x, y) !== Tile.RIVER && canOccupy(collisionWorld, x + 0.5, y + 0.5, 0.3) && !finalReached[y * width + x])
        grid.set(x, y, Tile.FOREST);
  refreshHillEdges(grid);
  for (const bridge of bridges) {
    if (!validBridgeTerrain(grid, bridge)) return null;
    const f = bridgeGeometry(bridge).footprint;
    const horizontal = bridge.orientation === 'horizontal';
    for (const cross of [0.5, 1, 1.5]) {
      const x = horizontal ? f.minX - 0.5 : f.minX + cross;
      const y = horizontal ? f.minY + cross : f.minY - 0.5;
      const tx = horizontal ? f.maxX + 0.5 : x;
      const ty = horizontal ? y : f.maxY + 0.5;
      if (!hasClearPath(collisionWorld, x, y, tx, ty, 0.3, 'groundEnemy')) return null;
    }
  }
  const enemyCount = GAME_CONFIG.world.enemiesByDifficulty[opts.difficulty];
  const plan = planSpawns(
    grid,
    spawn,
    portal,
    props,
    enemyCount,
    GAME_CONFIG.world.coinsPerLevel,
    stream('spawns'),
    bridges,
    reservations,
  );
  if (!plan) return null;

  const nestReached = floodFill(grid, spawn, (x, y) => canOccupy(collisionWorld, x + 0.5, y + 0.5, 0.3, 'groundEnemy'));
  if (!nestReached[Math.floor(nest.y) * width + Math.floor(nest.x)]) return null;
  let exits = 0;
  for (const [dx, dy] of [[0, -6], [6, 0], [0, 6], [-6, 0]] as const) {
    const x = Math.floor(nest.x) + dx, y = Math.floor(nest.y) + dy;
    if (x >= 0 && y >= 0 && x < width && y < height && nestReached[y * width + x] && hasClearPath(collisionWorld, nest.x, nest.y, x + 0.5, y + 0.5, 0.3, 'groundEnemy')) exits++;
  }
  if (exits < 2) return null;

  const world: WorldData = {
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
    bridges,
    spawn,
    portal,
    enemySpawns: plan.enemySpawns,
    pickupSpawns: plan.pickupSpawns,
    encounterSites: [nest],
  };
  return placeTreasure(prepareHilltopObjects({ ...world, encounterSites: [nest, ...placeGroves(world, [nest])] }));
}
