import { Tile } from '../../types/tiles';
import type { EnemyType } from '../../types/entities';
import type { EnemySpawn, PickupSpawn, PropKind, TilePoint, WorldProp } from '../../types/world';
import { floodFill } from '../pathfinding';
import type { Rng } from '../Rng';
import { tileProperties } from '../TileMap';
import type { GenGrid } from './GenGrid';

/** Tiles around spawn kept free of hills, props and spawns (legacy SPAWN_CLEAR_RADIUS). */
export const SPAWN_CLEAR_RADIUS = 3;

const DECOR_MAX_DENSITY = 0.07;
const DECOR_MAX_OBSTACLE_DENSITY = 0.02;
const DECOR_WALKABLE_CHANCE = 0.06;
const DECOR_OBSTACLE_CHANCE = 0.025;

const WALKABLE_DECOR: readonly PropKind[] = [
  'bush_small',
  'flower_clump',
  'flower_pink',
  'flower_yellow',
  'rock_pebble',
  'rock_boulder',
];
const OBSTACLE_DECOR: readonly PropKind[] = ['bush_obstacle', 'log_vertical', 'log_stump', 'log_horizontal'];

/** 3×3 ring around a tile in cyclic order; consecutive entries share an edge. */
const RING: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];

function isOpen(grid: GenGrid, x: number, y: number): boolean {
  return grid.inBounds(x, y) && !tileProperties(grid.get(x, y)).solid;
}

export function restoreSpawnClearing(grid: GenGrid, spawn: TilePoint): void {
  for (let dy = -SPAWN_CLEAR_RADIUS; dy <= SPAWN_CLEAR_RADIUS; dy++) {
    for (let dx = -SPAWN_CLEAR_RADIUS; dx <= SPAWN_CLEAR_RADIUS; dx++) {
      const x = spawn.x + dx;
      const y = spawn.y + dy;
      if (grid.inBounds(x, y)) grid.set(x, y, Tile.GRASS);
    }
  }
}

/** Part 4: every non-solid tile the player cannot reach from spawn becomes FOREST. */
export function pruneUnreachable(grid: GenGrid, spawn: TilePoint): void {
  const reached = floodFill(grid, spawn, (x, y) => isOpen(grid, x, y));
  for (let i = 0; i < grid.tiles.length; i++) {
    if (reached[i] !== 1 && !tileProperties(grid.tiles[i] ?? 0).solid) grid.tiles[i] = Tile.FOREST;
  }
}

/** Nearest GRASS tile to the map centre (square spiral) further than the clear radius from spawn. */
export function findPortalTile(grid: GenGrid, spawn: TilePoint): TilePoint | null {
  const midX = Math.floor(grid.width / 2);
  const midY = Math.floor(grid.height / 2);
  const maxR = Math.max(grid.width, grid.height);
  for (let r = 0; r < maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = midX + dx;
        const y = midY + dy;
        if (!grid.inBounds(x, y) || grid.get(x, y) !== Tile.GRASS) continue;
        if (Math.hypot(x - spawn.x, y - spawn.y) > SPAWN_CLEAR_RADIUS) return { x, y };
      }
    }
  }
  return null;
}

/**
 * Scatters decorative props over grass. Solid obstacles are only placed where
 * they cannot disconnect anything: the open cells of the surrounding ring must
 * form a single arc, so any path through the tile can detour around it.
 */
