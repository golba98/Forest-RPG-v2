/**
 * scripts/build-hill-tileset.mjs
 *
 * Generates the project-owned hill/cliff autotile atlas:
 *   public/assets/images/terrain/hills/cliff_tileset.png
 *   public/assets/images/terrain/hills/cliff_tileset.json
 *
 * Pixel art is drawn procedurally (deterministic, no external art) using the
 * palette of the legacy hill rim (hill_north.png) and the grass tile. One 32px
 * frame exists per reduced 8-neighbour "blob" mask (47), plus plateau-interior
 * variants (with painted tufts, pebbles and flowers) and ground shadows. Frames sit on a 36px pitch with a 2px
 * extruded gutter so nearest sampling never bleeds into a neighbour frame.
 *
 * The mask reduction and frame order must match src/rendering/hillAutotile.ts
 * (tests/unit/rendering/hillAutotile.test.ts checks the generated JSON).
 *
 * Usage: node scripts/build-hill-tileset.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public/assets/images/terrain/hills');

const T = 32;
const GUTTER = 2;
const PITCH = T + GUTTER * 2;
const COLUMNS = 10;
const INTERIOR_VARIANTS = 6;

const N = 1, NE = 2, E = 4, SE = 8, S = 16, SW = 32, W = 64, NW = 128;

/** Diagonals only matter when both adjacent cardinals are elevated. */
function reduceMask(m) {
  let r = m & (N | E | S | W);
  if (m & NE && m & N && m & E) r |= NE;
  if (m & SE && m & S && m & E) r |= SE;
  if (m & SW && m & S && m & W) r |= SW;
  if (m & NW && m & N && m & W) r |= NW;
  return r;
}

const MASKS = [...new Set(Array.from({ length: 256 }, (_, m) => reduceMask(m)))].sort((a, b) => a - b);

// Palette: rock from hill_north.png, plateau grass lifted from grass.png.
const C = {
  outline: [0x4a, 0x2a, 0x14],
  shade: [0x68, 0x38, 0x20],
  mid: [0x98, 0x58, 0x18],
  warm: [0xc0, 0x78, 0x20],
  hi: [0xd8, 0xb8, 0x40],
  base: [0x3a, 0x22, 0x12],
  topDark: [0x6c, 0x88, 0x34],
  top: [0x86, 0xa2, 0x40],
  topLight: [0xa2, 0xbe, 0x4e],
  topSpeck: [0xbc, 0xd4, 0x5e],
  moss: [0x6b, 0x84, 0x39],
};

const RIM = 6; // east/west rim thickness
const RIM_N = 4; // north rim thickness (seen edge-on)
const FACE_TOP = 12; // first row of the south cliff face
const ROUND = 6; // outer corner radius

