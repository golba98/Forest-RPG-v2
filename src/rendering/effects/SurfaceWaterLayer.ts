import { Graphics } from 'pixi.js';
import type { WorldData } from '../../types/world';
import type { MoistureView } from '../../systems/SurfaceMoisture';
import { surfaceSites, surfaceHash } from '../../systems/SurfaceMoisture';
import { Tile } from '../../types/tiles';

/** Dynamic moisture never enters cached terrain chunks. Rebuild at the simulation's 5 Hz. */
export class SurfaceWaterLayer {
  readonly view = new Graphics();
  private previous = '';
  reset(): void {
    this.previous = '';
    this.view.clear();
  }
  update(
    world: WorldData,
    moisture: MoistureView | undefined,
    rect: { x: number; y: number; width: number; height: number },
    elapsed: number,
  ): void {
    if (!moisture) {
      this.view.clear();
      return;
    }
    const { width: w, height: h } = world.meta;
    const x0 = Math.max(0, Math.floor(rect.x / 32)),
      y0 = Math.max(0, Math.floor(rect.y / 32));
    const x1 = Math.min(w - 1, Math.floor((rect.x + rect.width) / 32)),
      y1 = Math.min(h - 1, Math.floor((rect.y + rect.height) / 32));
    const key = `${x0},${y0},${x1},${y1},${Math.floor(elapsed / 200)}`;
    if (key === this.previous) return;
    this.previous = key;
    const g = this.view,
      sites = surfaceSites(world);
    g.clear();
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x,
          wet = moisture.wetness[i] ?? 0;
        if (wet <= 0.005) continue;
        const local =
          0.65 + (surfaceHash(Math.floor(x / 2), Math.floor(y / 2), world.meta.seed) % 100) / 285;
        g.rect(x * 32, y * 32, 32, 32).fill({
          color: world.tiles[i] === Tile.MUD ? 0x172c2a : 0x153c36,
          alpha: wet * 0.19 * local,
        });
        const site = sites.pools.get(i);
        if (!site || (moisture.puddles[i] ?? 0) < 0.08) continue;
        for (let py = site.y - site.ry - 1; py <= site.y + site.ry + 1; py++) {
          let start = -1;
          for (let px = site.x - site.rx - 1; px <= site.x + site.rx + 2; px++) {
            const inside = sites.puddleAt(px, py, moisture);
            if (inside && start === -1) start = px;
            if (!inside && start !== -1) {
              const rim =
                !sites.puddleAt(start, py - 1, moisture) ||
                !sites.puddleAt(start, py + 1, moisture);
              g.rect(start, py, px - start, 1).fill({
                color: rim ? 0x36564c : 0x426b64,
                alpha: 0.65,
              });
              if (!rim && py === site.y - 1)
                g.rect(start + 1, py, Math.max(1, px - start - 3), 1).fill({
                  color: 0x8aa49a,
                  alpha: 0.45,
                });
              start = -1;
            }
          }
        }
      }
  }
}
