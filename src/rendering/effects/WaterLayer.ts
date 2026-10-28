import { Graphics } from 'pixi.js';
import { Tile } from '../../types/tiles';
import { hashTile } from '../terrainArt';
import { WATER_PALETTE, WATER_SIZE } from '../waterArt';

const TILE = WATER_SIZE;

interface WaterWorld {
  readonly tiles: ArrayLike<number>;
  readonly meta: { readonly width: number; readonly height: number };
}

/**
 * Animated surface over the baked water tiles: twinkling pixel glints and a
 * slowly drifting crest per river tile. Only visible tiles are drawn; the
 * clock stops while the game is paused.
 */
export class WaterLayer {
  readonly view = new Graphics();
  private time = 0;

  update(dt: number, paused: boolean, rect: { x: number; y: number; width: number; height: number }, world: WaterWorld): void {
    if (!paused) this.time += dt;
    const g = this.view,
      t = this.time,
      { width, height } = world.meta;
    g.clear();
    const x0 = Math.max(0, Math.floor(rect.x / TILE)),
      y0 = Math.max(0, Math.floor(rect.y / TILE)),
      x1 = Math.min(width - 1, Math.floor((rect.x + rect.width) / TILE)),
      y1 = Math.min(height - 1, Math.floor((rect.y + rect.height) / TILE));
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        if (world.tiles[ty * width + tx] !== Tile.RIVER) continue;
        const h = hashTile(tx, ty),
          px = tx * TILE,
          py = ty * TILE;
        // Two glints per tile, each lit for the first quarter of its own cycle.
        for (let i = 0; i < 2; i++) {
          const r = i ? h >>> 13 : h;
          const period = 1400 + (r % 900);
          const phase = (t / period + ((r >>> 5) & 255) / 255) % 1;
          if (phase > 0.24) continue;
          const a = phase < 0.12 ? phase / 0.12 : (0.24 - phase) / 0.12;
          const gx = px + 6 + ((r >>> 3) % 20),
            gy = py + 8 + ((r >>> 9) % 18);
          g.rect(gx, gy, 2, 1).fill({ color: WATER_PALETTE.glint, alpha: a });
          if (a > 0.6) g.rect(gx, gy - 1, 1, 1).fill({ color: WATER_PALETTE.glint, alpha: a * 0.6 });
        }
        // Drifting crest: slides right across the tile and fades at both ends.
        const drift = (t / 3200 + (h & 1023) / 1023) % 1;
        const cx = px + 3 + Math.floor(drift * (TILE - 10)),
          cy = py + 6 + ((h >>> 20) % 20);
        const fade = Math.sin(drift * Math.PI) * 0.55;
        g.rect(cx, cy, 4, 1).fill({ color: WATER_PALETTE.wave, alpha: fade });
        g.rect(cx + 1, cy + 1, 2, 1).fill({ color: WATER_PALETTE.deep, alpha: fade * 0.8 });
      }
  }
}
