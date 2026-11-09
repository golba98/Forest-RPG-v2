import { GAME_CONFIG } from '../config/GameConfig';
import { MAX_DELTA_MS } from '../core/loop/types';
import type { WorldRect } from './chunkMath';

const WORLD_TILE_PX = 32;
export const WORLD_CHUNK_TILES = 16;
export const WORLD_CHUNK_PX = WORLD_TILE_PX * WORLD_CHUNK_TILES;
export const RETENTION_MS = 5000;
export const WORLD_RESOURCE_BYTES = 64 * 1024 * 1024;
/** The supported dash + potion + sensitivity-10 combination, in world px/s. */
export const MAX_WORLD_SPEED =
  ((GAME_CONFIG.player.sprintSpeed * 1.45 * 1.4) / 0.7) * WORLD_TILE_PX;
const LOOK_AHEAD_SECONDS = 0.25;

export function intersects(a: Readonly<WorldRect>, b: Readonly<WorldRect>): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function expandRect(
  rect: Readonly<WorldRect>,
  margin: number,
  out: WorldRect = { ...rect },
): WorldRect {
  out.x = rect.x - margin;
  out.y = rect.y - margin;
  out.width = rect.width + margin * 2;
  out.height = rect.height + margin * 2;
  return out;
}

export interface VisibilityRegions {
  readonly visible: WorldRect;
  readonly preparation: WorldRect;
  readonly retention: WorldRect;
  discontinuity: boolean;
}

/** Pure world-pixel planner. No simulation state, placement RNG or Pixi objects. */
export class WorldVisibility {
  readonly regions: VisibilityRegions = {
    visible: { x: 0, y: 0, width: 0, height: 0 },
    preparation: { x: 0, y: 0, width: 0, height: 0 },
    retention: { x: 0, y: 0, width: 0, height: 0 },
    discontinuity: true,
  };
  private initialized = false;

  reset(): void {
    this.initialized = false;
  }

  update(rect: Readonly<WorldRect>, dtMs: number): VisibilityRegions {
    const previous = this.regions.visible;
    const seconds = Math.max(1, dtMs) / 1000;
    const dx = rect.x - previous.x,
      dy = rect.y - previous.y;
    this.regions.discontinuity =
      !this.initialized ||
      rect.width !== previous.width ||
      rect.height !== previous.height ||
      Math.hypot(dx, dy) > MAX_WORLD_SPEED * seconds * 2 + WORLD_TILE_PX;
    const limit = MAX_WORLD_SPEED * LOOK_AHEAD_SECONDS;
    const leadX = this.regions.discontinuity
      ? 0
      : Math.max(-limit, Math.min(limit, (dx / seconds) * LOOK_AHEAD_SECONDS));
    const leadY = this.regions.discontinuity
      ? 0
      : Math.max(-limit, Math.min(limit, (dy / seconds) * LOOK_AHEAD_SECONDS));
    // Native canopy reach plus one worst-case frame of movement in every direction.
    const reserve = 128 + (MAX_WORLD_SPEED * Math.max(MAX_DELTA_MS, dtMs)) / 1000;
    const prep = expandRect(rect, reserve, this.regions.preparation);
    prep.x += Math.min(0, leadX);
    prep.y += Math.min(0, leadY);
    prep.width += Math.abs(leadX);
    prep.height += Math.abs(leadY);
    expandRect(prep, WORLD_CHUNK_PX, this.regions.retention);
    Object.assign(previous, rect);
    this.initialized = true;
    return this.regions;
  }
}

/** Index full visual bounds, including objects whose anchors are in another chunk. */
export class WorldBoundsIndex<
  T extends { readonly key: string; readonly bounds: Readonly<WorldRect> },
> {
  readonly records = new Map<string, T>();
  private buckets = new Map<string, Set<T>>();

  add(record: T): void {
    this.remove(record.key);
    this.records.set(record.key, record);
    this.cells(record.bounds, (key) => {
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = new Set();
        this.buckets.set(key, bucket);
      }
      bucket.add(record);
    });
  }

  remove(key: string): void {
    const record = this.records.get(key);
    if (!record) return;
    this.cells(record.bounds, (cell) => {
      const bucket = this.buckets.get(cell);
      bucket?.delete(record);
      if (!bucket?.size) this.buckets.delete(cell);
    });
    this.records.delete(key);
  }

  query(rect: Readonly<WorldRect>, out: Set<T>): Set<T> {
    out.clear();
    this.cells(rect, (key) => {
      for (const record of this.buckets.get(key) ?? [])
        if (intersects(record.bounds, rect)) out.add(record);
    });
    return out;
  }

  clear(): void {
    this.records.clear();
    this.buckets.clear();
  }

  private cells(rect: Readonly<WorldRect>, visit: (key: string) => void): void {
    for (
      let y = Math.floor(rect.y / WORLD_CHUNK_PX);
      y < Math.ceil((rect.y + rect.height) / WORLD_CHUNK_PX);
      y++
    )
      for (
        let x = Math.floor(rect.x / WORLD_CHUNK_PX);
        x < Math.ceil((rect.x + rect.width) / WORLD_CHUNK_PX);
        x++
      )
        visit(`${x},${y}`);
  }
}
