import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { Tile } from '../types/tiles';
import { bridgeGeometry } from '../world/BridgeGeometry';
import type { RenderEntityView, RenderSnapshot } from '../types/render';
import { NB, elevationMask, isElevatedTile } from './hillAutotile';

export type MinimapMode = 'radar' | 'full' | 'hidden';

/** Radar panel size and zoom (logical px, before UI scale). */
const RADAR_SIZE = 200;
const RADAR_PX_PER_TILE = 4;
const RADAR_MARGIN = 20;

/**
 * Colours sampled from the rendered textures and pushed apart for contrast at
 * minimap size: ground darker, hill tops lighter, cliff faces and rims in the
 * tileset's rock tones, stairs pale stone, water a readable blue.
 */
const C = {
  grass: [0x4c, 0x68, 0x2a],
  plateau: [0x8f, 0xb0, 0x46],
  rim: [0xc8, 0x8a, 0x30],
  face: [0x8a, 0x4f, 0x1b],
  stairs: [0xe8, 0xd4, 0x96],
  water: [0x2e, 0x6c, 0x8c],
  mud: [0x5a, 0x40, 0x26],
  bridge: [0xb0, 0x74, 0x44],
  forest: [0x22, 0x46, 0x1c],
  tree: [0x2d, 0x5c, 0x22],
} as const;
type Rgb = readonly [number, number, number];

/** Point on the radar's square rim (inset by `inset`) in the direction (dx, dy) from its centre. */
export function rimPoint(dx: number, dy: number, half: number, inset: number): { x: number; y: number } {
  const r = half - inset;
  const k = r / Math.max(Math.abs(dx), Math.abs(dy), 1e-9);
  return { x: dx * k, y: dy * k };
}

/** World tile position → radar-local px, with the player at the centre. */
export function radarPoint(x: number, y: number, playerX: number, playerY: number, size = RADAR_SIZE, pxPerTile = RADAR_PX_PER_TILE): { x: number; y: number } {
  return { x: size / 2 + (x - playerX) * pxPerTile, y: size / 2 + (y - playerY) * pxPerTile };
}

/**
 * Minimap with two views. The radar (default) is a crisp, zoomed map centred
 * on the player in a HUD-style panel, with an arrow on its rim toward the
 * portal when it is off-map. The full view (M) shows the whole world in a large
 * centred panel at an integer scale. M cycles radar → full → hidden.
 */
export class Minimap extends Container {
  private mode: MinimapMode = 'radar';
  private readonly panel = new Graphics();
  private readonly map = new Container();
  private readonly mapMask = new Graphics();
  private readonly terrain = new Sprite();
  private readonly markers = new Graphics();
  private readonly north = new Text({ text: 'N', style: { fontFamily: 'Georgia', fontSize: 11, fontWeight: 'bold', fill: 0xf5ebcf, stroke: { color: 0x172719, width: 3 } } });
  private texture: Texture | null = null;
  private version = -1;
  private worldW = 1;
  private worldH = 1;
  private screenW = 0;
  private screenH = 0;
  private uiScale = 1;
  private view: { x: number; y: number; width: number; height: number } | null = null;

  constructor() {
    super();
    this.map.addChild(this.terrain);
    this.map.mask = this.mapMask;
    this.north.anchor.set(0.5, 0);
    this.addChild(this.panel, this.mapMask, this.map, this.markers, this.north);
  }

  get currentMode(): MinimapMode {
    return this.mode;
  }

  setMode(mode: MinimapMode): void {
    this.mode = mode;
    this.visible = mode !== 'hidden';
    this.relayout();
  }

  /** Radar → full map → hidden → radar. */
  cycle(): MinimapMode {
    this.setMode(this.mode === 'radar' ? 'full' : this.mode === 'full' ? 'hidden' : 'radar');
    return this.mode;
  }

  /** Screen size (CSS px) and UI scale; call every frame, cheap when unchanged. */
  layout(screenW: number, screenH: number, uiScale: number): void {
    if (screenW === this.screenW && screenH === this.screenH && uiScale === this.uiScale) return;
    this.screenW = screenW;
    this.screenH = screenH;
    this.uiScale = uiScale;
    this.relayout();
  }

  /** Visible world rectangle in world px (drawn as a frame on the full map). */
  setView(rect: { x: number; y: number; width: number; height: number }): void {
    this.view = rect;
  }