export function placeProps(
  grid: GenGrid,
  spawn: TilePoint,
  portal: TilePoint,
  rng: Rng,
  allowObstacles: boolean
): WorldProp[] {
  const grass: TilePoint[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.get(x, y) === Tile.GRASS) grass.push({ x, y });
    }
  }
  if (grass.length === 0) return [];

  const maxDecor = Math.max(4, Math.round(grass.length * DECOR_MAX_DENSITY));
  const maxObstacles = Math.max(1, Math.round(grass.length * DECOR_MAX_OBSTACLE_DENSITY));
  const blocked = new Uint8Array(grid.width * grid.height);
  const occupied = new Uint8Array(grid.width * grid.height);
  const props: WorldProp[] = [];
  let obstacles = 0;

  const passable = (x: number, y: number): boolean => isOpen(grid, x, y) && blocked[y * grid.width + x] !== 1;
  const add = (tile: TilePoint, kind: PropKind, solid: boolean): void => {
    const idx = tile.y * grid.width + tile.x;
    props.push({ id: props.length, kind, tileX: tile.x, tileY: tile.y, solid });
    occupied[idx] = 1;
    if (solid) blocked[idx] = 1;
  };
  const nearProtected = (t: TilePoint): boolean =>
    Math.hypot(t.x - spawn.x, t.y - spawn.y) <= SPAWN_CLEAR_RADIUS || Math.hypot(t.x - portal.x, t.y - portal.y) <= 1;

  for (const tile of rng.shuffle(grass.slice())) {
    if (props.length >= maxDecor) break;
    if (nearProtected(tile)) continue;
    const roll = rng.nextFloat();
    if (allowObstacles && obstacles < maxObstacles && roll < DECOR_OBSTACLE_CHANCE) {
      const kind = rng.pick(OBSTACLE_DECOR);
      if (isSafeToBlock(tile, passable)) {
        add(tile, kind, true);
        obstacles++;
      }
    } else if (roll < DECOR_OBSTACLE_CHANCE + DECOR_WALKABLE_CHANCE) {
      add(tile, rng.pick(WALKABLE_DECOR), false);
    }
  }

  // One landmark hole on the free grass tile nearest the centre (outside the spawn clearing).
  const anchorX = Math.floor(grid.width / 2);
  const anchorY = Math.floor(grid.height / 2);
  const byDistance = grass
    .filter((t) => occupied[t.y * grid.width + t.x] !== 1 && !nearProtected(t))
    .sort((a, b) => Math.hypot(a.x - anchorX, a.y - anchorY) - Math.hypot(b.x - anchorX, b.y - anchorY));
  const holeTile = byDistance[0];
  if (holeTile) add(holeTile, 'hole', false);

  return props;
}

function isSafeToBlock(tile: TilePoint, passable: (x: number, y: number) => boolean): boolean {
  const open = RING.map(([dx, dy]) => passable(tile.x + dx, tile.y + dy));
  // Count maximal runs of open cells around the cyclic ring that contain a cardinal neighbour.
  let arcsWithCardinal = 0;
  const start = open.findIndex((o) => !o);
  if (start === -1) return true; // fully open ring
  let inArc = false;
  let arcHasCardinal = false;
  for (let k = 1; k <= RING.length; k++) {
    const i = (start + k) % RING.length;
    if (open[i]) {
      inArc = true;
      if (i % 2 === 1) arcHasCardinal = true; // odd ring slots are the cardinal neighbours
    } else if (inArc) {
      if (arcHasCardinal) arcsWithCardinal++;
      inArc = false;
      arcHasCardinal = false;
    }
  }
  return arcsWithCardinal <= 1;
}

export interface SpawnPlan {
  readonly enemySpawns: EnemySpawn[];
  readonly pickupSpawns: PickupSpawn[];
}

/**
 * Enemies (even mantis/maggot split plus one beetle boss) and coins on
 * distinct reachable grass tiles away from spawn, portal and solid props.
 * Returns null if the map has too few candidate tiles.
 */
export function planSpawns(
  grid: GenGrid,
  spawn: TilePoint,
  portal: TilePoint,
  props: readonly WorldProp[],
  enemyCount: number,
  coinCount: number,
  rng: Rng
): SpawnPlan | null {
  const solidProp = new Uint8Array(grid.width * grid.height);
  for (const p of props) if (p.solid) solidProp[p.tileY * grid.width + p.tileX] = 1;
  const reached = floodFill(grid, spawn, (x, y) => isOpen(grid, x, y) && solidProp[y * grid.width + x] !== 1);

  const available: TilePoint[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const idx = y * grid.width + x;
      if (reached[idx] !== 1 || solidProp[idx] === 1 || grid.get(x, y) !== Tile.GRASS) continue;
      if (Math.hypot(x - spawn.x, y - spawn.y) <= SPAWN_CLEAR_RADIUS) continue;
      if (Math.hypot(x - portal.x, y - portal.y) <= 1) continue;
      available.push({ x, y });
    }
  }
  if (available.length < enemyCount + 1 + coinCount) return null;
  rng.shuffle(available);

  const take = (): TilePoint => available.pop() ?? spawn;
  const enemySpawns: EnemySpawn[] = [];
  for (let i = 0; i < enemyCount; i++) {
    const type: EnemyType = i % 2 === 0 ? 'mantis' : 'maggot';
    const t = take();
    enemySpawns.push({ type, x: t.x, y: t.y });
  }
  const boss = take();
  enemySpawns.push({ type: 'beetle', x: boss.x, y: boss.y });

  const pickupSpawns: PickupSpawn[] = [];
  for (let i = 0; i < coinCount; i++) {
    const t = take();
    pickupSpawns.push({ type: 'coin', x: t.x, y: t.y });
  }
  return { enemySpawns, pickupSpawns };
}
