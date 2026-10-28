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

/** Reclassify after spawn clearing and other edits, including bottom boundaries. */
export function refreshHillEdges(grid: GenGrid): void {
  const mask = Uint8Array.from(grid.tiles, (t) => Number(isHillTerrain(t)));
  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++)
      if (mask[y * grid.width + x]) {
        grid.set(x, y, hillEdgeTile(mask, grid.width, grid.height, x, y) ?? Tile.PLATEAU);
      }
}
