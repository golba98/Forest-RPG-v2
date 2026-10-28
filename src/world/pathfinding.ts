import type { TilePoint } from '../types/world';

export interface GridSize {
  readonly width: number;
  readonly height: number;
}

/** Tile passability predicate; only called for in-bounds coordinates. */
export type Passable = (x: number, y: number) => boolean;

const CARDINAL: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const DIAGONAL: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

/**
 * BFS reachability from `from` over 4-connected passable tiles.
 *
 * 4-connectivity (rather than the legacy 8) is deliberate: with continuous
 * AABB movement an entity cannot squeeze between two diagonally touching
 * solid tiles, so diagonal-only links are not real paths.
 *
 * Returns a mask (1 = reachable) indexed `y * width + x`. If `from` is out of
 * bounds or impassable the mask is all zeros.
 */
export function floodFill(size: GridSize, from: TilePoint, passable: Passable): Uint8Array {
  const { width, height } = size;
  const visited = new Uint8Array(width * height);
  if (!inGrid(size, from.x, from.y) || !passable(from.x, from.y)) return visited;

  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const start = from.y * width + from.x;
  visited[start] = 1;
  queue[tail++] = start;

  while (head < tail) {
    const idx = queue[head++] ?? 0;
    const x = idx % width;
    const y = (idx - x) / width;
    for (const [dx, dy] of CARDINAL) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (visited[nIdx] === 1 || !passable(nx, ny)) continue;
      visited[nIdx] = 1;
      queue[tail++] = nIdx;
    }
  }
  return visited;
}

/**
 * Breadth-first shortest path on an 8-connected grid without corner cutting
 * (a diagonal step requires both adjacent cardinal tiles to be passable).
 *
 * Returns the tiles to walk through, excluding `from` and including `to`
 * (empty when already there), or null when `to` is unreachable within
 * `maxNodes` expanded nodes.
 */
export function findPath(
  size: GridSize,
  from: TilePoint,
  to: TilePoint,
  passable: Passable,
  maxNodes: number
): TilePoint[] | null {
  const { width, height } = size;
  if (!inGrid(size, from.x, from.y) || !inGrid(size, to.x, to.y)) return null;
  if (from.x === to.x && from.y === to.y) return [];
  if (!passable(to.x, to.y)) return null;

  const start = from.y * width + from.x;
  const goal = to.y * width + to.x;
  const parent = new Map<number, number>([[start, -1]]);
  const queue: number[] = [start];
  let head = 0;
  let expanded = 0;

  const tryVisit = (nIdx: number, current: number): boolean => {
    if (parent.has(nIdx)) return false;
    parent.set(nIdx, current);
    if (nIdx === goal) return true;
    queue.push(nIdx);
    return false;
  };

  while (head < queue.length && expanded < maxNodes) {
    const current = queue[head++] ?? start;
    expanded++;
    const x = current % width;
    const y = (current - x) / width;

    for (const [dx, dy] of CARDINAL) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inGrid(size, nx, ny) || !passable(nx, ny)) continue;
      if (tryVisit(ny * width + nx, current)) return reconstruct(parent, goal, width);
    }
    for (const [dx, dy] of DIAGONAL) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inGrid(size, nx, ny) || !passable(nx, ny)) continue;
      if (!passable(x + dx, y) || !passable(x, y + dy)) continue;
      if (tryVisit(ny * width + nx, current)) return reconstruct(parent, goal, width);
    }
  }
  return null;
}

function inGrid(size: GridSize, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < size.width && y < size.height;
}

function reconstruct(parent: Map<number, number>, goal: number, width: number): TilePoint[] {
  const path: TilePoint[] = [];
  let current = goal;
  let prev = parent.get(current) ?? -1;
  while (prev !== -1) {
    const x = current % width;
    path.push({ x, y: (current - x) / width });
    current = prev;
    prev = parent.get(current) ?? -1;
  }
  return path.reverse();
}
