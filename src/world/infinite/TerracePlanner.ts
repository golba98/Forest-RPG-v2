import { BIOMES } from '../Biomes';
import { coordinateHash, valueNoise, addressKey } from './coordinates';

const SIZE = 64;
const NORMALS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
interface TerracePlan {
  readonly levels: Uint8Array;
  readonly stairs: ReadonlySet<number>;
}

/** Globally owned, bounded plans. No chunk, visitation order or mutable random stream is input.
 * Each crown stays inside its owner's cell, four tiles inside its parent. A crown is accepted
 * only after finding a three-wide, two-deep stair approach connecting it to that parent. */
export class TerracePlanner {
  private readonly plans = new Map<string, TerracePlan>();
  constructor(
    private readonly seed: number,
    private readonly base: (x: number, y: number) => boolean,
    private readonly biome: (x: number, y: number) => number,
  ) {}
  private at(x: number, y: number) {
    const cx = Math.floor(x / SIZE),
      cy = Math.floor(y / SIZE),
      key = addressKey(cx, cy);
    let plan = this.plans.get(key);
    if (!plan) {
      plan = this.build(cx * SIZE, cy * SIZE);
      if (this.plans.size >= 64) {
        const oldest = this.plans.keys().next().value;
        if (oldest !== undefined) this.plans.delete(oldest);
      }
      this.plans.set(key, plan);
    }
    return { plan, index: (y - cy * SIZE) * SIZE + x - cx * SIZE };
  }
  heightAt(x: number, y: number): number {
    const cx = Math.floor(x / SIZE),
      cy = Math.floor(y / SIZE);
    const cached = this.plans.get(addressKey(cx, cy));
    if (cached) return cached.levels[(y - cy * SIZE) * SIZE + x - cx * SIZE] ?? 0;
    if (!this.base(x, y)) return 0;
    const { plan, index } = this.at(x, y);
    return plan.levels[index] ?? 0;
  }
  stairAt(x: number, y: number): boolean {
    const { plan, index } = this.at(x, y);
    return plan.stairs.has(index);
  }
  private build(ox: number, oy: number): TerracePlan {
    const levels = new Uint8Array(SIZE * SIZE),
      stairs = new Set<number>();
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) levels[y * SIZE + x] = Number(this.base(ox + x, oy + y));
    const distances = (level: number) => {
      const d = new Uint8Array(SIZE * SIZE);
      for (let y = 1; y < SIZE - 1; y++)
        for (let x = 1; x < SIZE - 1; x++) {
          const i = y * SIZE + x;
          if (levels[i] === level)
            d[i] =
              1 +
              Math.min(d[i - 1] ?? 0, d[i - SIZE] ?? 0, d[i - SIZE - 1] ?? 0, d[i - SIZE + 1] ?? 0);
        }
      for (let y = SIZE - 2; y > 0; y--)
        for (let x = SIZE - 2; x > 0; x--) {
          const i = y * SIZE + x;
          if (d[i])
            d[i] = Math.min(
              d[i] ?? 0,
              1 +
                Math.min(
                  d[i + 1] ?? 0,
                  d[i + SIZE] ?? 0,
                  d[i + SIZE - 1] ?? 0,
                  d[i + SIZE + 1] ?? 0,
                ),
            );
        }
      return d;
    };
    for (let level = 2; level <= 3; level++) {
      const d = distances(level - 1);
      let center = -1,
        rank = -Infinity;
      for (let y = 8; y < SIZE - 8; y++)
        for (let x = 8; x < SIZE - 8; x++) {
          const i = y * SIZE + x;
          if ((d[i] ?? 0) < 10) continue;
          const b = BIOMES[this.biome(ox + x, oy + y)];
          if (!b) continue;
          if (level > b.landform.maxTier) continue;
          if (
            coordinateHash(this.seed, ox, oy, 'terrace-frequency') % 100 >=
            b.landform.terraceFrequency
          )
            continue;
          const score =
            (d[i] ?? 0) + valueNoise(this.seed, (ox + x) / 17, (oy + y) / 17, 'terrace-center') * 4;
          if (score > rank) {
            rank = score;
            center = i;
          }
        }
      if (center < 0) break;
      const cx = center % SIZE,
        cy = Math.floor(center / SIZE);
      const radius = Math.min(level === 2 ? 18 : 9, (d[center] ?? 0) - 4);
      const proposed = new Set<number>();
      const aspect = 0.78 + (coordinateHash(this.seed, ox, oy, 'terrace-axis') % 100) / 250;
      for (let y = 4; y < SIZE - 4; y++)
        for (let x = 4; x < SIZE - 4; x++) {
          const i = y * SIZE + x;
          if ((d[i] ?? 0) < 5) continue;
          const warp =
            (valueNoise(this.seed, (ox + x) / 8, (oy + y) / 8, `terrace-${level}`) - 0.5) *
            (level === 2 ? 8 : 4);
          const bend =
            (valueNoise(this.seed, (ox + x) / 17, (oy + y) / 17, 'terrace-bend') - 0.5) * 5;
          if (Math.hypot((x - cx + bend) * aspect, (y - cy) / aspect) < radius + warp)
            proposed.add(i);
        }
      // Keep the connected crown containing its center; clipping never leaves isolated shelves.
      const cells = [center],
        connected = new Set([center]);
      for (let q = 0; q < cells.length; q++)
        for (const [nx, ny] of NORMALS) {
          const i = (cells[q] ?? 0) + nx + ny * SIZE;
          if (proposed.has(i) && !connected.has(i)) {
            connected.add(i);
            cells.push(i);
          }
        }
      const entrances: number[] = [];
      for (const i of cells)
        for (const [nx, ny] of NORMALS) {
          const x = i % SIZE,
            y = Math.floor(i / SIZE);
          let valid = true;
          for (let side = -1; side <= 1 && valid; side++)
            for (let depth = -2; depth <= 2; depth++) {
              const at = (y + ny * depth + nx * side) * SIZE + x + nx * depth - ny * side;
              if (depth <= 0 ? !connected.has(at) : connected.has(at) || levels[at] !== level - 1) {
                valid = false;
                break;
              }
            }
          if (valid) {
            entrances.push(i);
            break;
          }
        }
      if (!entrances.length) break;
      entrances.sort(
        (a, b) =>
          coordinateHash(this.seed, ox + (a % SIZE), oy + Math.floor(a / SIZE), 'terrace-stair') -
            coordinateHash(
              this.seed,
              ox + (b % SIZE),
              oy + Math.floor(b / SIZE),
              'terrace-stair',
            ) || a - b,
      );
      for (const i of cells) levels[i] = level;
      // Additional distant entrances improve circulation without erasing cliff silhouettes.
      const accepted: number[] = [];
      for (const i of entrances)
        if (
          accepted.every(
            (a) =>
              Math.hypot((a % SIZE) - (i % SIZE), Math.floor(a / SIZE) - Math.floor(i / SIZE)) >=
              12,
          )
        ) {
          accepted.push(i);
          stairs.add(i);
          if (accepted.length === 3) break;
        }
    }
    return { levels, stairs };
  }
}
