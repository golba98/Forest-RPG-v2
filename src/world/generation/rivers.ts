import { Tile } from '../../types/tiles';
import type { TilePoint } from '../../types/world';
import type { GenGrid } from './GenGrid';

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
