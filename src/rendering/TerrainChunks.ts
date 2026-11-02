import { Container, RenderTexture, Sprite, type Renderer } from 'pixi.js';
import type { WorldData } from '../types/world';
import { Tile } from '../types/tiles';
import { computeVisibleChunks, createChunkRange, chunksAlong } from './chunkMath';
import { elevationMask } from './hillAutotile';
import { ResidencyCache } from './ResidencyCache';
import { SoilChunkBuilder } from './SoilArt';
import { createTileSprite } from './SpriteArt';
import { getTileArt } from './terrainArt';
import type { TextureStore } from './TextureStore';
import { neighbourMaterialMask, waterEdgeMask } from './waterArt';
import {
  intersects,
  WORLD_CHUNK_PX,
  WORLD_CHUNK_TILES,
  WORLD_RESOURCE_BYTES,
  type VisibilityRegions,
} from './WorldVisibility';

interface ChunkView {
  readonly sprite: Sprite;
  readonly texture: RenderTexture;
}
interface ChunkRequest {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
interface ChunkJob {
  readonly request: ChunkRequest;
  readonly container: Container;
  readonly soil: SoilChunkBuilder;
  readonly slots: { base: Sprite; tx: number; ty: number }[];
  next: number;
}

const PREPARATION_MS = 2;
// One in-flight chunk: soil pixels + generated atlas + render target (worst-case).
const STAGING_BYTES = WORLD_CHUNK_PX * WORLD_CHUNK_PX * 4 * 3;

/** Bounded GPU residency over authoritative tiles. All preparation is outside placement logic. */
export class TerrainChunks {
  readonly view = new Container();
  private readonly cache = new ResidencyCache<ChunkView>((chunk) => {
    chunk.sprite.destroy();
    chunk.texture.destroy(true);
  });
  private world: WorldData | null = null;
  private job: ChunkJob | null = null;
  private readonly required = new Set<string>();
  private readonly visible = new Set<string>();
  private readonly requests: ChunkRequest[] = [];
  private readonly range = createChunkRange();
  private readonly dirty = new Set<string>();
  private urgentMisses = 0;
  private preparationMs = 0;
  private maxPreparationMs = 0;
  private budgetBytes = WORLD_RESOURCE_BYTES;
  private requiredBytes = 0;
  private initial = true;
  private retention = { x: 0, y: 0, width: 0, height: 0 };

  constructor(
    private readonly renderer: Renderer,
    private readonly textures: TextureStore,
  ) {}

  setWorld(world: WorldData): void {
    this.clear();
    this.world = world;
  }

  rebase(world: WorldData, dx: number, dy: number): void {
    this.cancelJob();
    const entries = [...this.cache.entries.values()];
    this.cache.entries.clear();
    for (const entry of entries) {
      entry.value.sprite.x -= dx * 32;
      entry.value.sprite.y -= dy * 32;
      const bounds = {...entry.bounds, x:entry.bounds.x-dx*32,y:entry.bounds.y-dy*32};
      this.cache.entries.set(`${bounds.x / 32},${bounds.y / 32}`, {...entry,bounds});
    }
    this.dirty.clear(); this.requests.length = 0; this.world = world;
  }

