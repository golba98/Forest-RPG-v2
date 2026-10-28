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

  return { bolt, glow, spark, ring, leaf };
}

export function destroyEffectTextures(t: EffectTextures): void {
  for (const tex of [t.bolt, t.glow, t.spark, t.ring, t.leaf]) tex.destroy(true);
}
