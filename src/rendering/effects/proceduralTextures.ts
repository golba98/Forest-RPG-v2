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
 * A cumulus seen from above: a union of overlapping round lobes, flattened
 * underneath, white on top with a cool shaded underside and a soft 1 px fringe.
 */
function cloudShape(seed: number): Texture {
  // ~240 px wide so, scaled 2–3× to 14–24 tiles, its pixels match the sprites'.
  const W = 240, H = 128;
  const r = seq(seed);
  const lobes: Array<[number, number, number]> = [];
  const count = 9 + Math.floor(r() * 5);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const rise = Math.sin(t * Math.PI);
    lobes.push([26 + t * (W - 52) + (r() - 0.5) * 18, H * 0.58 - rise * (16 + r() * 22), 18 + rise * 24 + r() * 10]);
  }
  const floor = H - 14;
  const inside = (x: number, y: number) => y < floor && lobes.some(([cx, cy, rad]) => (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad);
  return canvas(W, H, (ctx) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const px = x + 0.5, py = y + 0.5;
      if (!inside(px, py)) continue;
      // Soft 2 px fringe, a cool shaded underside, a lit top-left and stepped mid-tones.
      const fringe = !inside(px - 2, py) || !inside(px + 2, py) || !inside(px, py - 2) || !inside(px, py + 2);
      const under = !inside(px + 3, py + 9);
      const lit = !inside(px - 7, py - 7);
      ctx.fillStyle = fringe ? 'rgba(232,240,246,0.5)' : under ? '#c3d0dc' : lit ? '#ffffff' : (x + y) % 9 === 0 ? '#e4ebf1' : '#eef3f7';
      ctx.fillRect(x, y, 1, 1);
    }
  });
}

export function destroyEffectTextures(t: EffectTextures): void {
  for (const tex of [t.bolt, t.glow, t.spark, t.ring, t.leaf, ...t.clouds]) tex.destroy(true);
}