function hash(x, y, seed) {
  let h = Math.imul(x + 0x9e37, 0x27d4eb2d) ^ Math.imul(y + 0x85eb, 0x165667b1) ^ Math.imul(seed + 1, 0x2545f491);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

/** Region of pixel (x, y) in a tile with reduced mask m. */
function region(x, y, m) {
  const n = m & N, e = m & E, s = m & S, w = m & W;
  // Outer-corner rounding (transparent; grass shows through).
  const outside = (cx, cy) => (x - cx) ** 2 + (y - cy) ** 2 > ROUND * ROUND;
  if (!n && !w && x < ROUND && y < ROUND && outside(ROUND, ROUND)) return 'none';
  if (!n && !e && x > T - 1 - ROUND && y < ROUND && outside(T - 1 - ROUND, ROUND)) return 'none';
  if (!s && !w && x < ROUND && y > T - 1 - ROUND && outside(ROUND, T - 1 - ROUND)) return 'none';
  if (!s && !e && x > T - 1 - ROUND && y > T - 1 - ROUND && outside(T - 1 - ROUND, T - 1 - ROUND)) return 'none';

  if (!s && y >= FACE_TOP) return 'face';
  if (!n && y < RIM_N) return 'rimN';
  if (!w && x < RIM) return 'rimW';
  if (!e && x >= T - RIM) return 'rimE';
  // Inner (concave) corners: connect the neighbouring rims/faces.
  if (n && w && !(m & NW) && x < RIM && y < RIM_N) return 'rimN';
  if (n && e && !(m & NE) && x >= T - RIM && y < RIM_N) return 'rimN';
  if (s && w && !(m & SW) && x < RIM && y >= FACE_TOP) return 'faceInnerW';
  if (s && e && !(m & SE) && x >= T - RIM && y >= FACE_TOP) return 'faceInnerE';
  return 'top';
}

function facePixel(x, y, m, kind) {
  const e = m & E, w = m & W;
  if (y === FACE_TOP) return C.hi;
  if (y === FACE_TOP + 1) return C.warm;
  if (y >= T - 2) return y === T - 1 ? C.base : C.outline;
  // Short faces at inner corners end against the adjacent rim.
  if (kind === 'faceInnerW' && x === RIM - 1) return C.shade;
  if (kind === 'faceInnerE' && x === T - RIM) return C.shade;
  // Face ends turn away from the light (west lit, east shaded).
  if (!w && x < 2) return x === 0 ? C.outline : C.mid;
  if (!e && x > T - 3) return x === T - 1 ? C.outline : C.shade;
  // Vertical cracks on a tile-periodic grid (seamless), broken by strata.
  const crack = [3, 10, 16, 23, 28].includes(x) && hash(x, Math.floor(y / 5), 7) > 0.35;
  if (crack) return hash(x, y, 9) > 0.5 ? C.shade : C.outline;
  if ((y - FACE_TOP) % 6 === 4 && hash(Math.floor(x / 3), y, 11) > 0.3) return C.shade;
  const depth = (y - FACE_TOP) / (T - FACE_TOP);
  const r = hash(x, y, 13);
  if (depth < 0.35) return r > 0.55 ? C.warm : r > 0.12 ? C.mid : C.hi;
  if (depth < 0.75) return r > 0.7 ? C.warm : r > 0.15 ? C.mid : C.shade;
  return r > 0.65 ? C.mid : C.shade;
}

function rimPixel(x, y, kind) {
  if (kind === 'rimN') {
    if (y === 0) return C.outline;
    if (x % 8 === 0 && y < RIM_N - 1) return C.shade;
    return y === 1 ? C.hi : y === 2 ? C.warm : C.mid;
  }
  if (kind === 'rimW') {
    if (x === 0) return C.outline;
    if (y % 8 === 0) return C.shade;
    return [C.outline, C.hi, C.hi, C.warm, C.mid, C.moss][x] ?? C.mid;
  }
  // rimE (shaded side)
  if (x === T - 1) return C.outline;
  if (y % 8 === 4) return C.outline;
  return [C.moss, C.warm, C.mid, C.mid, C.shade, C.outline][x - (T - RIM)] ?? C.mid;
}

// Plateau top = the ground grass texture remapped to a sunlit palette, so the
// raised surface keeps the same leaf pattern but reads as a different level.
const grass = await sharp(path.join(ROOT, 'public/assets/images/terrain/grass.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const GRASS_REMAP = new Map([
  ['4a6331', C.topDark],
  ['6b8439', C.top],
  ['84ad21', C.topLight],
]);

function topPixel(x, y, seed, m) {
  // Variants mirror the source so repeated interiors do not tile visibly.
  const sx = seed % 2 === 0 ? T - 1 - x : x;
  const sy = seed % 3 === 0 ? T - 1 - y : y;
  const i = (sy * grass.info.width + sx) * 4;
  const key = [0, 1, 2].map((k) => grass.data[i + k].toString(16).padStart(2, '0')).join('');
  let c = GRASS_REMAP.get(key) ?? C.top;
  if (hash(x, y, seed) > 0.985) c = C.topSpeck;
  // Bevel: light just inside the north/west rims, shade inside the east rim.
  if (!(m & N) && y === RIM_N) c = C.topSpeck;
  if (!(m & W) && x === RIM) c = C.topLight;
  if (!(m & E) && x === T - RIM - 1) c = C.topDark;
  if (!(m & S) && y === FACE_TOP - 1) c = C.topLight;
  return c;
}

function drawTile(m, seed) {
  const px = new Uint8ClampedArray(T * T * 4);
  const regions = [];
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) regions.push(region(x, y, m));
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const kind = regions[y * T + x];
      if (kind === 'none') continue;
      let c;
      if (kind === 'top') c = topPixel(x, y, seed, m);
      else if (kind.startsWith('face')) c = facePixel(x, y, m, kind);
      else c = rimPixel(x, y, kind);
      // Silhouette outline against rounded-off pixels.
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      if (nb.some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < T && ny < T && regions[ny * T + nx] === 'none';
      })) c = C.outline;
      const i = (y * T + x) * 4;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
  }
  return px;
}

/**
 * Sparse painted detail for plateau interiors (variant > 0): grass tufts,
 * pebbles and tiny flowers, so large hill tops are not a flat field.
 */