  update(regions: VisibilityRegions, now: number): void {
    const world = this.world;
    if (!world) return;
    const start = performance.now();
    this.retention = regions.retention;
    this.required.clear();
    this.visible.clear();
    this.requests.length = 0;
    this.requiredBytes = 0;
    const cols = chunksAlong(world.meta.width, WORLD_CHUNK_TILES),
      rows = chunksAlong(world.meta.height, WORLD_CHUNK_TILES);
    const range = computeVisibleChunks(regions.preparation, WORLD_CHUNK_PX, cols, rows, this.range);
    for (let row = range.minRow; row <= range.maxRow; row++)
      for (let col = range.minCol; col <= range.maxCol; col++) {
        const x = col * WORLD_CHUNK_TILES,
          y = row * WORLD_CHUNK_TILES;
        const request = {
          key: `${x},${y}`,
          x,
          y,
          width: Math.min(WORLD_CHUNK_TILES, world.meta.width - x) * 32,
          height: Math.min(WORLD_CHUNK_TILES, world.meta.height - y) * 32,
        };
        this.required.add(request.key);
        this.requiredBytes += request.width * request.height * 4;
        if (
          intersects(
            { x: x * 32, y: y * 32, width: request.width, height: request.height },
            regions.visible,
          )
        )
          this.visible.add(request.key);
        if (!this.cache.entries.has(request.key) || this.dirty.has(request.key))
          this.requests.push(request);
      }
    this.budgetBytes = Math.max(WORLD_RESOURCE_BYTES, this.requiredBytes + STAGING_BYTES);
    this.cache.prune(this.required, regions.retention, now, this.budgetBytes - STAGING_BYTES);
    if (this.job && !this.required.has(this.job.request.key)) this.cancelJob();
    const cx = regions.visible.x + regions.visible.width / 2,
      cy = regions.visible.y + regions.visible.height / 2;
    this.requests.sort(
      (a, b) =>
        Number(this.visible.has(b.key)) - Number(this.visible.has(a.key)) ||
        Math.hypot(a.x * 32 + a.width / 2 - cx, a.y * 32 + a.height / 2 - cy) -
          Math.hypot(b.x * 32 + b.width / 2 - cx, b.y * 32 + b.height / 2 - cy),
    );

    // A new world or camera discontinuity prepares its complete immediate working set.
    // Ordinary frames only finish an unexpectedly missing visible chunk synchronously.
    for (const request of this.requests) {
      if (!this.initial && !regions.discontinuity && !this.visible.has(request.key)) continue;
      if (!this.initial && !regions.discontinuity && !this.dirty.has(request.key))
        this.urgentMisses++;
      if (this.job?.request.key !== request.key) {
        this.cancelJob();
        this.startJob(request);
      }
      while (this.job && this.stepJob(world)) {
        /* complete before presentation */
      }
      this.finishJob(now);
    }
    this.initial = false;

    const backgroundStart = performance.now();
    for (const request of this.requests) {
      if (this.cache.entries.has(request.key) && !this.dirty.has(request.key)) continue;
      if (this.job && this.job.request.key !== request.key) continue;
      if (!this.job) this.startJob(request);
      while (this.job && performance.now() - backgroundStart < PREPARATION_MS) {
        if (!this.stepJob(world)) {
          this.finishJob(now);
          break;
        }
      }
      break; // At most one background chunk bake per frame.
    }
    for (const [key, entry] of this.cache.entries)
      entry.value.sprite.visible = this.visible.has(key);
    this.cache.prune(this.required, regions.retention, now, this.budgetBytes - STAGING_BYTES);
    this.preparationMs = performance.now() - start;
    this.maxPreparationMs = Math.max(this.maxPreparationMs, this.preparationMs);
  }

  private startJob(request: ChunkRequest): void {
    if (!this.world) return;
    this.job = {
      request,
      container: new Container(),
      soil: new SoilChunkBuilder(this.world, WORLD_CHUNK_TILES),
      slots: [],
      next: 0,
    };
  }

