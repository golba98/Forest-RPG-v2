import { Texture } from 'pixi.js';
import { Tile } from '../types/tiles';
import { NB } from './hillAutotile';

/**
 * Procedural pixel-art water: three seamless 32×32 body variants plus shoreline
 * overlays (shallow band + broken foam) picked from an 8-neighbour land mask.
 * Static art is baked into terrain chunks; the shimmer lives in WaterLayer.
 */

export const WATER_SIZE = 32;
export const WATER_BASE_VARIANTS = 4;
export const WATER_PALETTE = {
  deep: 0x1b5269,
  body: 0x22637a,
  light: 0x2f7a8e,
  wave: 0x5aa8b4,
  glint: 0xcdeff0,
  shallow: 0x3f9590,
  shallowLight: 0x5fb3a6,
  foam: 0xe2f5ec,
  foamShade: 0x9fd2cc,
} as const;

/** Bridges stand in water, so they never get a shoreline. */
export function isWaterTile(tile: number): boolean {
  return tile === Tile.RIVER || tile === Tile.RAMP || tile === Tile.LOG;
}

const OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [0, -1, NB.N],
  [1, -1, NB.NE],
  [1, 0, NB.E],
  [1, 1, NB.SE],
  [0, 1, NB.S],
  [-1, 1, NB.SW],
  [-1, 0, NB.W],
  [-1, -1, NB.NW],
];

/** Bit set for each in-bounds neighbour that is land. The map edge counts as water. */
export function waterEdgeMask(tiles: ArrayLike<number>, width: number, height: number, x: number, y: number): number {
  let mask = 0;
  for (const [dx, dy, bit] of OFFSETS) {
    const nx = x + dx,
      ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (!isWaterTile(tiles[ny * width + nx] ?? Tile.RIVER)) mask |= bit;
  }
  return mask;
}

export type WaterEdge = 'n' | 'e' | 's' | 'w' | 'ne' | 'se' | 'sw' | 'nw';

/** Overlay keys for a mask: a strip per land side, a corner nub where only the diagonal is land. */
export function waterEdges(mask: number): WaterEdge[] {
  const edges: WaterEdge[] = [];
  if (mask & NB.N) edges.push('n');
  if (mask & NB.E) edges.push('e');
  if (mask & NB.S) edges.push('s');
  if (mask & NB.W) edges.push('w');
  if (mask & NB.NE && !(mask & (NB.N | NB.E))) edges.push('ne');
  if (mask & NB.SE && !(mask & (NB.S | NB.E))) edges.push('se');
  if (mask & NB.SW && !(mask & (NB.S | NB.W))) edges.push('sw');
  if (mask & NB.NW && !(mask & (NB.N | NB.W))) edges.push('nw');
  return edges;
}

export const waterBaseAlias = (variant: number): string => `water_base_${variant % WATER_BASE_VARIANTS}`;
export const waterEdgeAlias = (edge: WaterEdge): string => `water_edge_${edge}`;

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
const TAU = Math.PI * 2;

function canvas(draw: (px: (x: number, y: number, color: number, alpha?: number) => void) => void): Texture {
  const el = document.createElement('canvas');
  el.width = WATER_SIZE;
  el.height = WATER_SIZE;
  const ctx = el.getContext('2d');
  if (ctx)
    draw((x, y, color, alpha = 1) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = hex(color);
      ctx.fillRect(x, y, 1, 1);
    });
  const texture = Texture.from(el);
  texture.source.scaleMode = 'nearest';
  return texture;
}

/** Small deterministic integer hash for texture layout. */
function h2(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  return Math.imul(h, 0x27d4eb2d) >>> 0;
}

