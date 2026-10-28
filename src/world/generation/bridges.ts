import { Tile } from '../../types/tiles';
import type { TilePoint } from '../../types/world';
import { floodFill } from '../pathfinding';
import type { Rng } from '../Rng';
import type { GenGrid } from './GenGrid';

const FLOW_CHECK_RANGE = 3;
const PLACE_DIVISOR = 6;
const MAX_BRIDGES_PER_PASS = 3;

function isLand(tile: number): boolean {
  return tile === Tile.GRASS || tile === Tile.FLOWERS || tile === Tile.LOG || tile === Tile.RAMP;
}

/**
 * Lays RAMP bridges across rivers until every land tile connects to spawn
 * over land (rivers are swimmable for the player but block ground enemies),
 * or `maxPasses` passes have run. Each pass bridges up to 3 river tiles that
 * touch both the reachable and an unreachable landmass, preferring tiles near
 * the map centre (legacy scoring: distance + random jitter).
 */
export function placeBridges(grid: GenGrid, spawn: TilePoint, rng: Rng, maxPasses: number): number {
  let placed = 0;
  const landPassable = (x: number, y: number): boolean => isLand(grid.get(x, y));

  for (let pass = 0; pass < maxPasses; pass++) {
    const reached = floodFill(grid, spawn, landPassable);
    const candidates = collectCandidates(grid, reached, rng);
    if (candidates.length === 0) break;

    candidates.sort((a, b) => a.score - b.score);
    const count = Math.min(MAX_BRIDGES_PER_PASS, Math.max(1, Math.floor(candidates.length / PLACE_DIVISOR)));
    for (let i = 0; i < count && i < candidates.length; i++) {
      const c = candidates[i];
      if (c) layBridge(grid, c.x, c.y);
      placed++;
    }
  }
  return placed;
}

interface Candidate {
  readonly x: number;
  readonly y: number;
  readonly score: number;
}

function collectCandidates(grid: GenGrid, reached: Uint8Array, rng: Rng): Candidate[] {
  const { width: w, height: h } = grid;
  const seen = new Uint8Array(w * h);
  const out: Candidate[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (reached[idx] === 1 || grid.get(x, y) === Tile.RAMP || !isLand(grid.get(x, y))) continue;
      // (x, y) is unreachable land: look for river tiles next to it that also touch reached land.
      for (const n of grid.neighbors8(x, y)) {
        const nIdx = n.y * w + n.x;
        if (seen[nIdx] === 1 || grid.get(n.x, n.y) !== Tile.RIVER) continue;
        seen[nIdx] = 1;
        const touchesReached = grid
          .neighbors8(n.x, n.y)
          .some((m) => reached[m.y * w + m.x] === 1 && isLand(grid.get(m.x, m.y)));
        if (touchesReached) {
          out.push({ x: n.x, y: n.y, score: Math.hypot(n.x - w / 2, n.y - h / 2) + rng.nextFloat() * 20 });
        }
      }
    }
  }
  return out;
}

/** Places a RAMP and extends it across the river perpendicular to its flow. */
function layBridge(grid: GenGrid, x: number, y: number): void {
  grid.set(x, y, Tile.RAMP);
  let horizontalRiver = 0;
  let verticalRiver = 0;
  for (let d = -FLOW_CHECK_RANGE; d <= FLOW_CHECK_RANGE; d++) {
    if (grid.inBounds(x + d, y) && grid.get(x + d, y) === Tile.RIVER) horizontalRiver++;
    if (grid.inBounds(x, y + d) && grid.get(x, y + d) === Tile.RIVER) verticalRiver++;
  }
  const extend = (dx: number, dy: number): void => {
    let cx = x + dx;
    let cy = y + dy;
    while (grid.inBounds(cx, cy) && grid.get(cx, cy) === Tile.RIVER) {
      grid.set(cx, cy, Tile.RAMP);
      cx += dx;
      cy += dy;
    }
  };
  if (horizontalRiver > verticalRiver) {
    extend(0, 1);
    extend(0, -1);
  } else {
    extend(1, 0);
    extend(-1, 0);
  }
}
