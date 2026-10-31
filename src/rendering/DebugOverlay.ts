import { entityFootprint, resolveFootprint } from '../systems/EntityFootprint';
import { isRaisedSurface } from '../world/HillCollisionGeometry';
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { Tile, TILE_PROPERTIES, type TileId } from '../types/tiles';
import type { Entity, AnimState, Direction } from '../types/entities';
import type { WorldData } from '../types/world';
import { PORTAL_ENTER_RADIUS_ASSUMED } from './portalVisualState';
import type { MinimapMode } from './Minimap';

const TILE = 32;
const MAX_BOUNDS = 600;

export interface VisualDebugFlags {
  readonly enabled: boolean;
  /** Solid tiles, solid props and entity collision boxes. */
  readonly colliders: boolean;
  readonly tileGrid: boolean;
  readonly spriteBounds: boolean;
  readonly waterCells?: boolean;
  readonly banks?: boolean;
  readonly chunkEdges?: boolean;
  /** Info panel: seed, cursor coordinates, asset under cursor. */
  readonly labels: boolean;
}

export const DEFAULT_DEBUG_FLAGS: VisualDebugFlags = { enabled: false, colliders: true, tileGrid: false, spriteBounds: false, labels: true };

interface HudBounds { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

/** Renderer counters exposed to visual regression tests. */
export interface VisualDebugInfo {
  readonly playerSlash?: import('./effects/EffectsLayer').PlayerSlashView | null;
  /** Actual displayed texture and transform, rather than the next requested pose. */
  readonly playerSprite?: {
    readonly position: { readonly x: number; readonly y: number };
    readonly anim: AnimState;
    readonly facing: Direction;
    readonly animTimeMs: number;
    readonly assetId: string;
    readonly frame: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
    readonly scaleX: number; readonly scaleY: number; readonly rotation: number;
    readonly transform: { readonly a: number; readonly b: number; readonly c: number; readonly d: number };
    readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  } | null;
  readonly groveViews?: readonly { id: string; x: number; y: number; width: number; height: number; scaleX: number; scaleY: number; depth: number; fungi: number }[];
  readonly propViews?: number;
  readonly hilltopViews?: readonly { id: number; x: number; y: number; depth: number; visible: boolean }[];
  readonly playerDepth?: number | undefined;
  readonly wading?: { readonly x: number; readonly waterlineY: number; readonly spriteY: number } | null;
  readonly hud?: {
    readonly x: number; readonly y: number; readonly width: number; readonly height: number;
    readonly level: HudBounds; readonly cluster: HudBounds;
    readonly scale: number; readonly heartCount: number; readonly slotCount: number; readonly visible: boolean;
  } | null;
  readonly placeholderSprites: number;
  readonly portalStates: readonly string[];
  readonly portalViews: number;
  readonly portalTextures?: readonly { id: string; width: number; height: number; placeholder: boolean }[];
  readonly clouds: number;
  /** Rain is currently visible (fading counts). */
  readonly raining: boolean;
  readonly weather?: { readonly drops: number; readonly impacts: number; readonly footsteps: number; readonly positions: readonly { x: number; y: number; material: string; foot: boolean }[] };
  readonly puddles?: readonly { x: number; y: number; amount: number }[];
  readonly riverRepairSkipped?: readonly { x: number; y: number }[];
  readonly effects: number;
  readonly minimapMode: MinimapMode;
  readonly transitionActive: boolean;
  readonly actorChildren: number;
  /** Projectile sprites drawn this frame. */
  readonly projectiles: number;
  readonly forestTrees: number;
  readonly bridges: number;
  readonly bridgeRailSprites: number;
}

/** `window.__RENDER_DEBUG__`, installed in debug builds only. */
export interface RenderDebugGateway {
  setFlags(flags: Partial<VisualDebugFlags>): void;
  getFlags(): VisualDebugFlags;
  getInfo(): VisualDebugInfo;
  /** Preview weather visuals regardless of the simulation's schedule (null = follow the simulation). */
  setWeatherPreview(weather: 'clear' | 'rain' | null): void;
}

declare global {
  interface Window {
    __RENDER_DEBUG__?: RenderDebugGateway;
  }
}

/** Metadata the renderer attaches to the sprites it creates. */
export interface SpriteDebugInfo {
  readonly assetId: string;
  readonly layer: string;
}

/** Axis-aligned collider in tile units (same shape as the simulation's `Collider`). */
export interface DebugCollider {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly classification: 'solid' | 'trigger';
}

export interface DebugFrameContext {
  readonly world: WorldData;
  /** Authoritative simulation entities (positions + collision half-sizes). */
  readonly entities: readonly Entity[];
  /**
   * Object colliders from the simulation, when it exposes them. Without a
   * source, solid props are drawn as whole tiles (the `WorldProp.solid` rule).
   */
  readonly colliders: readonly DebugCollider[] | null;
  readonly visible: { x: number; y: number; width: number; height: number };
  readonly actors: Container;
  readonly spriteInfo: WeakMap<Container, SpriteDebugInfo>;
  readonly screenToWorld: (x: number, y: number) => { x: number; y: number };
  readonly extraLines: readonly string[];
}

/**
 * Development-only visual diagnostics. Geometry comes straight from the
 * collision inputs (TILE_PROPERTIES, `WorldProp.solid`, entity `halfSize`),
 * never from sprite pixels, so mismatches between art and colliders show up.
 */
export class DebugOverlay {
  /** World-space layer; add as the top child of the world root. */
  readonly worldLayer = new Graphics();
  /** Screen-space layer; add to the stage above the world. */
  readonly screenLayer = new Container();
  private readonly bounds = new Graphics();
  private readonly panel = new Text({
    text: '',
    style: { fontFamily: 'monospace', fontSize: 12, fill: 0xf4f7e8, stroke: { color: 0x0b140c, width: 3 }, lineHeight: 15 },
  });
  private flags: VisualDebugFlags = DEFAULT_DEBUG_FLAGS;
  private pointer: { x: number; y: number } | null = null;

