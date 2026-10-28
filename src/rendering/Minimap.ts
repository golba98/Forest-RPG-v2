import { Container, Graphics } from 'pixi.js';
import { Tile } from '../types/tiles';
import type { RenderSnapshot } from '../types/render';

/** Cached whole-world map with live markers in screen space. */
export class Minimap extends Container {
  private terrain = new Graphics();
  private markers = new Graphics();
  private border = new Graphics();
  private version = -1;
  constructor() { super(); this.addChild(this.terrain, this.markers, this.border); this.border.rect(0, 0, 124, 124).stroke({ color: 0xe4ce88, width: 2 }); }
  update(view: RenderSnapshot): void {
    const { world } = view, { width, height } = world.meta;
    if (this.version !== view.worldVersion) {
      this.version = view.worldVersion; this.terrain.clear().rect(2, 2, 120, 120).fill(0x263c29);
      const color = (tile: number): number => tile === Tile.RIVER ? 0x336582 : tile === Tile.FOREST || tile === Tile.BORDER ? 0x173a23 : tile >= Tile.HILL_N && tile <= Tile.PLATEAU ? 0x8c7751 : tile === Tile.MUD ? 0x5b4930 : 0x789458;
      for (let y = 0; y < height; y++) {
        let start = 0;
        while (start < width) {
          const c = color(world.tiles[y * width + start] ?? 0); let end = start + 1;
          while (end < width && color(world.tiles[y * width + end] ?? 0) === c) end++;
          this.terrain.rect(2 + start / width * 120, 2 + y / height * 120, (end - start) / width * 120 + 0.1, 120 / height + 0.1).fill(c); start = end;
        }
      }
    }
    this.markers.clear();
    for (const entity of view.entities) {
      const x = 2 + entity.x / width * 120, y = 2 + entity.y / height * 120;
      if (entity.kind === 'player') this.markers.circle(x, y, 2.7).fill(0xffffff);
      else if (entity.kind === 'enemy') this.markers.circle(x, y, 1.2).fill(0xff6f63);
      else if (entity.kind === 'portal' && entity.active) this.markers.circle(x, y, 2).fill(0xcd8cff);
      else if (entity.spriteKey === 'coin') this.markers.circle(x, y, 1).fill(0xf7ce56);
    }
  }
}
