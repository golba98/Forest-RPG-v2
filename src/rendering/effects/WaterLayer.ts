import { Graphics } from 'pixi.js';
import { RiverField, type RiverGrid } from '../../world/RiverTopology';
import { Tile } from '../../types/tiles';
import { surfaceHash } from '../../systems/SurfaceMoisture';
import { WATER_PALETTE } from '../waterArt';
import { hashTile } from '../terrainArt';

interface Crest {
  x: number;
  y: number;
  age: number;
  active: boolean;
}
/** World-space crests cross tile and chunk boundaries instead of restarting inside each cell. */
export class WaterLayer {
  readonly view = new Graphics();
  private field: RiverField | null = null;
  private sequence = 0;
  private time = 0;
  private crests: Crest[] = Array.from({ length: 96 }, () => ({
    x: 0,
    y: 0,
    age: 0,
    active: false,
  }));
  reset(world: RiverGrid): void {
    this.field = new RiverField(world);
    this.sequence = 0;
    this.time = 0;
    for (const c of this.crests) c.active = false;
  }
  update(
    dt: number,
    paused: boolean,
    rect: { x: number; y: number; width: number; height: number },
    world: RiverGrid,
  ): void {
    if (this.field?.world !== world) this.reset(world);
    const field = this.field;
    if (!field) return;
    const { width: w, height: h } = world.meta,
      g = this.view;
    g.clear();
    const elapsed = paused ? 0 : Math.min(100, dt);
    this.time += elapsed;
    const index = (x: number, y: number) => Math.floor(y / 32) * w + Math.floor(x / 32);
    const wet = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < w * 32 && y < h * 32 && world.tiles[index(x, y)] === Tile.RIVER;
    // Preserve the original animated pixel glints alongside the repaired flow.
    const x0 = Math.max(0, Math.floor(rect.x / 32)), y0 = Math.max(0, Math.floor(rect.y / 32));
    const x1 = Math.min(w - 1, Math.floor((rect.x + rect.width) / 32)), y1 = Math.min(h - 1, Math.floor((rect.y + rect.height) / 32));
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (world.tiles[ty * w + tx] !== Tile.RIVER) continue;
      const hash = hashTile(tx, ty);
      for (let n = 0; n < 2; n++) {
        const r = n ? hash >>> 13 : hash, period = 1400 + r % 900;
        const phase = (this.time / period + ((r >>> 5) & 255) / 255) % 1;
        if (phase > 0.24) continue;
        const alpha = phase < 0.12 ? phase / 0.12 : (0.24 - phase) / 0.12;
        const x = tx * 32 + 6 + ((r >>> 3) % 20), y = ty * 32 + 8 + ((r >>> 9) % 18);
        g.rect(x, y, 2, 1).fill({ color: WATER_PALETTE.glint, alpha });
        if (alpha > 0.6) g.rect(x, y - 1, 1, 1).fill({ color: WATER_PALETTE.glint, alpha: alpha * 0.6 });
      }
    }
    for (const crest of this.crests) {
      if (!crest.active && !paused) {
        const hash = surfaceHash(this.sequence++, w, h);
        const x = rect.x + ((hash % 65536) / 65535) * rect.width,
          y = rect.y + ((hash >>> 16) / 65535) * rect.height;
        if (wet(x, y)) Object.assign(crest, { x, y, age: hash % 700, active: true });
      }
      if (!crest.active) continue;
      const i = index(crest.x, crest.y),
        vx = field.flowX[i] ?? 0,
        vy = field.flowY[i] ?? 0;
      const nx = crest.x + vx * elapsed * 0.009,
        ny = crest.y + vy * elapsed * 0.009;
      crest.age += elapsed;
      if (!wet(nx, ny) || crest.age > 3200) {
        crest.active = false;
        continue;
      }
      crest.x = nx;
      crest.y = ny;
      const alpha = Math.sin((crest.age / 3200) * Math.PI) * 0.55;
      // Original four-pixel crest and dark trough, advected through the channel.
      const x = Math.round(nx), y = Math.round(ny);
      for (let n = 0; n < 4; n++) if (wet(x + n, y))
        g.rect(x + n, y, 1, 1).fill({ color: WATER_PALETTE.wave, alpha });
      for (let n = 1; n < 3; n++) if (wet(x + n, y + 1))
        g.rect(x + n, y + 1, 1, 1).fill({ color: WATER_PALETTE.deep, alpha: alpha * 0.8 });
    }
  }
}
