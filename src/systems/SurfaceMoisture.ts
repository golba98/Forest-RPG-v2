import { Tile } from '../types/tiles';
import type { WorldData } from '../types/world';
import { bridgeAtTile, bridgeGeometry, boundsOverlap } from '../world/BridgeGeometry';
import { propFootprint } from '../world/ObjectSemantics';
import { cachedHillBounds, isRaisedSurface } from '../world/HillCollisionGeometry';
import { elevationMask } from '../world/ElevationTopology';
import { surfaceAt } from './SurfaceState';

export function surfaceHash(x: number, y: number, seed = 0): number {
  let h = Math.imul(x ^ seed, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}
export interface MoistureView {
  readonly wetness: ArrayLike<number>;
  readonly puddles: ArrayLike<number>;
}
export interface SavedMoisture {
  version: 1;
  wetness: number[];
  puddles: number[];
  remainderMs: number;
}
interface Site {
  x: number;
  y: number;
  rx: number;
  ry: number;
  salt: number;
}
export interface SurfaceSample {
  material: 'grass' | 'soil' | 'river' | 'puddle' | 'deck';
  x: number;
  y: number;
}
const dryTiles = new Set<number>([Tile.GRASS, Tile.FLOWERS, Tile.MUD]);

/** Stable terrain descriptors, independent of viewport and renderer chunk lifetimes. */
export class SurfaceSites {
  readonly eligible: number[] = [];
  readonly pools = new Map<number, Site>();
  private obstacles = new Map<
    number,
    Array<{ minX: number; minY: number; maxX: number; maxY: number }>
  >();
  constructor(readonly world: WorldData) {
    const { width: w, height: h, seed } = world.meta;
    const add = (b: { minX: number; minY: number; maxX: number; maxY: number }) => {
      for (let y = Math.max(0, Math.floor(b.minY)); y < Math.min(h, Math.ceil(b.maxY)); y++)
        for (let x = Math.max(0, Math.floor(b.minX)); x < Math.min(w, Math.ceil(b.maxX)); x++) {
          const i = y * w + x,
            list = this.obstacles.get(i) ?? [];
          list.push(b);
          this.obstacles.set(i, list);
        }
    };
    for (const p of world.props) {
      const b = propFootprint(p);
      if (b)
        add({
          minX: p.tileX + b.minX,
          minY: p.tileY + b.minY,
          maxX: p.tileX + b.maxX,
          maxY: p.tileY + b.maxY,
        });
    }
    // Cover the nest art, not just its smaller physical base; rain cannot land on its face.
    for (const site of world.encounterSites ?? [])
      if (site.kind === 'nest')
        add({ minX: site.x - 1.5, minY: site.y - 2.5, maxX: site.x + 1.5, maxY: site.y + 0.5 });
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x,
          tile = world.tiles[i] ?? Tile.BORDER,
          hash = surfaceHash(x, y, seed);
        if (!dryTiles.has(tile)) continue;
        this.eligible.push(i);
        if (this.obstacles.has(i) || bridgeAtTile(world, x, y)) continue;
        if (
          (world.bridges ?? []).some((b) =>
            bridgeGeometry(b).approaches.some((a) =>
              boundsOverlap(a, { minX: x, minY: y, maxX: x + 1, maxY: y + 1 }),
            ),
          )
        )
          continue;
        const riverNear = [-w, w, -1, 1].some((d) => world.tiles[i + d] === Tile.RIVER);
        const basin = surfaceHash(Math.floor(x / 3), Math.floor(y / 3), seed) % 5 < 2;
        if (hash % (tile === Tile.MUD || riverNear ? 3 : 5) || !basin) continue;
        this.pools.set(i, {
          x: x * 32 + 12 + ((hash >>> 4) % 9),
          y: y * 32 + 14 + ((hash >>> 9) % 7),
          rx: 6 + ((hash >>> 13) % 6),
          ry: 3 + ((hash >>> 18) % 3),
          salt: hash,
        });
      }
  }
  puddleAt(px: number, py: number, state?: MoistureView): boolean {
    if (!state) return false;
    const i = Math.floor(py / 32) * this.world.meta.width + Math.floor(px / 32),
      site = this.pools.get(i);
    const amount = state.puddles[i] ?? 0;
    if (!site || amount < 0.08) return false;
    const scale = 0.25 + amount * 0.75,
      dx = (Math.floor(px) - site.x) / (site.rx * scale),
      dy = (Math.floor(py) - site.y) / (site.ry * scale);
    const wobble =
      0.86 + (surfaceHash(Math.floor(px / 2), Math.floor(py / 2), site.salt) % 4) * 0.07;
    return dx * dx + dy * dy < wobble;
  }
  sample(px: number, py: number, state?: MoistureView): SurfaceSample | null {
    const x = px / 32,
      y = py / 32,
      tx = Math.floor(x),
      ty = Math.floor(y),
      { width: w, height: h } = this.world.meta;
    if (tx < 1 || ty < 1 || tx >= w - 1 || ty >= h - 1) return null;
    const i = ty * w + tx,
      tile = this.world.tiles[i] ?? Tile.BORDER;
    if (this.obstacles.get(i)?.some((b) => x >= b.minX && x < b.maxX && y >= b.minY && y < b.maxY))
      return null;
    if (isRaisedSurface(tile)) {
      const mask = elevationMask(this.world.tiles, w, h, tx, ty);
      if (
        cachedHillBounds(tile, mask).some(
          (b) => x - tx >= b.minX && x - tx < b.maxX && y - ty >= b.minY && y - ty < b.maxY,
        )
      )
        return null;
    }
    const bridge = bridgeAtTile(this.world, tx, ty);
    if (
      bridge &&
      bridgeGeometry(bridge).rails.some(
        (b) => x >= b.minX && x < b.maxX && y >= b.minY && y < b.maxY,
      )
    )
      return null;
    const support = surfaceAt(this.world, x, y);
    if (support.kind === 'deck' || tile === Tile.LOG || tile === Tile.RAMP)
      return { material: 'deck', x: px, y: py };
    if (support.kind === 'water') return { material: 'river', x: px, y: py };
    if (!dryTiles.has(tile) && !isRaisedSurface(tile)) return null;
    return {
      material: this.puddleAt(px, py, state) ? 'puddle' : tile === Tile.MUD ? 'soil' : 'grass',
      x: px,
      y: py,
    };
  }
}

