import { Tile } from '../../types/tiles';
import type { TileId } from '../../types/tiles';
import type { WorldData, WorldBridge, WorldProp } from '../../types/world';
import { bridgeReservations, boundsOverlap } from '../BridgeGeometry';
import { hasHilltopClearance } from '../HilltopObjects';
import { biomes, type BiomeDefinition } from './biomes';
import {
  coordinateHash as hash,
  valueNoise as noise,
  addressKey,
  assertCoordinate,
} from './coordinates';
import type { ChunkAddress } from './coordinates';
import type { GeneratedChunk, InfiniteDescriptor } from './types';

export interface ForestPoint {
  readonly x: number;
  readonly y: number;
}
export interface StartingPlan {
  readonly portal: ForestPoint;
  readonly nest: ForestPoint;
  readonly coins: readonly ForestPoint[];
  readonly enemies: readonly ForestPoint[];
}
const plans = new Map<string, StartingPlan>();

/** Worker-local bounded memoization. Baseline geography never depends on these caches. */
export class ForestGenerator {
  private readonly biome: BiomeDefinition;
  private readonly seed: number;
  private readonly waterCache = new Map<string, boolean>();
  private readonly hillCache = new Map<string, boolean>();
  private readonly tileCache = new Map<string, TileId>();
  private readonly treeCache = new Map<string, boolean>();
  private readonly waterOffset: number;
  private readonly bridgeCache = new Map<string, WorldBridge | null>();
  private readonly groveCache = new Map<string, boolean>();
  readonly starting: StartingPlan;
  constructor(
    readonly descriptor: InfiniteDescriptor,
    private readonly cacheLimit = 32768,
  ) {
    if (
      descriptor.generatorVersion !== 13 ||
      ![32, 64].includes(descriptor.chunkSize) ||
      !Number.isInteger(descriptor.seed) ||
      descriptor.seed < 0 ||
      descriptor.seed > 0xffffffff
    )
      throw new Error('Unsupported streamed world descriptor');
    this.biome = biomes.get('forest', descriptor.biomeVersion);
    this.seed = descriptor.seed;
    let offset = 0;
    // Avoid clipping a river with an artificial spawn clearing.
    while (offset < 4096 && Math.abs(noise(this.seed, offset / 90, 0, 'water') - 0.5) < 0.18)
      offset += 137;
    this.waterOffset = offset;
    const key = `${descriptor.generatorVersion}:${descriptor.biomeVersion}:${descriptor.seed}:${descriptor.difficulty}`;
    const prior = plans.get(key);
    this.starting = prior ?? this.planStart();
    if (plans.size >= 8) plans.clear();
    plans.set(key, this.starting);
  }
  private water(x: number, y: number): boolean {
    const key = addressKey(x, y),
      cached = this.waterCache.get(key);
    if (cached !== undefined) return cached;
    const value = this.rawWater(x, y);
    this.waterCache.set(key, value);
    return value;
  }
  private rawWater(x: number, y: number): boolean {
    if (!this.biome.features.includes('rivers')) return false;
    const warp = (noise(this.seed, x / 240, y / 240, 'river-warp') - 0.5) * 48;
    return (
      Math.abs(noise(this.seed, (x + this.waterOffset + warp) / 90, y / 90, 'water') - 0.5) <
      this.biome.terrain.riverThreshold
    );
  }
  private hill(x: number, y: number): boolean {
    const key = addressKey(x, y),
      cached = this.hillCache.get(key);
    if (cached !== undefined) return cached;
    const value = this.rawHill(x, y);
    this.hillCache.set(key, value);
    return value;
  }
  private rawHill(x: number, y: number): boolean {
    if (!this.biome.features.includes('hills')) return false;
    if (Math.hypot(x, y) < 20 || this.water(x, y)) return false;
    return noise(this.seed, x / 54, y / 54, 'hill') > this.biome.terrain.hillThreshold;
  }
  tileAt(x: number, y: number): TileId {
    if (this.tileCache.size > this.cacheLimit) {
      this.tileCache.clear();
      this.waterCache.clear();
      this.hillCache.clear();
      this.treeCache.clear();
    }
    const key = addressKey(x, y),
      cached = this.tileCache.get(key);
    if (cached !== undefined) return cached;
    const value = this.rawTile(x, y);
    this.tileCache.set(key, value);
    return value;
  }
  private rawTile(x: number, y: number): TileId {
    if (this.water(x, y)) return Tile.RIVER;
    if (this.hill(x, y)) {
      const n = this.hill(x, y - 1),
        s = this.hill(x, y + 1),
        e = this.hill(x + 1, y),
        w = this.hill(x - 1, y);
      if (
        !s &&
        n &&
        e &&
        w &&
        hash(this.seed, x, y, 'stairs') % 9 === 0 &&
        !this.water(x, y + 1) &&
        !this.water(x, y + 2)
      )
        return Tile.STAIRS;
      if (!n && !w) return Tile.HILL_NW;
      if (!n && !e) return Tile.HILL_NE;
      if (!s && !w) return Tile.HILL_SW;
      if (!s && !e) return Tile.HILL_SE;
      if (!n) return Tile.HILL_N;
      if (!s) return Tile.HILL_S;
      if (!w) return Tile.HILL_W;
      if (!e) return Tile.HILL_E;
      return Tile.PLATEAU;
    }
    const h = hash(this.seed, x, y, 'ground');
    if (noise(this.seed, x / 20, y / 20, 'groundcover') > 0.68 && h % 5 === 0)
      return this.biome.terrain.flowers;
    if (
      noise(this.seed, x / 13, y / 13, 'damp') > 0.57 &&
      [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ].some(([dx = 0, dy = 0]) => this.water(x + dx, y + dy))
    )
      return Tile.MUD;
    return this.biome.terrain.ground;
  }
  private flat(x: number, y: number, radius: number): boolean {
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const t = this.tileAt(x + dx, y + dy);
        if (t !== Tile.GRASS && t !== Tile.FLOWERS && t !== Tile.MUD) return false;
      }
    return true;
  }
  private planStart(): StartingPlan {
    const sites: ForestPoint[] = [];
    for (let y = -64; y <= 64; y += 4)
      for (let x = -64; x <= 64; x += 4)
        if (Math.hypot(x, y) > 12 && this.flat(x, y, 2)) sites.push({ x, y });
    sites.sort(
      (a, b) => hash(this.seed, a.x, a.y, 'objectives') - hash(this.seed, b.x, b.y, 'objectives'),
    );
    const nest = sites.find((p) => Math.hypot(p.x, p.y) > 24 && this.flat(p.x, p.y, 6));
    const selected = sites.filter((p) => !nest || Math.hypot(p.x - nest.x, p.y - nest.y) > 12);
    const portal = selected.shift();
    if (!nest || !portal || selected.length < 44)
      throw new Error('Cannot prepare starting objectives for seed');
    const count = { easy: 6, normal: 12, hard: 24 }[this.descriptor.difficulty];
    return { portal, nest, coins: selected.slice(0, 20), enemies: selected.slice(20, 20 + count) };
  }
  private protected(x: number, y: number): boolean {
    if (Math.hypot(x, y) < 6) return true;
    const groveX = Math.floor(x / 96),
      groveY = Math.floor(y / 96);
    if (Math.hypot(x - groveX * 96 - 48, y - groveY * 96 - 48) < 7 && this.hasGrove(groveX, groveY))
      return true;
    const sx = Math.floor(x / 32) * 32 + 16,
      sy = Math.floor(y / 32) * 32 + 16;
    if (
      Math.hypot(sx, sy) >= 96 &&
      (Math.hypot(x - sx, y - sy) < 2 || Math.hypot(x - sx - 3, y - sy) < 2)
    )
      return true;
    if (Math.hypot(x - this.starting.nest.x, y - this.starting.nest.y) < 8) return true;
    return [this.starting.portal, ...this.starting.coins, ...this.starting.enemies].some(
      (p) => Math.hypot(x - p.x, y - p.y) < 2.5,
    );
  }
  hasGrove(x: number, y: number): boolean {
    const key = addressKey(x, y),
      cached = this.groveCache.get(key);
    if (cached !== undefined) return cached;
    const px = x * 96 + 48,
      py = y * 96 + 48,
      valid =
        this.biome.encounters.includes('grove') && Math.hypot(px, py) > 96 && this.flat(px, py, 5);
    if (this.groveCache.size >= 256) this.groveCache.clear();
    this.groveCache.set(key, valid);
    return valid;
  }
  private candidateBridge(cx: number, cy: number): WorldBridge | null {
    const key = addressKey(cx, cy);
    if (this.bridgeCache.has(key)) return this.bridgeCache.get(key) ?? null;
    let found: WorldBridge | null = null;
    const ox = cx * 24 + 4 + (hash(this.seed, cx, cy, 'bridge-x') % 16),
      oy = cy * 24 + 4 + (hash(this.seed, cx, cy, 'bridge-y') % 16);
    search: for (let r = 0; r <= 6; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = ox + dx,
            y = oy + dy;
          for (const orientation of ['horizontal', 'vertical'] as const)
            for (let span = 1; span <= 6; span++) {
              const at = (a: number, b: number) =>
                this.tileAt(
                  x + (orientation === 'horizontal' ? a : b),
                  y + (orientation === 'horizontal' ? b : a),
                );
              let valid = true;
              for (let a = -2; a <= span + 3 && valid; a++)
                for (let b = -1; b <= 2; b++) {
                  const tile = at(a, b),
                    water = a >= 1 && a <= span && b >= 0 && b < 2;
                  if (
                    water
                      ? tile !== Tile.RIVER
                      : (a <= 0 || a >= span + 1) &&
                        tile !== Tile.GRASS &&
                        tile !== Tile.FLOWERS &&
                        tile !== Tile.MUD
                  ) {
                    valid = false;
                    break;
                  }
                }
              if (valid && !this.protected(x, y)) {
                found = {
                  id: `bridge:${cx},${cy}`,
                  x,
                  y,
                  orientation,
                  span,
                  variant: hash(this.seed, cx, cy, 'bridge-art') % 4,
                };
                break search;
              }
            }
        }
    if (this.bridgeCache.size > 256) this.bridgeCache.clear();
    this.bridgeCache.set(key, found);
    return found;
  }
  bridgesIn(minX: number, minY: number, maxX: number, maxY: number): WorldBridge[] {
    if (!this.biome.features.includes('bridges')) return [];
    const bridges: WorldBridge[] = [];
    for (let cy = Math.floor((minY - 16) / 24); cy <= Math.floor((maxY + 16) / 24); cy++)
      for (let cx = Math.floor((minX - 16) / 24); cx <= Math.floor((maxX + 16) / 24); cx++) {
        const b = this.candidateBridge(cx, cy);
        if (!b) continue;
        const rank = hash(this.seed, cx, cy, 'bridge-priority');
        let blocked = false;
        for (let dy = -1; dy <= 1 && !blocked; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const other = this.candidateBridge(cx + dx, cy + dy);
            if (
              other &&
              Math.hypot(other.x - b.x, other.y - b.y) < 16 &&
              hash(this.seed, cx + dx, cy + dy, 'bridge-priority') < rank
            ) {
              blocked = true;
              break;
            }
          }
        if (!blocked) bridges.push(b);
      }
    return bridges;
  }
  private treeCandidate(x: number, y: number): boolean {
    const key = addressKey(x, y),
      cached = this.treeCache.get(key);
    if (cached !== undefined) return cached;
    const value = this.rawTreeCandidate(x, y);
    this.treeCache.set(key, value);
    return value;
  }
  private rawTreeCandidate(x: number, y: number): boolean {
    if (!this.biome.palette.includes('tree') || !this.flat(x, y, 0) || this.protected(x, y))
      return false;
    if (
      this.biome.features.includes('paths') &&
      Math.abs(noise(this.seed, x / 32, y / 32, 'paths') - 0.5) < 0.045
    )
      return false;
    const density =
      this.biome.objects.treeBaseDensity +
      noise(this.seed, x / 28, y / 28, 'woodland') * this.biome.objects.treeVariation;
    return hash(this.seed, x, y, 'tree') / 0xffffffff < density;
  }
  private hillRock(x: number, y: number): WorldProp | null {
    const id = `summit-rock:${x},${y}`,
      rank = hash(this.seed, x, y, 'prop');
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++)
        if (
          (dx || dy) &&
          hash(this.seed, x + dx, y + dy, 'prop') % this.biome.objects.hillRockFrequency === 0 &&
          hash(this.seed, x + dx, y + dy, 'prop') < rank
        )
          return null;
    const tiles = new Uint8Array(81);
    for (let ly = 0; ly < 9; ly++)
      for (let lx = 0; lx < 9; lx++) tiles[ly * 9 + lx] = this.tileAt(x + lx - 4, y + ly - 4);
    const local: WorldProp = {
      id,
      kind: 'rock_boulder',
      tileX: 4,
      tileY: 4,
      solid: true,
      hilltop: { sourceX: x, sourceY: y },
    };
    const patch: WorldData = {
      meta: {
        seed: this.seed,
        generatorVersion: 13,
        width: 9,
        height: 9,
        isTutorial: false,
        level: 1,
        difficulty: 'normal',
      },
      tiles,
      props: [],
      bridges: [],
      encounterSites: [],
      spawn: { x: 0, y: 0 },
      portal: { x: 0, y: 0 },
      enemySpawns: [],
      pickupSpawns: [],
    };
    return hasHilltopClearance(patch, local) ? { ...local, tileX: x, tileY: y } : null;
  }
  generate(address: ChunkAddress): GeneratedChunk {
    const steps = this.generateSteps(address);
    for (;;) {
      const next = steps.next();
      if (next.done) return next.value;
    }
  }
  async generateCooperatively(address: ChunkAddress): Promise<GeneratedChunk> {
    const steps = this.generateSteps(address);
    for (;;) {
      const start = performance.now();
      let next = steps.next();
      while (!next.done && performance.now() - start < 2) next = steps.next();
      if (next.done) return next.value;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  private *generateSteps(address: ChunkAddress): Generator<void, GeneratedChunk, void> {
    if (!Number.isSafeInteger(address.x) || !Number.isSafeInteger(address.y))
      throw new Error('Invalid chunk address');
    assertCoordinate(address.x * this.descriptor.chunkSize);
    assertCoordinate(address.y * this.descriptor.chunkSize);
    assertCoordinate((address.x + 1) * this.descriptor.chunkSize - 1);
    assertCoordinate((address.y + 1) * this.descriptor.chunkSize - 1);
    if (this.tileCache.size > this.cacheLimit) {
      this.tileCache.clear();
      this.waterCache.clear();
      this.hillCache.clear();
      this.treeCache.clear();
    }
    const size = this.descriptor.chunkSize,
      ox = address.x * size,
      oy = address.y * size;
    const tiles = new Uint8Array(size * size),
      props: WorldProp[] = [];
    const allBridges = this.bridgesIn(ox, oy, ox + size, oy + size);
    const reserved = (x: number, y: number) =>
      allBridges.some((b) =>
        bridgeReservations(b).some((r) =>
          boundsOverlap(r, { minX: x - 1, minY: y - 3, maxX: x + 2, maxY: y + 2 }),
        ),
      );
    for (let ly = 0; ly < size; ly++) {
      for (let lx = 0; lx < size; lx++) {
        const x = ox + lx,
          y = oy + ly,
          tile = this.tileAt(x, y),
          h = hash(this.seed, x, y, 'prop');
        tiles[ly * size + lx] = tile;
        if (this.protected(x, y) || reserved(x, y)) continue;
        let nearStairs = false;
        for (let dy = -3; dy <= 2 && !nearStairs; dy++)
          for (let dx = -2; dx <= 2; dx++)
            if (this.tileAt(x + dx, y + dy) === Tile.STAIRS) {
              nearStairs = true;
              break;
            }
        if (nearStairs) continue;
        if (this.treeCandidate(x, y)) {
          const rank = hash(this.seed, x, y, 'tree-rank');
          let wins = true;
          for (let dy = -2; dy <= 2 && wins; dy++)
            for (let dx = -2; dx <= 2; dx++)
              if (
                (dx || dy) &&
                dx * dx + dy * dy < 5 &&
                this.treeCandidate(x + dx, y + dy) &&
                hash(this.seed, x + dx, y + dy, 'tree-rank') < rank
              ) {
                wins = false;
                break;
              }
          if (wins)
            props.push({ id: `tree:${x},${y}`, kind: 'tree', tileX: x, tileY: y, solid: true });
        } else if (
          tile === Tile.PLATEAU &&
          h % this.biome.objects.hillRockFrequency === 0 &&
          this.tileAt(x - 1, y) === Tile.PLATEAU &&
          this.tileAt(x + 1, y) === Tile.PLATEAU &&
          this.tileAt(x, y - 1) === Tile.PLATEAU &&
          this.tileAt(x, y + 1) === Tile.PLATEAU
        ) {
          const rock = this.hillRock(x, y);
          if (rock) props.push(rock);
        } else if (tile === Tile.GRASS && h % this.biome.objects.decorationFrequency === 0) {
          const kinds = this.biome.palette.filter(
            (kind) => kind !== 'tree' && kind !== 'rock_boulder',
          );
          props.push({
            id: `decor:${x},${y}`,
            kind: kinds[(h >>> 9) % kinds.length] ?? 'rock_pebble',
            tileX: x,
            tileY: y,
            solid: false,
          });
        }
      }
      yield;
    }
    // Ownership belongs to the anchor chunk; bounds indexes include overhangs in neighbours.
    const bridges = allBridges.filter(
      (b) => Math.floor(b.x / size) === address.x && Math.floor(b.y / size) === address.y,
    );
    return { address, size, tiles, props, bridges };
  }
}