  update(snapshot: RenderSnapshot): void {
    if (this.version !== snapshot.worldVersion) {
      this.version = snapshot.worldVersion;
      this.rebuild(snapshot);
      this.relayout();
    }
    if (this.mode === 'hidden') return;
    const player = snapshot.entities.find((e) => e.id === snapshot.playerId);
    if (!player) return;
    this.markers.clear();
    if (this.mode === 'radar') this.drawRadar(snapshot, player);
    else this.drawFull(snapshot, player);
  }

  private relayout(): void {
    this.panel.clear();
    this.mapMask.clear();
    if (this.mode === 'radar') {
      this.scale.set(this.uiScale);
      this.position.set(this.screenW - (RADAR_SIZE + RADAR_MARGIN) * this.uiScale, RADAR_MARGIN * this.uiScale);
      this.panel.roundRect(-6, -6, RADAR_SIZE + 12, RADAR_SIZE + 12, 10).fill({ color: 0x12261b, alpha: 0.9 }).stroke({ color: 0xb29b63, width: 1.5 });
      this.mapMask.roundRect(0, 0, RADAR_SIZE, RADAR_SIZE, 6).fill(0xffffff);
      this.terrain.scale.set(RADAR_PX_PER_TILE);
      this.north.visible = true;
      this.north.position.set(RADAR_SIZE / 2, -5);
    } else if (this.mode === 'full') {
      const { size, k } = this.fullMetrics();
      this.scale.set(1);
      this.position.set(Math.round((this.screenW - size.w) / 2), Math.round((this.screenH - size.h) / 2));
      this.panel.roundRect(-10, -10, size.w + 20, size.h + 20, 12).fill({ color: 0x12261b, alpha: 0.94 }).stroke({ color: 0xb29b63, width: 2 });
      this.mapMask.rect(0, 0, size.w, size.h).fill(0xffffff);
      this.terrain.scale.set(k);
      this.terrain.position.set(0, 0);
      this.north.visible = false;
    }
  }

  /** Integer scale that fits the whole world in ~80% of the shorter screen side. */
  private fullMetrics(): { size: { w: number; h: number }; k: number } {
    const fit = Math.min(this.screenW, this.screenH) * 0.8;
    const k = Math.max(1, Math.floor(fit / Math.max(this.worldW, this.worldH)));
    return { size: { w: this.worldW * k, h: this.worldH * k }, k };
  }

  private drawRadar(snapshot: RenderSnapshot, player: RenderEntityView): void {
    const g = this.markers;
    const half = RADAR_SIZE / 2;
    this.terrain.position.set(Math.round(half - player.x * RADAR_PX_PER_TILE), Math.round(half - player.y * RADAR_PX_PER_TILE));
    const inside = (p: { x: number; y: number }, pad: number) => p.x >= pad && p.y >= pad && p.x <= RADAR_SIZE - pad && p.y <= RADAR_SIZE - pad;
    for (const e of snapshot.entities) {
      if (e.kind === 'player') continue;
      const at = radarPoint(e.x, e.y, player.x, player.y);
      if (e.kind === 'portal') {
        const open = e.active === true;
        if (inside(at, 6)) this.diamond(at.x, at.y, 6, open ? 0xd9a6ff : 0x9a7cc0);
        else {
          // Off-map: arrow on the rim pointing toward the portal.
          const dx = e.x - player.x, dy = e.y - player.y;
          const rim = rimPoint(dx, dy, half, 9);
          const a = Math.atan2(dy, dx);
          const tip = { x: half + rim.x + Math.cos(a) * 6, y: half + rim.y + Math.sin(a) * 6 };
          const l = { x: half + rim.x + Math.cos(a + 2.4) * 6, y: half + rim.y + Math.sin(a + 2.4) * 6 };
          const r = { x: half + rim.x + Math.cos(a - 2.4) * 6, y: half + rim.y + Math.sin(a - 2.4) * 6 };
          g.poly([tip.x, tip.y, l.x, l.y, r.x, r.y]).fill(open ? 0xd9a6ff : 0xb59ad6).stroke({ color: 0x1a1024, width: 1.5 });
        }
        continue;
      }
      if (!inside(at, 2)) continue;
      if (e.kind === 'enemy') {
        const boss = e.spriteKey === 'beetle';
        g.circle(at.x, at.y, boss ? 5 : 3).fill(e.formation !== undefined ? 0xabcac8 : boss ? 0xff9a3c : 0xff5a4e).stroke({ color: 0x2a0d0b, width: 1 });
      } else if (e.spriteKey === 'coin') g.circle(at.x, at.y, 2.5).fill(0xffd84a).stroke({ color: 0x3a2a08, width: 1 });
      else if (e.kind === 'pickup') g.circle(at.x, at.y, 2.5).fill(0xff8fd0).stroke({ color: 0x3a0f2a, width: 1 });
    }
    for (const site of snapshot.encounters?.sites ?? []) if (site.discovered) {
      const at = radarPoint(site.x, site.y, player.x, player.y);
      if (inside(at, 5)) this.diamond(at.x, at.y, 4, site.kind === 'nest' ? site.phase === 'defeated' ? 0x819d6e : 0xc89c5e : 0xabcac8);
    }
    this.playerMarker(half, half, player);
  }