function drawBase(variant: number) {
  return canvas((px) => {
    const S = WATER_SIZE,
      { deep, body, light, wave } = WATER_PALETTE;
    // Flat body: any repeating texture reads as a grid at 32 px, so large-scale
    // variation comes from the per-tile tone tint and the detail is sparse.
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, body);
    // Wave crests: a light dash over a lighter shoulder, with a dark trough row below.
    const count = 3 + (h2(variant, 99) % 2);
    for (let i = 0; i < count; i++) {
      const r = h2(variant * 17 + 3, i);
      const len = 3 + (r % 4),
        wx = ((r >>> 4) % (S - len - 4)) + 2,
        wy = ((r >>> 10) % 5) + 2 + Math.floor((i * (S - 4)) / count);
      for (let k = -1; k <= len; k++) px(wx + k, wy - 1, light);
      for (let k = 0; k < len; k++) px(wx + k, wy, wave);
      for (let k = 1; k < len - 1; k++) px(wx + k, wy + 1, deep);
    }
  });
}

/** Depth (px) of the shallow band along a north edge, wobbling but seamless at x=0/32. */
function bandDepth(x: number): number {
  return 7 + Math.round(1.5 * Math.sin((TAU * x) / WATER_SIZE) + Math.sin((TAU * 3 * x) / WATER_SIZE + 1));
}

/** North edge strip drawn through `t`, which rotates it to other sides. */
function drawStrip(px: (x: number, y: number, c: number, a?: number) => void, t: (x: number, y: number) => [number, number]) {
  const { shallow, shallowLight, foam, foamShade } = WATER_PALETTE;
  for (let x = 0; x < WATER_SIZE; x++) {
    const depth = bandDepth(x);
    // Two-step shallows: lighter near the bank, a dithered fringe into deep water.
    for (let y = 0; y < depth; y++) {
      const inner = y < depth - 3;
      if (!inner && y === depth - 1 && (x + y) & 1) continue;
      px(...t(x, y), inner ? shallowLight : shallow, inner ? 0.9 : 0.8);
    }
    // Foam: two-pixel lip on the bank, broken third row, scattered flecks.
    px(...t(x, 0), foam);
    px(...t(x, 1), h2(x, 7) % 4 !== 0 ? foam : foamShade);
    if (h2(x, 11) % 3 === 0) px(...t(x, 2), foamShade);
    if (h2(x, 13) % 7 === 0) px(...t(x, 3), foam, 0.9);
  }
}

/** Corner nub (land only diagonally): a quarter disc of shallow water with a foam rim. */
function drawCorner(px: (x: number, y: number, c: number, a?: number) => void, t: (x: number, y: number) => [number, number]) {
  const { shallow, shallowLight, foam, foamShade } = WATER_PALETTE;
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 9; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d < 2.4) px(...t(x, y), foam);
      else if (d < 3.4) px(...t(x, y), (x + y) & 1 ? foam : foamShade);
      else if (d < 5.5) px(...t(x, y), shallowLight, 0.9);
      else if (d < 8 && !((x + y) & 1 && d > 7)) px(...t(x, y), shallow, 0.8);
    }
}

const M = WATER_SIZE - 1;
const SIDES: Record<'n' | 'e' | 's' | 'w', (x: number, y: number) => [number, number]> = {
  n: (x, y) => [x, y],
  s: (x, y) => [x, M - y],
  w: (x, y) => [y, x],
  e: (x, y) => [M - y, x],
};
const CORNERS: Record<'ne' | 'se' | 'sw' | 'nw', (x: number, y: number) => [number, number]> = {
  nw: (x, y) => [x, y],
  ne: (x, y) => [M - x, y],
  sw: (x, y) => [x, M - y],
  se: (x, y) => [M - x, M - y],
};

/** Every water texture by alias. Browser-only (uses canvas). */
export function createWaterTextures(): Map<string, Texture> {
  const out = new Map<string, Texture>();
  for (let v = 0; v < WATER_BASE_VARIANTS; v++) out.set(waterBaseAlias(v), drawBase(v));
  for (const [edge, t] of Object.entries(SIDES)) out.set(waterEdgeAlias(edge as WaterEdge), canvas((px) => drawStrip(px, t)));
  for (const [edge, t] of Object.entries(CORNERS)) out.set(waterEdgeAlias(edge as WaterEdge), canvas((px) => drawCorner(px, t)));
  return out;
}
