import { Tile } from '../../types/tiles';
import type { TilePoint } from '../../types/world';
import type { PerlinNoise } from '../Noise';
import type { Rng } from '../Rng';
import type { ClearArea, GenGrid } from './GenGrid';

/** Rasterize the swept channel, measuring from actual cell centres, not rounded stamps. */
export function strokeRiver(grid: GenGrid, points: readonly TilePoint[], radius = 1.5): void {
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)],
      b = points[i];
    if (!a || !b) continue;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4));
    for (let s = 0; s <= steps; s++) {
      const p = s / steps,
        cx = a.x + (b.x - a.x) * p,
        cy = a.y + (b.y - a.y) * p;
      for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++)
        for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
          if (!grid.inBounds(x, y) || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > radius) continue;
          grid.set(x, y, Tile.RIVER);
        }
    }
  }
}

/** Keep the complete channel outside the seven-cell spawn clearing before hills exist. */
function detour(a: number, b: number, middleA: number, middleB: number, side: number): number {
  const influence = Math.max(0, Math.min(1, (16 - Math.abs(a - middleA)) / 10));
  return middleB + side * Math.max(side * (b - middleB), 6.5 * influence);
}

function course(
  grid: GenGrid,
  rng: Rng,
  noise: PerlinNoise,
  horizontal: boolean,
  offset: number,
): TilePoint[] {
  const length = horizontal ? grid.width : grid.height,
    cross = horizontal ? grid.height : grid.width;
  const middleA = Math.floor(length / 2) + 0.5,
    middleB = Math.floor(cross / 2) + 0.5;
  const phase = rng.nextFloat() * 500,
    side = offset < 0 ? -1 : 1;
  const points: TilePoint[] = [];
  for (let a = 0.5; a < length; a += 0.5) {
    const wobble = (noise.noise2(a * 0.035, phase) - 0.47) * Math.min(28, cross * 0.22);
    const b = Math.max(
      3,
      Math.min(cross - 3, detour(a, middleB + offset + wobble, middleA, middleB, side)),
    );
    points.push(horizontal ? { x: a, y: b } : { x: b, y: a });
  }
  // The radius changes on a long wavelength; neighbouring strokes overlap throughout.
  for (let i = 1; i < points.length; i++)
    strokeRiver(
      grid,
      points.slice(i - 1, i + 1),
      1.45 + noise.noise2(i * 0.012, phase + 99) * 0.35,
    );
  return points;
}

export function carveMainRiver(grid: GenGrid, rng: Rng, noise: PerlinNoise): void {
  const horizontal = rng.chance(0.5);
  const points = course(grid, rng, noise, horizontal, rng.chance(0.5) ? -7 : 7);
  for (const fraction of [0.25, 0.75]) {
    const start = points[Math.floor(points.length * fraction)];
    if (!start) continue;
    const end = horizontal
      ? { x: start.x + (rng.nextFloat() - 0.5) * 12, y: rng.chance(0.5) ? 0.5 : grid.height - 0.5 }
      : { x: rng.chance(0.5) ? 0.5 : grid.width - 0.5, y: start.y + (rng.nextFloat() - 0.5) * 12 };
    strokeRiver(grid, [start, end], 1.5);
  }
}

export function carveGuidedRivers(
  grid: GenGrid,
  _clear: ClearArea,
  rng: Rng,
  noise: PerlinNoise,
): void {
  const horizontal = rng.chance(0.5),
    cross = horizontal ? grid.height : grid.width;
  course(grid, rng, noise, horizontal, (rng.chance(0.5) ? -1 : 1) * Math.max(7, cross * 0.24));
}

/** Fill only checkerboard contacts; do not erase tips or close legitimate islands. */
export function smoothRiverDiagonals(grid: GenGrid): void {
  for (let y = 1; y < grid.height - 2; y++)
    for (let x = 1; x < grid.width - 2; x++) {
      const a = grid.get(x, y) === Tile.RIVER,
        b = grid.get(x + 1, y) === Tile.RIVER;
      const c = grid.get(x, y + 1) === Tile.RIVER,
        d = grid.get(x + 1, y + 1) === Tile.RIVER;
      if (!((a && d && !b && !c) || (b && c && !a && !d))) continue;
      const cells = a
        ? ([
            [x + 1, y],
            [x, y + 1],
          ] as const)
        : ([
            [x, y],
            [x + 1, y + 1],
          ] as const);
      if (
        cells.some(
          ([cx, cy]) =>
            Math.abs(cx - Math.floor(grid.width / 2)) <= 3 &&
            Math.abs(cy - Math.floor(grid.height / 2)) <= 3,
        )
      )
        continue;
      for (const [cx, cy] of cells) grid.set(cx, cy, Tile.RIVER);
    }
}

export function applySpawnSafeArea(grid: GenGrid, clear: ClearArea): void {
  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++)
      if (
        x > clear.startX &&
        x < clear.endX &&
        y > clear.startY &&
        y < clear.endY &&
        grid.get(x, y) === Tile.FOREST
      )
        grid.set(x, y, Tile.GRASS);
}