function paintDetail(px, seed) {
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= T || y >= T) return;
    const i = (y * T + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  };
  const r = (k) => hash(seed, k, 17);
  const tufts = 2 + Math.floor(r(1) * 3);
  for (let t = 0; t < tufts; t++) {
    const x = 3 + Math.floor(r(10 + t) * 26), y = 6 + Math.floor(r(20 + t) * 22);
    // Three-blade tuft: dark base, lit tips.
    set(x, y, C.topDark); set(x - 1, y, C.topDark); set(x + 1, y, C.topDark);
    set(x - 1, y - 1, C.topLight); set(x + 1, y - 1, C.topLight); set(x, y - 2, C.topSpeck); set(x, y - 1, C.top);
  }
  if (r(2) > 0.45) {
    const x = 4 + Math.floor(r(30) * 24), y = 8 + Math.floor(r(31) * 20);
    set(x, y, [0x8a, 0x86, 0x78]); set(x + 1, y, [0x6e, 0x6a, 0x5e]); set(x, y - 1, [0xb4, 0xb0, 0xa0]); set(x + 1, y - 1, [0x8a, 0x86, 0x78]);
    set(x, y + 1, C.topDark); set(x + 1, y + 1, C.topDark);
  }
  if (r(3) > 0.55) {
    const x = 4 + Math.floor(r(40) * 24), y = 8 + Math.floor(r(41) * 20);
    const petal = r(42) > 0.5 ? [0xf0, 0xd8, 0x5a] : [0xe8, 0x9c, 0xc4];
    set(x, y, petal); set(x - 1, y, petal); set(x + 1, y, petal); set(x, y - 1, petal); set(x, y + 1, C.topDark);
  }
}

function drawShadowEast() {
  const px = new Uint8ClampedArray(T * T * 4);
  const alpha = [0.34, 0.24, 0.15, 0.08, 0.03];
  for (let y = 0; y < T; y++) for (let x = 0; x < alpha.length; x++) {
    const i = (y * T + x) * 4;
    px[i] = 12; px[i + 1] = 22; px[i + 2] = 10; px[i + 3] = Math.round(alpha[x] * 255);
  }
  return px;
}

function drawShadow() {
  const px = new Uint8ClampedArray(T * T * 4);
  const alpha = [0.42, 0.32, 0.22, 0.14, 0.08, 0.04];
  for (let y = 0; y < alpha.length; y++) for (let x = 0; x < T; x++) {
    const i = (y * T + x) * 4;
    px[i] = 12; px[i + 1] = 22; px[i + 2] = 10; px[i + 3] = Math.round(alpha[y] * 255);
  }
  return px;
}

const frames = [];
for (const m of MASKS) frames.push({ key: `mask_${m}`, px: drawTile(m, 1) });
for (let v = 1; v < INTERIOR_VARIANTS; v++) {
  const px = drawTile(255, 1 + v * 31);
  paintDetail(px, v * 7919);
  frames.push({ key: `plateau_${v}`, px });
}
frames.push({ key: 'shadow_s', px: drawShadow() });
frames.push({ key: 'shadow_e', px: drawShadowEast() });

const rows = Math.ceil(frames.length / COLUMNS);
const W_PX = COLUMNS * PITCH;
const H_PX = rows * PITCH;
const atlas = new Uint8ClampedArray(W_PX * H_PX * 4);
const json = { tileSize: T, pitch: PITCH, gutter: GUTTER, columns: COLUMNS, masks: MASKS, frames: {} };

frames.forEach((frame, index) => {
  const col = index % COLUMNS, row = Math.floor(index / COLUMNS);
  const ox = col * PITCH + GUTTER, oy = row * PITCH + GUTTER;
  // Copy with edge extrusion into the gutter.
  for (let y = -GUTTER; y < T + GUTTER; y++) for (let x = -GUTTER; x < T + GUTTER; x++) {
    const sx = Math.min(T - 1, Math.max(0, x)), sy = Math.min(T - 1, Math.max(0, y));
    const si = (sy * T + sx) * 4, di = ((oy + y) * W_PX + ox + x) * 4;
    for (let k = 0; k < 4; k++) atlas[di + k] = frame.px[si + k];
  }
  json.frames[frame.key] = { x: ox, y: oy, w: T, h: T };
});

fs.mkdirSync(OUT_DIR, { recursive: true });
await sharp(Buffer.from(atlas.buffer), { raw: { width: W_PX, height: H_PX, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(path.join(OUT_DIR, 'cliff_tileset.png'));
fs.writeFileSync(path.join(OUT_DIR, 'cliff_tileset.json'), `${JSON.stringify(json, null, 2)}\n`);
console.log(`[build-hill-tileset] ${frames.length} frames (${MASKS.length} masks) → ${W_PX}x${H_PX}`);
