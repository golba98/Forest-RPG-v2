import type { TileId } from '../../types/tiles';
import type { TilePoint } from '../../types/world';
import type { TileGrid } from '../TileMap';

/** Mutable tile buffer used while a world is being generated. */
export class GenGrid implements TileGrid {
  readonly tiles: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    fill: TileId
  ) {
    this.tiles = new Uint8Array(width * height).fill(fill);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Tile at (x, y); callers must pass in-bounds coordinates. */
  get(x: number, y: number): number {
    return this.tiles[y * this.width + x] ?? 0;
  }

  set(x: number, y: number, tile: TileId): void {
    this.tiles[y * this.width + x] = tile;
  }

  /** In-bounds 8-neighbours of (x, y) in row-major order (legacy `neighbors8`). */
  neighbors8(x: number, y: number): TilePoint[] {
    const out: TilePoint[] = [];
    for (let ny = y - 1; ny <= y + 1; ny++) {
      for (let nx = x - 1; nx <= x + 1; nx++) {
        if (nx === x && ny === y) continue;
        if (this.inBounds(nx, ny)) out.push({ x: nx, y: ny });
      }
    }
    return out;
  }
}

/**
 * The protected player-start rectangle (legacy "clear area"): 75–90% of the
 * map, centred. Bounds are fractional; "inside" is a strict comparison.
 */
export interface ClearArea {
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
  readonly startX: number;
  readonly endX: number;
  readonly startY: number;
  readonly endY: number;
}

export function isInClearArea(area: ClearArea, x: number, y: number): boolean {
  return x > area.startX && x < area.endX && y > area.startY && y < area.endY;
}
