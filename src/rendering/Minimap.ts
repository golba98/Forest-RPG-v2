import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { Tile } from '../types/tiles';
import type { RenderSnapshot } from '../types/render';
import { NB, elevationMask, isElevatedTile } from './hillAutotile';

const SIZE = 120;

/**
 * Colours sampled from the rendered textures (average opaque pixel), so the
 * minimap reads like the world: plateau tops lighter than ground, cliff faces
 * and rims in the tileset's rock tones, trees as canopy dots.
 */
const C = {
  void: [0x26, 0x3c, 0x29],
  grass: [0x5a, 0x75, 0x30],
  plateau: [0x7a, 0x96, 0x3a],
  rim: [0xc0, 0x80, 0x2a],
  face: [0x91, 0x56, 0x1d],
  water: [0x2a, 0x55, 0x66],
  mud: [0x4d, 0x37, 0x21],
  bridge: [0x9c, 0x64, 0x3c],
  forest: [0x2c, 0x55, 0x22],
  tree: [0x3b, 0x6e, 0x2a],
  stairs: [0xe0, 0xc0, 0x6a],
} as const;

type Rgb = readonly [number, number, number];

/** Cached whole-world map with live markers and the camera view, in screen space. */
export class Minimap extends Container {
  private terrain = new Sprite();
  private markers = new Graphics();
  private border = new Graphics();
  private version = -1;
  private texture: Texture | null = null;
  private view: { x: number; y: number; width: number; height: number } | null = null;

  constructor() {
    super();
    this.addChild(this.terrain, this.markers, this.border);
    this.terrain.position.set(2, 2);
    this.border.rect(0, 0, SIZE + 4, SIZE + 4).stroke({ color: 0xe4ce88, width: 2 });
  }

  /** Visible world rectangle in world px (drawn as a frame on the map). */
  setView(rect: { x: number; y: number; width: number; height: number }): void {
    this.view = rect;
  }

  update(view: RenderSnapshot): void {
    const { world } = view, { width, height } = world.meta;
    if (this.version !== view.worldVersion) {
      this.version = view.worldVersion;
      this.rebuild(view);
    }
    this.markers.clear();
    const sx = SIZE / width, sy = SIZE / height;
    if (this.view) {
      this.markers.rect(2 + (this.view.x / 32) * sx, 2 + (this.view.y / 32) * sy, (this.view.width / 32) * sx, (this.view.height / 32) * sy)
        .stroke({ color: 0xffffff, width: 1, alpha: 0.55 });
    }
    for (const entity of view.entities) {
      const x = 2 + entity.x * sx, y = 2 + entity.y * sy;
      if (entity.kind === 'player') this.markers.circle(x, y, 2.7).fill(0xffffff).stroke({ color: 0x102018, width: 1 });
      else if (entity.kind === 'enemy') this.markers.circle(x, y, 1.2).fill(0xff6f63);
      else if (entity.kind === 'portal') this.markers.circle(x, y, 2.2).fill(entity.active ? 0xcd8cff : 0x8a7aa0);
      else if (entity.spriteKey === 'coin') this.markers.circle(x, y, 1).fill(0xf7ce56);
    }
  }

  private rebuild(view: RenderSnapshot): void {
    const { world } = view, { width, height } = world.meta;
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(width, height);
    const put = (i: number, c: Rgb) => { img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255; };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const tile = world.tiles[i] ?? 0;
      let c: Rgb = C.grass;
      if (tile === Tile.STAIRS) c = C.stairs;
      else if (isElevatedTile(tile)) {
        const m = elevationMask(world.tiles, width, height, x, y);
        c = !(m & NB.S) ? C.face : (m & (NB.N | NB.E | NB.W)) !== (NB.N | NB.E | NB.W) ? C.rim : C.plateau;
      } else if (tile === Tile.RIVER) c = C.water;
      else if (tile === Tile.FOREST || tile === Tile.BORDER) c = C.forest;
      else if (tile === Tile.MUD) c = C.mud;
      else if (tile === Tile.RAMP || tile === Tile.LOG) c = C.bridge;
      put(i, c);
    }
    for (const p of world.props) {
      if (p.kind !== 'tree') continue;
      // Canopy footprint: trunk tile plus its neighbours left/right and above.
      for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = p.tileX + dx, y = p.tileY + dy;
        if (x >= 0 && y >= 0 && x < width && y < height && (dx === 0 || dy === 0)) put(y * width + x, C.tree);
      }
    }
    ctx.putImageData(img, 0, 0);
    this.texture?.destroy(true);
    this.texture = Texture.from(canvas);
    this.texture.source.scaleMode = 'linear';
    this.terrain.texture = this.texture;
    this.terrain.width = SIZE;
    this.terrain.height = SIZE;
  }
}