  constructor() {
    this.screenLayer.addChild(this.bounds, this.panel);
    this.apply();
  }

  getFlags(): VisualDebugFlags {
    return this.flags;
  }

  setFlags(flags: Partial<VisualDebugFlags>): void {
    this.flags = { ...this.flags, ...flags };
    this.apply();
  }

  setPointer(x: number, y: number): void {
    this.pointer = { x, y };
  }

  update(ctx: DebugFrameContext, screenHeight: number): void {
    const g = this.worldLayer.clear();
    this.bounds.clear();
    if (!this.flags.enabled) return;
    const { world, visible } = ctx;
    const { width, height } = world.meta;
    const x0 = Math.max(0, Math.floor(visible.x / TILE));
    const y0 = Math.max(0, Math.floor(visible.y / TILE));
    const x1 = Math.min(width - 1, Math.ceil((visible.x + visible.width) / TILE));
    const y1 = Math.min(height - 1, Math.ceil((visible.y + visible.height) / TILE));

    if (this.flags.tileGrid) {
      for (let x = x0; x <= x1 + 1; x++) g.moveTo(x * TILE, y0 * TILE).lineTo(x * TILE, (y1 + 1) * TILE);
      for (let y = y0; y <= y1 + 1; y++) g.moveTo(x0 * TILE, y * TILE).lineTo((x1 + 1) * TILE, y * TILE);
      g.stroke({ width: 1, color: 0xffffff, alpha: 0.18 });
    }

    if (this.flags.waterCells || this.flags.banks) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const wet = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < width && ty < height && world.tiles[ty * width + tx] === Tile.RIVER;
        if (!wet(x, y)) continue;
        if (this.flags.waterCells) g.rect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4).fill({ color: 0x35cfff, alpha: 0.3 });
        if (this.flags.banks) for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
          if (wet(x + dx, y + dy)) continue;
          const sx = x * TILE + (dx === 1 ? TILE : 0), sy = y * TILE + (dy === 1 ? TILE : 0);
          g.moveTo(sx, sy).lineTo(sx + (dy ? TILE : 0), sy + (dx ? TILE : 0));
        }
      }
      g.stroke({ color: 0xffcc44, width: 1 });
    }
    if (this.flags.chunkEdges) {
      for (let x = Math.ceil(x0 / 16) * 16; x <= x1; x += 16) g.moveTo(x * TILE, y0 * TILE).lineTo(x * TILE, (y1 + 1) * TILE);
      for (let y = Math.ceil(y0 / 16) * 16; y <= y1; y += 16) g.moveTo(x0 * TILE, y * TILE).lineTo((x1 + 1) * TILE, y * TILE);
      g.stroke({ color: 0xff63eb, width: 2, alpha: 0.8 });
    }

    if (this.flags.colliders) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const tile = world.tiles[y * width + x] as TileId;
        if (!isRaisedSurface(tile) && (TILE_PROPERTIES[tile]?.solid ?? true)) g.rect(x * TILE, y * TILE, TILE, TILE);
      }
      g.fill({ color: 0xff3040, alpha: 0.22 });
      if (ctx.colliders) {
        for (const c of ctx.colliders) if (c.classification === 'solid') g.rect(c.minX * TILE, c.minY * TILE, (c.maxX - c.minX) * TILE, (c.maxY - c.minY) * TILE);
      } else {
        for (const p of world.props) {
          if (!p.solid || p.tileX < x0 || p.tileX > x1 || p.tileY < y0 || p.tileY > y1) continue;
          g.rect(p.tileX * TILE + 1, p.tileY * TILE + 1, TILE - 2, TILE - 2);
        }
      }
      g.stroke({ width: 1.5, color: 0xff9a2e, alpha: 0.95 });
      for (const e of ctx.entities) {
        if (!e.alive) continue;
        const f = resolveFootprint(entityFootprint(e));
        g.rect((e.x + f.offsetX - f.halfWidth) * TILE, (e.y + f.offsetY - f.halfHeight) * TILE, f.halfWidth * 2 * TILE, f.halfHeight * 2 * TILE);
        g.circle(e.x * TILE, e.y * TILE, 1.5);
      }
      g.stroke({ width: 1, color: 0x45f0ff, alpha: 0.95 });
      for (const e of ctx.entities) {
        if (e.kind === 'portal') g.circle(e.x * TILE, e.y * TILE, PORTAL_ENTER_RADIUS_ASSUMED * TILE);
        if (e.kind === 'pickup' && e.alive) g.circle(e.x * TILE, e.y * TILE, 0.7 * TILE);
      }
      g.stroke({ width: 1, color: 0xd8ff5a, alpha: 0.8 });
    }

    let hovered: Container | null = null;
    if (this.flags.spriteBounds || this.flags.labels) {
      let drawn = 0;
      let bestZ = -Infinity;
      for (const child of ctx.actors.children) {
        if (!(child instanceof Sprite) || !child.visible || child.destroyed) continue;
        const b = child.getBounds();
        if (this.flags.spriteBounds && drawn < MAX_BOUNDS) {
          this.bounds.rect(b.x, b.y, b.width, b.height);
          drawn++;
        }
        if (this.pointer && b.containsPoint(this.pointer.x, this.pointer.y) && child.zIndex >= bestZ && ctx.spriteInfo.has(child)) {
          bestZ = child.zIndex;
          hovered = child;
        }
      }
      this.bounds.stroke({ width: 1, color: 0xf5f56a, alpha: 0.7 });
    }

    if (!this.flags.labels) return;
    const lines = [`seed ${world.meta.seed}  level ${world.meta.level}  ${width}×${height}${world.meta.isTutorial ? '  tutorial' : ''}`];
    if (this.pointer) {
      const w = ctx.screenToWorld(this.pointer.x, this.pointer.y);
      const tx = Math.floor(w.x / TILE), ty = Math.floor(w.y / TILE);
      const tile = tx >= 0 && ty >= 0 && tx < width && ty < height ? world.tiles[ty * width + tx] : undefined;
      lines.push(`cursor world (${(w.x / TILE).toFixed(2)}, ${(w.y / TILE).toFixed(2)})  tile (${tx}, ${ty}) id ${tile ?? '-'}${tile !== undefined && (TILE_PROPERTIES[tile as TileId]?.solid ?? true) ? ' solid' : ''}`);
    }
    if (hovered) {
      const info = ctx.spriteInfo.get(hovered);
      const s = hovered as Sprite;
      lines.push(`asset ${info?.assetId ?? '?'}  layer ${info?.layer ?? '?'}  z ${Math.round(s.zIndex)}`);
      lines.push(`anchor (${s.anchor.x.toFixed(2)}, ${s.anchor.y.toFixed(2)})  pos (${s.x.toFixed(1)}, ${s.y.toFixed(1)})  frame ${s.texture.frame.width}×${s.texture.frame.height}`);
    }
    lines.push(...ctx.extraLines);
    lines.push('F3 toggle · red solid tile · orange solid prop · cyan entity box · lime interaction radius');
    this.panel.text = lines.join('\n');
    this.panel.position.set(12, screenHeight - this.panel.height - 36);
  }

  private apply(): void {
    this.worldLayer.visible = this.flags.enabled;
    this.screenLayer.visible = this.flags.enabled;
    this.panel.visible = this.flags.labels;
  }
}