  private stepJob(world: WorldData): boolean {
    const job = this.job;
    if (!job) return false;
    const { request } = job,
      cols = request.width / 32,
      rows = request.height / 32;
    if (job.next >= cols * rows) return false;
    const tx = request.x + (job.next % cols),
      ty = request.y + Math.floor(job.next / cols);
    job.next++;
    job.soil.add(tx, ty);
    const tile = world.tiles[ty * world.meta.width + tx] ?? 0;
    const elevation = elevationMask(world.tiles, world.meta.width, world.meta.height, tx, ty);
    const shore =
      tile === Tile.RIVER
        ? waterEdgeMask(world.tiles, world.meta.width, world.meta.height, tx, ty)
        : neighbourMaterialMask(world.tiles, world.meta.width, world.meta.height, tx, ty);
    for (const [i, layer] of getTileArt(tile, tx + (world.window?.originX ?? 0), ty + (world.window?.originY ?? 0), elevation, shore).entries()) {
      const sprite = createTileSprite(layer, this.textures);
      sprite.x += (tx - request.x) * 32;
      sprite.y += (ty - request.y) * 32;
      job.container.addChild(sprite);
      if (i === 0) job.slots.push({ base: sprite, tx, ty });
    }
    return job.next < cols * rows;
  }

  private finishJob(now: number): void {
    const job = this.job,
      world = this.world;
    if (!job || !world) return;
    const soil = job.soil.finish();
    for (const slot of job.slots) {
      const texture = soil?.tiles.get(slot.ty * world.meta.width + slot.tx);
      if (!texture) continue;
      const sprite = new Sprite(texture);
      sprite.position.set((slot.tx - job.request.x) * 32, (slot.ty - job.request.y) * 32);
      job.container.addChildAt(sprite, job.container.getChildIndex(slot.base) + 1);
    }
    const r = job.request;
    this.cache.delete(r.key);
    this.cache.prune(
      this.required,
      this.retention,
      now,
      this.budgetBytes - STAGING_BYTES - r.width * r.height * 4,
    );
    const texture = RenderTexture.create({
      width: r.width,
      height: r.height,
      resolution: 1,
      antialias: false,
      scaleMode: 'nearest',
      autoGarbageCollect: false, // The residency cache exclusively owns these GPU contents.
    });
    this.renderer.render({ container: job.container, target: texture, clear: true });
    const sprite = new Sprite(texture);
    sprite.position.set(r.x * 32, r.y * 32);
    this.cache.set(
      r.key,
      { sprite, texture },
      { x: sprite.x, y: sprite.y, width: r.width, height: r.height },
      r.width * r.height * 4,
      now,
    );
    this.view.addChild(sprite);
    job.container.destroy({ children: true });
    soil?.destroy();
    this.job = null;
    this.dirty.delete(r.key);
  }

  invalidateTile(x: number, y: number): void {
    // Nonresident chunks have no resource to rebuild; their next job reads current tiles.
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const key = `${Math.floor((x + dx) / WORLD_CHUNK_TILES) * WORLD_CHUNK_TILES},${Math.floor((y + dy) / WORLD_CHUNK_TILES) * WORLD_CHUNK_TILES}`;
        if (this.cache.entries.has(key) || this.job?.request.key === key) this.dirty.add(key);
        if (this.job?.request.key === key) this.cancelJob();
      }
  }

  private cancelJob(): void {
    this.job?.container.destroy({ children: true });
    this.job = null;
  }

  get info() {
    return {
      residentChunks: this.cache.entries.size,
      requiredChunks: this.required.size,
      visibleChunks: this.visible.size,
      queuedChunks: this.requests.filter(
        (r) => !this.cache.entries.has(r.key) || this.dirty.has(r.key),
      ).length,
      resourceBytes: this.cache.bytes,
      stagingBytes: this.job ? STAGING_BYTES : 0,
      budgetBytes: this.budgetBytes,
      requiredBytes: this.requiredBytes,
      evictions: this.cache.evictions,
      urgentMisses: this.urgentMisses,
      preparationMs: this.preparationMs,
      maxPreparationMs: this.maxPreparationMs,
    };
  }

  clear(): void {
    this.cancelJob();
    this.cache.clear();
    this.required.clear();
    this.visible.clear();
    this.requests.length = 0;
    this.dirty.clear();
    this.world = null;
    this.initial = true;
    this.urgentMisses = 0;
    this.preparationMs = 0;
    this.maxPreparationMs = 0;
  }
}
