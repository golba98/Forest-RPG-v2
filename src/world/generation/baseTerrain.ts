import { Tile } from '../../types/tiles';
import type { GenGrid } from './GenGrid';

/** Solid BORDER ring around the whole map (V2 addition; legacy relied on bounds checks). */
export function applyBorderRing(grid: GenGrid): void {
  const { width, height } = grid;
  for (let x = 0; x < width; x++) {
    grid.set(x, 0, Tile.BORDER);
    grid.set(x, height - 1, Tile.BORDER);
  }
  for (let y = 0; y < height; y++) {
    grid.set(0, y, Tile.BORDER);
    grid.set(width - 1, y, Tile.BORDER);
  }
}
