import { riverAt, generateEnvironment, field } from './Geography';
import type { WorldEnvironment } from './Biomes';
import { placeTreasure } from './TreasurePlacement';
import { prepareHilltopObjects } from './HilltopObjects';
import { reserveNest, clearNestReservation, siteBounds, placeGroves } from './EncounterPlacement';
import { canOccupy } from '../systems/CollisionSystem';
import { LandscapePlan } from './LandscapePlan';
import { requiredBridgeAccess, requiredNestAccess } from './LandscapeAccess';
import { attachLandscapeTrace, createLandscapeTrace } from './LandscapeTrace';
import { placeMud } from './generation/mud';
import { placeWoodland } from './generation/woodland';
import { GAME_CONFIG } from '../config/GameConfig';
import { floodFill } from './pathfinding';
import { tileProperties } from './TileMap';
import { Tile } from '../types/tiles';
import { WORLD_GENERATOR_VERSION } from '../types/world';
import type { TilePoint, WorldData, WorldGenOptions } from '../types/world';
import { applyBorderRing } from './generation/baseTerrain';
import { placeBridges, validBridgeTerrain } from './generation/bridges';
import { GenGrid } from './generation/GenGrid';
import {
  generateHills,
  placeStairs,
  refreshHillEdges,
  connectSpawnClearing,
} from './generation/hills';
import {
  composeEnvironment,
  findPortalTile,
  placeProps,
  planSpawns,
  pruneUnreachable,
  restoreSpawnClearing,
} from './generation/placement';
import { smoothRiverDiagonals } from './generation/rivers';
import { PerlinNoise } from './Noise';
import { Rng } from './Rng';

const MIN_WORLD_SIZE = 32;
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
  if (opts.generatorVersion !== undefined && opts.generatorVersion !== WORLD_GENERATOR_VERSION)
    throw new Error(
      `Unsupported generation request: ${opts.generatorVersion}; only ${WORLD_GENERATOR_VERSION} can be generated`,
    );
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

  const environment = generateEnvironment(opts.seed, 0, 0, width, height);
  const rejections = new Map<string, number>();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const world = tryGenerate(opts, width, height, attempt, environment, rejections);
    if (world) return world;
  }
  throw new Error(
    `generateWorld: no valid layout for seed ${opts.seed} after ${MAX_ATTEMPTS} attempts (${[...rejections].map(([reason, count]) => `${reason}: ${count}`).join(', ')})`,
  );
}

function tryGenerate(
  opts: WorldGenOptions,
  width: number,
  height: number,
  attempt: number,
  environment: WorldEnvironment,
  rejections: Map<string, number>,
): WorldData | null {
  const reject = (reason: string): null => {
    rejections.set(reason, (rejections.get(reason) ?? 0) + 1);
    return null;
  };
  const trace = createLandscapeTrace();
  const baseSeed =
    attempt === 0 ? opts.seed >>> 0 : Rng.derive(opts.seed, `attempt-${attempt}`).nextUint32();
  const stream = (stage: string): Rng => Rng.derive(baseSeed, stage);

  const grid = new GenGrid(width, height, Tile.GRASS);
  const noise = new PerlinNoise(Rng.derive(opts.seed, 'noise'));
  const spawn: TilePoint = { x: Math.floor(width / 2), y: Math.floor(height / 2) };

  // Geography is fixed across placement retries, independent of gameplay RNG.
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x,
        g = riverAt(opts.seed, x, y);
      const safe = Math.hypot(x - spawn.x, y - spawn.y) < 6;
      if (!safe && g.riverDistance < g.riverWidth) grid.set(x, y, Tile.RIVER);
      else if (
        !safe &&
        environment.moisture[i]! > 205 &&
        environment.biome[i] === 3 &&
        field(opts.seed, x, y, 6, 29) > 0.62
      )
        grid.set(x, y, environment.moisture[i]! > 224 ? Tile.SHALLOW_WATER : Tile.MUD);
    }
  smoothRiverDiagonals(grid);
  applyBorderRing(grid);

  const nest = reserveNest(grid, spawn, opts.seed, opts.level, stream('nest'));
  if (!nest) return reject('nest placement');
  const reservations = [siteBounds(nest)];
  clearNestReservation(grid, nest);

  // Part 3 — hills (then re-open the spawn clearing they may cover).
  generateHills(grid, Rng.derive(opts.seed, 'hills'), noise, environment);
  clearNestReservation(grid, nest);
  restoreSpawnClearing(grid, spawn);
  refreshHillEdges(grid);
  placeStairs(grid, stream('stairs'));
  connectSpawnClearing(grid, spawn);
  const bridges = placeBridges(grid, spawn, stream('bridges'), reservations);

  // Part 4 — anything the player cannot reach becomes forest.
  pruneUnreachable(grid, spawn);

  const woodland = new LandscapePlan(
    {
      meta: { width, height },
      tiles: grid.tiles,
      props: [],
      bridges,
      encounterSites: [nest],
      spawn,
    },
    'woodland',
  );
  const trees = placeWoodland(
    grid,
    stream('woodland'),
    spawn,
    woodland,
    trace,
    environment,
    opts.seed,
  );
  placeMud(grid, spawn, stream('mud'), bridges);

  const trunkCells = new Set(trees.map((t) => t.tileY * width + t.tileX));
  const reached = floodFill(
    grid,
    spawn,
    (x, y) => !tileProperties(grid.get(x, y)).solid && !trunkCells.has(y * width + x),
  );
  for (let i = 0; i < grid.tiles.length; i++) {
    if (
      grid.tiles[i] !== Tile.RIVER &&
      !tileProperties(grid.tiles[i] ?? 0).solid &&
      !reached[i] &&
      !trunkCells.has(i)
    )
      grid.tiles[i] = Tile.FOREST;
  }

  // Part 5 — portal, props, enemies and coins.
  const portal = findPortalTile(grid, spawn, trees, bridges, reservations);
  if (!portal) return reject('portal placement');
  const decorations = placeProps(
    grid,
    spawn,
    portal,
    stream('props'),
    true,
    trees,
    bridges,
    reservations,
    environment,
  );
  const props = [...trees, ...decorations].map((p, id) => ({ ...p, id }));
  const collisionWorld = { meta: { width, height }, tiles: grid.tiles, props, bridges };
  const finalReached = floodFill(grid, spawn, (x, y) =>
    canOccupy(collisionWorld, x + 0.5, y + 0.5, 0.3),
  );
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++)
      if (
        grid.get(x, y) !== Tile.RIVER &&
        canOccupy(collisionWorld, x + 0.5, y + 0.5, 0.3) &&
        !finalReached[y * width + x]
      )
        grid.set(x, y, Tile.FOREST);
  refreshHillEdges(grid);
  const access = new LandscapePlan(collisionWorld, 'access');
  for (const bridge of bridges) {
    if (!validBridgeTerrain(grid, bridge)) return reject('bridge terrain');
    if (!requiredBridgeAccess(access, bridge).ok) return reject('bridge access');
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
  if (!plan) return reject('spawn access');

  if (!requiredNestAccess(access, spawn, nest).ok) return reject('nest access');

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
    environment,
    props,
    bridges,
    spawn,
    portal,
    enemySpawns: plan.enemySpawns,
    pickupSpawns: plan.pickupSpawns,
    encounterSites: [nest],
  };
  return attachLandscapeTrace(
    placeTreasure(
      prepareHilltopObjects(
        composeEnvironment({ ...world, encounterSites: [nest, ...placeGroves(world, [nest])] }),
        [],
        trace,
      ),
    ),
    trace,
  );
}