export class SurfaceMoisture implements MoistureView {
  readonly wetness: Float32Array;
  readonly puddles: Float32Array;
  private remainderMs = 0;
  constructor(readonly sites: SurfaceSites) {
    this.wetness = new Float32Array(sites.world.tiles.length);
    this.puddles = new Float32Array(this.wetness.length);
  }
  step(ms: number, raining: boolean): void {
    this.remainderMs += ms;
    while (this.remainderMs >= 200) {
      this.remainderMs -= 200;
      for (const i of this.sites.eligible) {
        this.wetness[i] = Math.max(
          0,
          Math.min(1, (this.wetness[i] ?? 0) + (raining ? 0.02 : -0.2 / 90)),
        );
        if (this.sites.pools.has(i))
          this.puddles[i] = Math.max(
            0,
            Math.min(
              1,
              (this.puddles[i] ?? 0) +
                (raining && (this.wetness[i] ?? 0) >= 0.65 ? 0.2 / 30 : -0.2 / 120),
            ),
          );
      }
    }
  }
  save(): SavedMoisture {
    return {
      version: 1,
      wetness: Array.from(this.wetness, (v) => Math.round(v * 255)),
      puddles: Array.from(this.puddles, (v) => Math.round(v * 255)),
      remainderMs: this.remainderMs,
    };
  }
  restore(saved?: SavedMoisture): void {
    if (!saved) return;
    for (const i of this.sites.eligible) {
      this.wetness[i] = (saved.wetness[i] ?? 0) / 255;
      if (this.sites.pools.has(i)) this.puddles[i] = (saved.puddles[i] ?? 0) / 255;
    }
    this.remainderMs = saved.remainderMs;
  }
}

const siteCache = new WeakMap<WorldData, SurfaceSites>();
export function surfaceSites(world: WorldData): SurfaceSites {
  let sites = siteCache.get(world);
  if (!sites) {
    sites = new SurfaceSites(world);
    siteCache.set(world, sites);
  }
  return sites;
}
