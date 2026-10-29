import { Tile } from '../types/tiles';

export interface RiverGrid {
  readonly tiles: ArrayLike<number>;
  readonly meta: { readonly width: number; readonly height: number };
}
export const riverTerrain = (tile: number): boolean => tile === Tile.RIVER;
/** Historical crossing cells retain their underlying hydrological connection. */
export const channelTerrain = (tile: number): boolean =>
  riverTerrain(tile) || tile === Tile.LOG || tile === Tile.RAMP;
export const CARDINAL = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

export function riverDefects(world: RiverGrid): { x: number; y: number }[] {
  const { width: w, height: h } = world.meta,
    out = [];
  for (let y = 1; y < h - 2; y++)
    for (let x = 1; x < w - 2; x++) {
      const at = (dx: number, dy: number) =>
        channelTerrain(world.tiles[(y + dy) * w + x + dx] ?? 0);
      if (
        (at(0, 0) && at(1, 1) && !at(1, 0) && !at(0, 1)) ||
        (at(1, 0) && at(0, 1) && !at(0, 0) && !at(1, 1))
      )
        out.push({ x, y });
    }
  return out;
}

export class RiverField {
  readonly depth: Float32Array;
  readonly flowX: Float32Array;
  readonly flowY: Float32Array;
  constructor(readonly world: RiverGrid) {
    const { width: w, height: h } = world.meta,
      size = w * h;
    this.depth = new Float32Array(size);
    this.flowX = new Float32Array(size);
    this.flowY = new Float32Array(size);
    const seen = new Uint8Array(size),
      distance = new Int32Array(size).fill(-1);
    const neighbors = (i: number): number[] => {
      const x = i % w,
        y = Math.floor(i / w);
      return CARDINAL.filter(
        ([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h,
      ).map(([dx, dy]) => i + dy * w + dx);
    };
    const wet = (i: number) => channelTerrain(world.tiles[i] ?? 0);
    for (let i = 0; i < size; i++) {
      if (!wet(i) || seen[i]) continue;
      const component = [i];
      seen[i] = 1;
      for (let n = 0; n < component.length; n++)
        for (const ni of neighbors(component[n] ?? 0))
          if (wet(ni) && !seen[ni]) {
            seen[ni] = 1;
            component.push(ni);
          }
      const banks = component.filter((c) => neighbors(c).some((n) => !wet(n)));
      for (const c of banks) this.depth[c] = 1;
      for (let n = 0; n < banks.length; n++)
        for (const ni of neighbors(banks[n] ?? 0))
          if (wet(ni) && !this.depth[ni]) {
            this.depth[ni] = (this.depth[banks[n] ?? 0] ?? 0) + 1;
            banks.push(ni);
          }
      const outlets = component.filter(
        (c) => c % w <= 1 || c % w >= w - 2 || Math.floor(c / w) <= 1 || Math.floor(c / w) >= h - 2,
      );
      if (!outlets.length) continue;
      const outlet = outlets.reduce((a, b) => Math.max(a, b), 0),
        queue = [outlet];
      distance[outlet] = 0;
      for (let n = 0; n < queue.length; n++) {
        const c = queue[n] ?? 0;
        for (const ni of neighbors(c))
          if (wet(ni) && distance[ni] === -1) {
            distance[ni] = (distance[c] ?? 0) + 1;
            queue.push(ni);
            this.flowX[ni] = (c % w) - (ni % w);
            this.flowY[ni] = Math.floor(c / w) - Math.floor(ni / w);
          }
      }
      // Two connected-neighbour smoothing passes remove cardinal stair-step flicker.
      for (let pass = 0; pass < 2; pass++) {
        const xs = this.flowX.slice(),
          ys = this.flowY.slice();
        for (const c of component) {
          let vx = xs[c] ?? 0,
            vy = ys[c] ?? 0;
          for (const ni of neighbors(c))
            if (wet(ni)) {
              vx += xs[ni] ?? 0;
              vy += ys[ni] ?? 0;
            }
          const length = Math.hypot(vx, vy) || 1;
          this.flowX[c] = vx / length;
          this.flowY[c] = vy / length;
        }
      }
    }
  }
}
