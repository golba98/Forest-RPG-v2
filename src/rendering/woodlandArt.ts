import type { WorldData } from '../types/world';
import { Tile } from '../types/tiles';
import { Texture } from 'pixi.js';
import { BRIDGE_PALETTE as W } from './bridgeArt';

// Project-owned native pixel artwork. No resampling, gradients or external source.
const P = {
  dark: 0x253a31,
  shade: 0x344e35,
  leaf: 0x496839,
  mid: 0x638344,
  light: 0x8c9e53,
  glint: 0xb1b66c,
  bark: W.wood,
  root: W.dark,
};
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
function crown(p: Pixels, cx: number, cy: number, rx: number, ry: number, seed: number): void {
  const outline: Point[] = [
    [-1, -0.1],
    [-0.94, -0.48],
    [-0.65, -0.55],
    [-0.58, -0.83],
    [-0.23, -0.92],
    [0.04, -1],
    [0.31, -0.83],
    [0.62, -0.78],
    [0.7, -0.5],
    [0.96, -0.38],
    [1, 0.02],
    [0.82, 0.2],
    [0.88, 0.48],
    [0.54, 0.62],
    [0.35, 0.9],
    [-0.02, 0.83],
    [-0.25, 1],
    [-0.56, 0.72],
    [-0.77, 0.7],
    [-0.83, 0.35],
    [-1, 0.27],
  ];
  const shape = (scale: number, ox: number, oy: number) =>
    outline.map(
      ([x, y]) =>
        [Math.round(cx + x * rx * scale + ox), Math.round(cy + y * ry * scale + oy)] as Point,
    );
  p.poly(shape(1, 0, 0), P.dark);
  p.poly(shape(0.93, -1, -1), P.shade);
  p.poly(shape(0.83, -2, -3), P.leaf);
  p.poly(shape(0.66, -rx * 0.13, -ry * 0.2), P.mid);
  p.poly(shape(0.4, -rx * 0.28, -ry * 0.32), P.light);
  // Deliberate short leaf clusters following the light-facing contour.
  for (let i = 0; i < 7; i++) {
    const x = Math.round(
        cx - rx * 0.65 + ((i * 7 + seed * 3) % Math.max(1, Math.floor(rx * 1.05))),
      ),
      y = Math.round(cy - ry * 0.6 + ((i * 5 + seed) % Math.max(1, Math.floor(ry * 0.65))));
    p.line(x, y, x + 3, y, P.light);
    p.pixel(x - 1, y + 1, P.mid);
    if (i % 3 === 0) p.line(x, y - 1, x + 1, y - 1, P.glint);
  }
  p.line(cx + rx * 0.32, cy + ry * 0.55, cx + rx * 0.53, cy + ry * 0.48, P.mid);
}
function tree(w: number, h: number, young = false, boundary = false): Texture {
  const p = new Pixels(w, h),
    cx = Math.floor(w / 2),
    bottom = h - 2,
    trunk = young ? 4 : 7;
  p.shadow(cx, bottom - 1, young ? 11 : 20, 3);
  p.poly(
    [
      [cx - trunk, bottom - 25],
      [cx + trunk - 2, bottom - 26],
      [cx + trunk - 1, bottom - 7],
      [cx + 13, bottom],
      [cx + 5, bottom],
      [cx, bottom - 5],
      [cx - 8, bottom],
      [cx - 14, bottom],
      [cx - 5, bottom - 10],
    ],
    W.outline,
  );
  p.poly(
    [
      [cx - 4, bottom - 30],
      [cx + 3, bottom - 30],
      [cx + 3, bottom - 8],
      [cx + 9, bottom - 2],
      [cx + 3, bottom - 3],
      [cx - 1, bottom - 9],
      [cx - 8, bottom - 2],
      [cx - 3, bottom - 11],
    ],
    W.beam,
  );
  p.line(cx - 3, bottom - 27, cx - 2, bottom - 8, W.wood);
  p.line(cx - 2, bottom - 22, cx - 1, bottom - 13, W.light);
  p.line(cx + 2, bottom - 20, cx + 2, bottom - 7, W.grain);
  p.line(cx - 2, bottom - 24, cx - 14, bottom - 35, W.dark);
  p.line(cx + 2, bottom - 21, cx + 13, bottom - 32, W.dark);
  if (young) {
    crown(p, cx + 3, 15, 12, 13, 3);
    crown(p, cx - 5, 24, 12, 10, 6);
  } else {
    crown(p, cx + 2, h * 0.32, w * 0.34, h * 0.27, 1);
    crown(p, cx - w * 0.21, h * 0.46, w * 0.25, h * 0.21, 2);
    crown(p, cx + w * 0.23, h * 0.47, w * 0.24, h * 0.22, 4);
    crown(p, cx - 3, h * 0.31, w * 0.28, h * 0.23, 5);
    crown(p, cx - 4, h * 0.55, w * 0.27, h * 0.16, 7);
  }
  if (boundary) {
    crown(p, 12, h - 12, 13, 10, 2);
    crown(p, w - 13, h - 10, 14, 9, 3);
  }
  p.line(cx - 9, bottom - 1, cx - 6, bottom - 4, P.mid);
  p.line(cx + 6, bottom - 2, cx + 9, bottom - 4, P.leaf);
  return p.texture();
}
function bush(w: number, h: number): Texture {
  const p = new Pixels(w, h);
  p.shadow(w / 2, h - 3, w * 0.43, 2);
  crown(p, w * 0.5, h - 12, w * 0.43, 9, 2);
  crown(p, w * 0.33, h - 10, w * 0.28, 7, 3);
  return p.texture();
}
function log(w: number, h: number, vertical = false, stump = false): Texture {
  const p = new Pixels(w, h),
    cx = Math.floor(w / 2),
    bottom = h - 3;
  p.shadow(cx, bottom, stump ? 12 : vertical ? 10 : w * 0.46, 3);
  if (stump) {
    p.poly(
      [
        [7, 13],
        [24, 12],
        [24, 24],
        [29, 28],
        [22, 29],
        [18, 26],
        [14, 28],
        [5, 29],
        [8, 23],
      ],
      W.outline,
    );
    p.poly(
      [
        [9, 14],
        [22, 14],
        [22, 25],
        [25, 27],
        [20, 26],
        [16, 23],
        [12, 26],
        [8, 27],
      ],
      W.beam,
    );
    p.line(10, 15, 10, 24, W.wood);
    p.line(14, 17, 13, 24, W.grain);
    p.line(20, 16, 20, 24, W.wood);
    p.poly(
      [
        [7, 13],
        [10, 9],
        [21, 8],
        [25, 12],
        [23, 16],
        [12, 18],
        [7, 16],
      ],
      W.outline,
    );
    p.poly(
      [
        [9, 12],
        [12, 10],
        [21, 10],
        [23, 12],
        [21, 15],
        [13, 16],
        [9, 15],
      ],
      W.light,
    );
    p.line(12, 12, 20, 12, W.grain);
    p.line(11, 14, 17, 15, W.grain);
    p.pixel(17, 13, W.wood);
    p.line(8, 26, 12, 24, P.leaf);
    p.line(8, 25, 10, 24, P.mid);
  } else if (vertical) {
    p.poly(
      [
        [12, 4],
        [20, 3],
        [23, 9],
        [21, 18],
        [23, 29],
        [21, 43],
        [13, 45],
        [10, 39],
        [12, 27],
        [9, 18],
      ],
      W.outline,
    );
    p.poly(
      [
        [13, 7],
        [18, 6],
        [20, 13],
        [18, 25],
        [20, 37],
        [18, 43],
        [13, 42],
        [13, 28],
        [11, 18],
      ],
      W.beam,
    );
    p.line(13, 10, 13, 20, W.wood);
    p.line(14, 22, 15, 38, W.wood);
    p.line(18, 14, 17, 29, W.grain);
    p.poly(
      [
        [11, 7],
        [13, 3],
        [19, 3],
        [21, 7],
        [19, 10],
        [13, 10],
      ],
      W.light,
    );
    p.line(14, 6, 18, 6, W.grain);
    p.pixel(16, 7, W.dark);
    p.line(19, 25, 26, 21, W.outline);
    p.line(19, 24, 25, 20, W.beam);
    p.line(11, 16, 14, 13, P.mid);
    p.line(12, 17, 14, 15, P.light);
    p.line(13, 32, 15, 30, P.leaf);
  } else {
    p.poly(
      [
        [1, 21],
        [4, 17],
        [12, 18],
        [18, 16],
        [27, 18],
        [30, 22],
        [29, 28],
        [22, 29],
        [15, 27],
        [4, 29],
        [1, 26],
      ],
      W.outline,
    );
    p.poly(
      [
        [3, 21],
        [6, 19],
        [14, 20],
        [19, 18],
        [26, 20],
        [26, 26],
        [20, 27],
        [14, 25],
        [5, 27],
        [3, 24],
      ],
      W.beam,
    );
    p.line(5, 20, 14, 21, W.wood);
    p.line(16, 19, 24, 21, W.light);
    p.line(5, 25, 13, 24, W.grain);
    p.line(17, 23, 24, 24, W.grain);
    p.poly(
      [
        [26, 20],
        [28, 19],
        [30, 22],
        [29, 26],
        [27, 27],
        [25, 24],
      ],
      W.light,
    );
    p.line(28, 22, 28, 24, W.grain);
    p.pixel(27, 23, W.dark);
    p.line(13, 19, 10, 14, W.outline);
    p.line(14, 18, 12, 14, W.beam);
    p.line(5, 21, 10, 21, P.mid);
    p.line(6, 20, 9, 20, P.light);
    p.line(17, 25, 20, 25, P.leaf);
  }
  return p.texture();
}
function floorDetail(kind: number): Texture {
  const p = new Pixels(24, 24);
  p.shadow(12, 21, 9, 2);
  if (kind === 0) {
    for (let i = 0; i < 7; i++) {
      const x = 3 + i * 3,
        y = 8 + (i % 3) * 3;
      p.line(12, 21, x, y, P.leaf);
      p.line(x, y, x + (x < 12 ? 3 : -3), y + 1, P.mid);
      p.line(x + (x < 12 ? 2 : -2), y + 3, x + (x < 12 ? 5 : -5), y + 4, P.light);
    }
  } else {
    for (const [x, y, r] of [
      [7, 16, 4],
      [16, 12, 5],
      [17, 20, 3],
    ] as const) {
      p.rect(x, y, 2, 5, W.rope);
      p.poly(
        [
          [x - r, y],
          [x - r + 1, y - 3],
          [x, y - 5],
          [x + r, y - 2],
          [x + r, y],
        ],
        0x714b3b,
      );
      p.line(x - r + 2, y - 3, x + 1, y - 4, 0xaf7954);
      p.pixel(x, y - 3, 0xd4b786);
    }
  }
  return p.texture();
}
export function treeArt(x: number, y: number, modern: boolean): string {
  return modern
    ? (['woodland_tree_tall', 'woodland_tree_broad', 'woodland_tree_young'][
        ((Math.imul(x, 17) ^ Math.imul(y, 31)) >>> 0) % 3
      ] ?? 'woodland_tree_tall')
    : 'woodland_tree_legacy';
}
export function createWoodlandTextures(): Map<string, Texture> {
  return new Map([
    ['woodland_tree_tall', tree(64, 80)],
    ['woodland_tree_broad', tree(80, 64)],
    ['woodland_tree_young', tree(40, 48, true)],
    ['woodland_tree_legacy', tree(64, 64)],
    ['woodland_tree_boundary', tree(64, 64, false, true)],
    ['decor_bush_small', bush(16, 48)],
    ['decor_bush_obstacle', bush(32, 32)],
    ['decor_log_horizontal', log(32, 32)],
    ['decor_log_vertical', log(32, 48, true)],
    ['decor_log_stump', log(32, 32, true, true)],
    ['woodland_fern', floorDetail(0)],
    ['woodland_mushroom', floorDetail(1)],
  ]);
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
      p.line(3, 26, 5, 26, P.leaf);
      out.set(`woodland_chest_${variant}_${frame}`, p.texture());
    }
  return out;
}

/** Wet banks favor broad crowns; dry clearings retain young trees and flowers. */
export function nearRiver(world: WorldData, x: number, y: number): boolean {
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const tx = x + dx,
        ty = y + dy;
      if (
        tx >= 0 &&
        ty >= 0 &&
        tx < world.meta.width &&
        ty < world.meta.height &&
        world.tiles[ty * world.meta.width + tx] === Tile.RIVER
      )
        return true;
    }
  return false;
}