const PANEL_ID = 'visual-debug-panel';

/**
 * F3 toggles the overlay; a small checkbox panel switches individual layers.
 * Only installed in debug builds (dev server or `?debug=1`).
 */
export function attachVisualDebugControls(canvas: HTMLCanvasElement, overlay: DebugOverlay): { sync(): void; dispose(): void } {
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Visual debug layers');
  panel.style.cssText = 'position:fixed;right:20px;top:170px;z-index:40;display:none;padding:8px 10px;border-radius:6px;background:rgba(11,20,12,.82);color:#f4f7e8;font:12px monospace;line-height:1.7';
  const options: Array<[keyof VisualDebugFlags, string]> = [['colliders', 'Colliders'], ['tileGrid', 'Tile grid'], ['spriteBounds', 'Sprite bounds'], ['labels', 'Info / coords'], ['waterCells', 'Water cells'], ['banks', 'Banks'], ['chunkEdges', 'Chunk edges']];
  for (const [key, label] of options) {
    const row = document.createElement('label');
    row.style.display = 'block';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.flag = key;
    box.checked = Boolean(overlay.getFlags()[key]);
    box.addEventListener('change', () => overlay.setFlags({ [key]: box.checked }));
    row.append(box, ` ${label}`);
    panel.append(row);
  }
  document.body.append(panel);
  const sync = () => {
    panel.style.display = overlay.getFlags().enabled ? 'block' : 'none';
    for (const box of panel.querySelectorAll<HTMLInputElement>('input[data-flag]')) {
      box.checked = Boolean(overlay.getFlags()[box.dataset.flag as keyof VisualDebugFlags]);
    }
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.code !== 'F3') return;
    ev.preventDefault();
    overlay.setFlags({ enabled: !overlay.getFlags().enabled });
    sync();
  };
  const onMove = (ev: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    overlay.setPointer(ev.clientX - r.left, ev.clientY - r.top);
  };
  window.addEventListener('keydown', onKey);
  canvas.addEventListener('pointermove', onMove);
  return {
    sync,
    dispose: () => {
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointermove', onMove);
      panel.remove();
    },
  };
}
