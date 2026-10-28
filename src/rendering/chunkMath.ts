/**
 * Pixi-free terrain chunk math (unit-tested in node).
 */

/** Axis-aligned rectangle in world pixels. */
export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Inclusive chunk index range. Empty when `minCol > maxCol` or `minRow > maxRow`. */
export interface ChunkRange {
  minCol: number;
  minRow: number;
  maxCol: number;
  maxRow: number;
}

export function createChunkRange(): ChunkRange {
  return { minCol: 0, minRow: 0, maxCol: -1, maxRow: -1 };
}

export function isChunkRangeEmpty(range: ChunkRange): boolean {
  return range.minCol > range.maxCol || range.minRow > range.maxRow;
}

export function chunkRangeContains(range: ChunkRange, col: number, row: number): boolean {
  return col >= range.minCol && col <= range.maxCol && row >= range.minRow && row <= range.maxRow;
}

/** Number of chunks needed along one axis to cover `tiles` tiles. */
export function chunksAlong(tiles: number, chunkTiles: number): number {
  if (tiles <= 0 || chunkTiles <= 0) return 0;
  return Math.ceil(tiles / chunkTiles);
}

/**
 * Chunks overlapped by `rect` (world px). Edges are half-open: a rect ending
 * exactly on a chunk boundary does not include the next chunk.
 * Writes into `out` (allocation-free when provided).
 */
export function computeVisibleChunks(
  rect: Readonly<WorldRect>,
  chunkPx: number,
  cols: number,
  rows: number,
  out: ChunkRange = createChunkRange(),
): ChunkRange {
  if (chunkPx <= 0 || cols <= 0 || rows <= 0 || rect.width <= 0 || rect.height <= 0) {
    out.minCol = 0;
    out.minRow = 0;
    out.maxCol = -1;
    out.maxRow = -1;
    return out;
  }
  out.minCol = Math.max(0, Math.floor(rect.x / chunkPx));
  out.minRow = Math.max(0, Math.floor(rect.y / chunkPx));
  out.maxCol = Math.min(cols - 1, Math.ceil((rect.x + rect.width) / chunkPx) - 1);
  out.maxRow = Math.min(rows - 1, Math.ceil((rect.y + rect.height) / chunkPx) - 1);
  return out;
}

export function countChunks(range: ChunkRange): number {
  if (isChunkRangeEmpty(range)) return 0;
  return (range.maxCol - range.minCol + 1) * (range.maxRow - range.minRow + 1);
}
