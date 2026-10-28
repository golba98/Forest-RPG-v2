import { isHillTerrain } from '../TerrainTopology';
import { Tile } from '../../types/tiles';
import type { TileId } from '../../types/tiles';
import type { PerlinNoise } from '../Noise';
import type { Rng } from '../Rng';
import type { GenGrid } from './GenGrid';

const HILL_NOISE_SCALE = 0.035;
const HILL_THRESHOLD = 0.48;
const HILL_MARGIN = 4;
const CA_ITERATIONS = 5;
const CA_BIRTH = 5;
const CA_SURVIVE = 4;
const PRUNE_PASSES = 8;

/**
 * Part 3: hill plateaus from thresholded noise, smoothed by a cellular
 * automaton, pruned of tips and 1-tile bars, then autotiled. Interior cells are explicit solid PLATEAU terrain.
 * Waterways and crossing endpoints are protected before deriving edges.
 */
export function generateHills(grid: GenGrid, rng: Rng, noise: PerlinNoise): void {
  const { width: w, height: h } = grid;
  const offset = rng.nextFloat() * 99999;
  let hill: Uint8Array = new Uint8Array(w * h);

  for (let y = HILL_MARGIN; y < h - HILL_MARGIN; y++) {
    for (let x = HILL_MARGIN; x < w - HILL_MARGIN; x++) {
      if (
        noise.noise2(x * HILL_NOISE_SCALE + offset, y * HILL_NOISE_SCALE + offset) > HILL_THRESHOLD
      ) {
        hill[y * w + x] = 1;
      }
    }
  }

  for (let i = 0; i < CA_ITERATIONS; i++) hill = smoothStep(hill, w, h);

  for (let pass = 0; pass < PRUNE_PASSES; pass++) {
    const result = pruneStep(hill, w, h);
    hill = result.grid;
    if (!result.changed) break;
  }

  // Preserve waterways and the landings of previously placed crossings.
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const tile = grid.get(x, y);
      if (tile === Tile.RIVER) hill[y * w + x] = 0;
      if (tile === Tile.RAMP || tile === Tile.LOG)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) hill[(y + dy) * w + x + dx] = 0;
    }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (hill[y * w + x] !== 1) continue;
      const tile = hillEdgeTile(hill, w, h, x, y);
      grid.set(x, y, tile ?? Tile.PLATEAU);
    }
  }
}

function smoothStep(src: Uint8Array, w: number, h: number): Uint8Array {
  const next = new Uint8Array(src);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let neighbours = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx !== 0 || dy !== 0) && src[(y + dy) * w + x + dx] === 1) neighbours++;
        }
      }
      const idx = y * w + x;
      next[idx] =
        src[idx] === 1 ? (neighbours >= CA_SURVIVE ? 1 : 0) : neighbours >= CA_BIRTH ? 1 : 0;
    }
  }
  return next;
}

/** Removes isolated cells / tips (<2 cardinal neighbours) and straight 1-tile bars. */
function pruneStep(src: Uint8Array, w: number, h: number): { grid: Uint8Array; changed: boolean } {
  const next = new Uint8Array(src);
  let changed = false;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (src[idx] !== 1) continue;
      const n = src[idx - w] === 1;
      const s = src[idx + w] === 1;
      const e = src[idx + 1] === 1;
      const west = src[idx - 1] === 1;
      const count = Number(n) + Number(s) + Number(e) + Number(west);
      const thinBar = count === 2 && ((n && s) || (e && west));
      if (count < 2 || thinBar) {
        next[idx] = 0;
        changed = true;
      }
    }
  }
  return { grid: next, changed };
}

/** 8-direction autotile from cardinal neighbours; null for interior cells. */
function hillEdgeTile(hill: Uint8Array, w: number, h: number, x: number, y: number): TileId | null {
  const at = (dx: number, dy: number): boolean => {
    const nx = x + dx;
    const ny = y + dy;
    return nx >= 0 && ny >= 0 && nx < w && ny < h && hill[ny * w + nx] === 1;
  };
  const n = at(0, -1);
  const s = at(0, 1);
  const e = at(1, 0);
  const west = at(-1, 0);

  if (!n && !west) return Tile.HILL_NW;
  if (!n && !e) return Tile.HILL_NE;
  if (!s && !west) return Tile.HILL_SW;
  if (!s && !e) return Tile.HILL_SE;
  if (!n) return Tile.HILL_N;
  if (!s) return Tile.HILL_S;
  if (!west) return Tile.HILL_W;
  if (!e) return Tile.HILL_E;
  return null;
}

