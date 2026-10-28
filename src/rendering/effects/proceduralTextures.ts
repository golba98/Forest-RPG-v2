import { Texture } from 'pixi.js';
import { PROCEDURAL_SPRITES } from '../../animation/AnimationDefs';

/**
 * Small textures drawn at runtime for effects that have no sprite art.
 * Built once per renderer from 2D canvases (crisp pixel art except `glow`).
 */
export interface EffectTextures {
  /** Legacy magic bolt: filled circle with a white rim (PROCEDURAL_SPRITES). */
  readonly bolt: Texture;
  /** Soft radial falloff, white; tint and blend additively. */
  readonly glow: Texture;
  /** 3×3 plus-shaped spark, white; tint per use. */
  readonly spark: Texture;
  /** Thin circle outline, white; tint per use. */
  readonly ring: Texture;
  /** Two-tone pixel leaf. */
  readonly leaf: Texture;
  /** Pixel-art cumulus shapes (white, shaded underside); drawn scaled up with nearest sampling. */
  readonly clouds: readonly Texture[];
}

function canvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  const ctx = el.getContext('2d');
  if (ctx) draw(ctx);
  return Texture.from(el);
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

export function createEffectTextures(): EffectTextures {
  const def = PROCEDURAL_SPRITES.magic_bolt;
  const r = def?.radiusPx ?? 5;
  const size = r * 2 + 2;
  const bolt = canvas(size, size, (ctx) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
      if (d > r + 0.5) continue;
      ctx.fillStyle = d > r - 1 ? hex(def?.outlineColor ?? 0xffffff) : d < r * 0.45 ? '#e8fbff' : hex(def?.color ?? 0x64c8ff);
      ctx.fillRect(x, y, 1, 1);
    }
  });

  const glow = canvas(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  glow.source.scaleMode = 'linear';

  const spark = canvas(3, 3, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(1, 0, 1, 3);
    ctx.fillRect(0, 1, 3, 1);
  });

  const ring = canvas(32, 32, (ctx) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 16);
      if (d <= 15.5 && d > 13.5) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });

  const leaf = canvas(5, 3, (ctx) => {
    ctx.fillStyle = '#c9b54e';
    ctx.fillRect(1, 0, 3, 1);
    ctx.fillRect(0, 1, 4, 1);
    ctx.fillStyle = '#8f7a2c';
    ctx.fillRect(1, 2, 3, 1);
    ctx.fillRect(4, 1, 1, 1);
  });

  const clouds = [11, 23, 37, 59].map((seed) => cloudShape(seed));

  return { bolt, glow, spark, ring, leaf, clouds };
}

/** Deterministic 0..1 sequence for cloud shapes. */
function seq(seed: number): () => number {
  let a = seed * 2654435761 >>> 0;
  return () => {
    a = (a ^ (a << 13)) >>> 0; a = (a ^ (a >>> 17)) >>> 0; a = (a ^ (a << 5)) >>> 0;
    return a / 4294967296;
  };
}

/**
 * Pixel-art cumulus: a scalloped outline of round puffs (big dome in the
 * middle), shaded by position relative to the silhouette only. That gives a
 * bright rim along the top, a plain body, and a cool band hugging the
 * underside with a darker 1 px bottom line. Interior circles or creases read
 * as stacked balls, not a cloud.
 */
function cloudShape(seed: number): Texture {
  // ~200 px wide: scaled ~2–3× to 12–18 tiles, a texel is a sprite-sized pixel.
  const W = 200, H = 100;
  const r = seq(seed);
  const base = H - 16;
  const dome: [number, number, number] = [W / 2 + (r() - 0.5) * 16, base - 22 - r() * 6, 30 + r() * 6];
  const puffs: Array<[number, number, number]> = [dome];
  for (const side of [-1, 1]) {
    let x = dome[0], rad = dome[2];
    for (;;) {
      const next = rad * (0.6 + r() * 0.18);
      x += side * (rad * 0.72 + next * 0.5);
      rad = next;
      if (rad < 8 || x - rad < 2 || x + rad > W - 2) break;
      puffs.push([x, base - rad * (0.45 + r() * 0.35), rad]);
    }
  }
  // Underside lobes: smaller puffs below the base line make it scalloped, not flat.
  for (const [cx, , rad] of puffs.slice()) if (rad > 12) puffs.push([cx + (r() - 0.5) * rad * 0.6, base + 2, rad * 0.45]);
  const inside = (x: number, y: number) => puffs.some(([cx, cy, rad]) => (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad);
  return canvas(W, H, (ctx) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const px = x + 0.5, py = y + 0.5;
      if (!inside(px, py)) continue;
      let c: string;
      if (!inside(px, py + 1)) c = '#93a8bc'; // bottom line
      else if (!inside(px, py + 5)) c = '#b9c9d7'; // underside band
      else if (!inside(px, py - 1) || !inside(px - 1, py)) c = '#d6e2ec'; // outer top/left line
      else if (!inside(px - 2, py - 5)) c = '#ffffff'; // lit rim
      else if (!inside(px + 3, py + 12)) c = '#e2eaf1'; // soft lower body
      else c = '#f2f6fa';
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  });
}

export function destroyEffectTextures(t: EffectTextures): void {
  for (const tex of [t.bolt, t.glow, t.spark, t.ring, t.leaf, ...t.clouds]) tex.destroy(true);
}