  private drawFull(snapshot: RenderSnapshot, player: RenderEntityView): void {
    const g = this.markers;
    const { k } = this.fullMetrics();
    const at = (x: number, y: number) => ({ x: x * k, y: y * k });
    if (this.view) {
      // Small worlds can fit entirely inside the camera. Draw only the visible
      // world area so its frame stays within the full-map panel.
      const left = Math.max(0, this.view.x / 32);
      const top = Math.max(0, this.view.y / 32);
      const right = Math.min(this.worldW, (this.view.x + this.view.width) / 32);
      const bottom = Math.min(this.worldH, (this.view.y + this.view.height) / 32);
      if (right > left && bottom > top) {
        g.rect(left * k, top * k, (right - left) * k, (bottom - top) * k).stroke({ color: 0xffffff, width: 1.5, alpha: 0.7 });
      }
    }
    for (const site of snapshot.encounters?.sites ?? []) if (site.discovered) {
      const p = at(site.x, site.y);
      this.diamond(p.x, p.y, 4, site.kind === 'nest' ? site.phase === 'defeated' ? 0x819d6e : 0xc89c5e : 0xabcac8);
    }
    for (const e of snapshot.entities) {
      const p = at(e.x, e.y);
      if (e.kind === 'portal') this.diamond(p.x, p.y, 7, e.active ? 0xd9a6ff : 0x9a7cc0);
      else if (e.kind === 'enemy') g.circle(p.x, p.y, e.spriteKey === 'beetle' ? 5 : 3).fill(e.formation !== undefined ? 0xabcac8 : e.spriteKey === 'beetle' ? 0xff9a3c : 0xff5a4e).stroke({ color: 0x2a0d0b, width: 1 });
      else if (e.spriteKey === 'coin') g.circle(p.x, p.y, 2.5).fill(0xffd84a).stroke({ color: 0x3a2a08, width: 1 });
      else if (e.kind === 'pickup') g.circle(p.x, p.y, 2.5).fill(0xff8fd0);
    }
    const pp = at(player.x, player.y);
    this.playerMarker(pp.x, pp.y, player);
  }

  private playerMarker(x: number, y: number, player: RenderEntityView): void {
    const v = FACING[player.facing] ?? [0, 1];
    this.markers.moveTo(x, y).lineTo(x + v[0] * 8, y + v[1] * 8).stroke({ color: 0xffffff, width: 2 });
    this.markers.circle(x, y, 4.5).fill(0xffffff).stroke({ color: 0x102018, width: 1.5 });
  }

  private diamond(x: number, y: number, r: number, color: number): void {
    this.markers.poly([x, y - r, x + r, y, x, y + r, x - r, y]).fill(color).stroke({ color: 0x1a1024, width: 1.5 });
  }

  /** Bakes the world into a 1-texel-per-tile image (nearest-sampled when scaled). */
  private rebuild(snapshot: RenderSnapshot): void {
    const { world } = snapshot, { width, height } = world.meta;
    this.worldW = width;
    this.worldH = height;
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
    for (const bridge of world.bridges ?? []) {
      const f = bridgeGeometry(bridge).footprint;
      for (let y = f.minY; y < f.maxY; y++) for (let x = f.minX; x < f.maxX; x++) put(y * width + x, C.bridge);
    }
    for (const p of world.props) {
      if (p.kind !== 'tree') continue;
      if (p.tileX >= 0 && p.tileY >= 0 && p.tileX < width && p.tileY < height) put(p.tileY * width + p.tileX, C.tree);
    }
    ctx.putImageData(img, 0, 0);
    this.texture?.destroy(true);
    this.texture = Texture.from(canvas);
    this.texture.source.scaleMode = 'nearest';
    this.terrain.texture = this.texture;
  }
}

const FACING: Readonly<Record<string, readonly [number, number]>> = {
  N: [0, -1], NE: [0.7, -0.7], E: [1, 0], SE: [0.7, 0.7], S: [0, 1], SW: [-0.7, 0.7], W: [-1, 0], NW: [-0.7, -0.7],
};
