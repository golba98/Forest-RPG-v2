import { Texture } from 'pixi.js';
import { BRIDGE_PALETTE as W } from './bridgeArt';

// Project-authored coin and chest pixels, sharing the bridge material palette.
type Point = readonly [number, number];
class Pixels {
  readonly canvas = document.createElement('canvas');
  readonly ctx: CanvasRenderingContext2D;
  constructor(w: number, h: number) {
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Pixel canvas unavailable');
    this.ctx = ctx;
  }
  pixel(x: number, y: number, c: number, a = 1): void {
    this.ctx.globalAlpha = a;
    this.ctx.fillStyle = `#${c.toString(16).padStart(6, '0')}`;
    this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  rect(x: number, y: number, w: number, h: number, c: number, a = 1): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.pixel(xx, yy, c, a);
  }
  poly(points: readonly Point[], c: number): void {
    const minY = Math.min(...points.map((p) => p[1])),
      maxY = Math.max(...points.map((p) => p[1]));
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length];
        if (!a || !b) continue;
        if (a[1] > y !== b[1] > y) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i < xs.length; i += 2)
        for (let x = Math.ceil(xs[i] ?? 0); x <= Math.floor(xs[i + 1] ?? -1); x++)
          this.pixel(x, y, c);
    }
  }
  line(x: number, y: number, tx: number, ty: number, c: number): void {
    const n = Math.max(Math.abs(tx - x), Math.abs(ty - y));
    for (let i = 0; i <= n; i++)
      this.pixel(x + ((tx - x) * i) / (n || 1), y + ((ty - y) * i) / (n || 1), c);
  }
  shadow(cx: number, cy: number, rx: number, ry: number): void {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d < 1) this.pixel(x, y, 0x1b2924, d < 0.5 ? 0.32 : 0.17);
      }
  }
  texture(): Texture {
    const t = Texture.from(this.canvas);
    t.source.scaleMode = 'nearest';
    return t;
  }
}
export function createLootTextures(): Map<string, Texture> {
  const out = new Map<string, Texture>();
  const coin = new Pixels(128, 32);
  for (let frame = 0; frame < 4; frame++) {
    const cx = frame * 32 + 16,
      rx = [6, 3, 1, 3][frame] ?? 6;
    coin.shadow(cx, 25, 6, 2);
    for (let y = 7; y <= 21; y++)
      for (let x = -rx; x <= rx; x++) {
        const d = (x * x) / (rx * rx) + (y - 14) ** 2 / 49;
        if (d > 1) continue;
        coin.pixel(cx + x, y, d > 0.65 ? 0x80502c : x < 0 ? 0xffdf83 : 0xd79c38);
        if (d < 0.45 && x === 0) coin.pixel(cx + x, y, 0xffedaa);
      }
    coin.line(cx - rx + 1, 12, cx - rx + 1, 15, 0xffedaa);
  }
  out.set('item_coin_anim', coin.texture());
  for (const variant of ['wooden', 'reinforced'])
    for (let frame = 0; frame < 4; frame++) {
      const p = new Pixels(32, 32);
      p.shadow(16, 28, 15, 3);
      const metal = variant === 'reinforced' ? 0x89918a : W.rope;
      p.poly(
        [
          [3, 16],
          [27, 16],
          [29, 20],
          [28, 28],
          [4, 28],
          [2, 23],
        ],
        W.outline,
      );
      p.rect(4, 19, 23, 8, W.beam);
      p.rect(5, 19, 21, 2, W.wood);
      p.line(5, 24, 25, 24, W.grain);
      p.line(5, 27, 26, 27, W.dark);
      p.rect(6, 18, 3, 10, metal);
      p.rect(23, 18, 3, 10, metal);
      p.line(6, 20, 6, 26, W.light);
      p.pixel(7, 25, W.nail);
      p.pixel(24, 25, W.nail);
      const top = frame === 0 ? 12 : frame === 1 ? 8 : 5;
      p.poly(
        [
          [3, top + 3],
          [6, top],
          [25, top],
          [28, top + 3],
          [28, frame === 0 ? 19 : top + 6],
          [3, frame === 0 ? 19 : top + 6],
        ],
        W.outline,
      );
      p.rect(5, top + 2, 21, frame === 0 ? 5 : 3, W.wood);
      p.line(7, top + 1, 24, top + 1, W.light);
      p.line(5, top + 4, 26, top + 4, W.grain);
      p.rect(6, top + 1, 3, frame === 0 ? 7 : 5, metal);
      p.rect(23, top + 1, 3, frame === 0 ? 7 : 5, metal);
      if (frame === 0) {
        p.rect(14, 17, 5, 6, W.outline);
        p.rect(15, 18, 3, 4, 0xd2af62);
        p.pixel(16, 20, W.beam);
      } else {
        p.rect(5, 17, 21, 3, 0x252e29);
        if (frame < 3) {
          p.rect(10, 17, 3, 2, 0xe7c369);
          p.rect(19, 18, 3, 1, 0xffdf83);
        }
      }
      p.line(3, 26, 5, 26, 0x496839);
      out.set(`woodland_chest_${variant}_${frame}`, p.texture());
    }
  return out;
}