/** Reclassify after spawn clearing and other edits, including bottom boundaries. Stairs are kept. */
export function refreshHillEdges(grid: GenGrid): void {
  const mask = Uint8Array.from(grid.tiles, (t) => Number(isHillTerrain(t)));
  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++)
      if (mask[y * grid.width + x] && grid.get(x, y) !== Tile.STAIRS) {
        grid.set(x, y, hillEdgeTile(mask, grid.width, grid.height, x, y) ?? Tile.PLATEAU);
      }
}

/** Straight hill edges and the direction (dx, dy) from the edge down to low ground. */
const STAIR_EDGES: ReadonlyArray<readonly [number, number, number]> = [
  [Tile.HILL_S, 0, 1],
  [Tile.HILL_E, 1, 0],
  [Tile.HILL_W, -1, 0],
  [Tile.HILL_N, 0, -1],
];
/** Plateau cells per staircase; every hill with a walkable top gets 1–3. */
const CELLS_PER_STAIR = 140;
const MAX_STAIRS = 3;
const MIN_STAIR_SPACING = 10;

/** Ground a stair may land on. FOREST becomes walkable woodland later in generation. */
function isLowGround(tile: number): boolean {
  return tile === Tile.GRASS || tile === Tile.FLOWERS || tile === Tile.MUD || tile === Tile.FOREST;
}

/**
 * Cuts stone stairs into straight hill edges so every hill top is reachable on
 * foot (jumping a cliff edge is the other way up). A stair needs plateau
 * behind it, two tiles of landable ground in front and hill on both sides.
 * South-facing edges are preferred: their steps face the camera.
 */
export function placeStairs(grid: GenGrid, rng: Rng): void {
  const { width: w, height: h } = grid;
  const component = new Int32Array(w * h).fill(-1);
  let next = 0;
  for (let start = 0; start < w * h; start++) {
    if (component[start] !== -1 || !isHillTerrain(grid.tiles[start] ?? 0)) continue;
    const id = next++;
    const cells: number[] = [];
    const queue = [start];
    component[start] = id;
    while (queue.length) {
      const i = queue.pop() ?? 0;
      cells.push(i);
      const x = i % w, y = Math.floor(i / w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy, ni = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || component[ni] !== -1 || !isHillTerrain(grid.tiles[ni] ?? 0)) continue;
        component[ni] = id;
        queue.push(ni);
      }
    }
    const plateau = cells.filter((i) => grid.tiles[i] === Tile.PLATEAU).length;
    if (plateau === 0) continue;
    const candidates: Array<{ x: number; y: number; rank: number }> = [];
    for (const i of cells) {
      const x = i % w, y = Math.floor(i / w);
      const tile = grid.tiles[i];
      STAIR_EDGES.forEach(([edge, dx, dy], rank) => {
        if (tile !== edge) return;
        const at = (k: number, side = 0) => grid.inBounds(x + dx * k + dy * side, y + dy * k + dx * side) ? grid.get(x + dx * k + dy * side, y + dy * k + dx * side) : Tile.BORDER;
        if (at(-1) !== Tile.PLATEAU || !isLowGround(at(1)) || !(isLowGround(at(2)) || at(2) === Tile.RAMP || at(2) === Tile.LOG)) return;
        // Cliff (or more hill) on both sides so the steps sit inside the edge.
        if (!isHillTerrain(at(0, 1)) || !isHillTerrain(at(0, -1))) return;
        candidates.push({ x, y, rank });
      });
    }
    const wanted = Math.min(MAX_STAIRS, Math.max(1, Math.round(plateau / CELLS_PER_STAIR)));
    const placed: Array<{ x: number; y: number }> = [];
    const shuffled = rng.shuffle(candidates).sort((a, b) => a.rank - b.rank);
    for (const c of shuffled) {
      if (placed.length >= wanted) break;
      if (placed.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < MIN_STAIR_SPACING)) continue;
      grid.set(c.x, c.y, Tile.STAIRS);
      placed.push(c);
    }
  }
}
