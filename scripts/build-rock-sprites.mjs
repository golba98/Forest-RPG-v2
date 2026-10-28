/**
 * scripts/build-rock-sprites.mjs
 *
 * Generates the project-owned rock decor sprites:
 *   public/assets/images/objects/decor/rock_boulder.png  (32×32)
 *   public/assets/images/objects/decor/rock_pebble.png   (16×17)
 *
 * Pixel art is drawn procedurally (deterministic, no external art): each stone
 * is a faceted dome lit from the north-west (matching the hill shadows), with a
 * selective outline, moss on the top faces, a crack, and a soft contact shadow
 * on a transparent background. Sizes match DECOR_SIZE in visualManifest.ts.
 *
 * Usage: node scripts/build-rock-sprites.mjs
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public/assets/images/objects/decor');

const C = {
  outline: [30, 31, 38],
  outlineLit: [58, 60, 66],
  shadow: [66, 71, 82],
  mid: [99, 106, 115],
  light: [139, 146, 150],
  highlight: [186, 191, 188],
  crack: [52, 56, 66],
  mossDark: [55, 88, 39],
  moss: [86, 125, 49],
  mossLight: [132, 166, 68],
  ground: [18, 28, 14],
};
const LIGHT = (() => {
  const v = [-0.55, -0.75, 0.62];
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
})();

function hash(x, y, seed) {
  let h = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + seed * 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  return (Math.imul(h, 0x27d4eb2d) >>> 0) / 4294967296;
}

function canvas(w, h) {
  const px = new Uint8ClampedArray(w * h * 4);
  return {
    w,
    h,
    px,
    get: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : px[(y * w + x) * 4 + 3]),
    set(x, y, [r, g, b], a = 255) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 4;
      px.set([r, g, b, a], i);
    },
  };
}

/** Faceted stone: flat planes from quantised normals read as chiselled rock. */
function stone(cv, mask, { cx, cy, rx, ry, seed, moss = 0, crack = false }) {
  const twist = hash(seed, 1, 7) * Math.PI;
  const cells = [];
  for (let y = 0; y < cv.h; y++)
    for (let x = 0; x < cv.w; x++) {
      const u = (x + 0.5 - cx) / rx,
        v = (y + 0.5 - cy) / ry;
      // Rounded crown, squarer flattened base, chipped rim.
      const edge = Math.abs(u) ** 2.2 + (v < 0 ? Math.abs(v) ** 1.8 : Math.abs(v * 1.15) ** 2.4);
      if (edge > 1 - (hash(x, y, seed) < 0.12 ? 0.18 : 0)) continue;
      const r = Math.min(1, Math.hypot(u, v));
      const sector = Math.round((Math.atan2(v, u) - twist) / (Math.PI / 3));
      const a = sector * (Math.PI / 3) + twist;
      const rq = r < 0.38 ? 0 : r < 0.75 ? 0.55 : 0.88;
      const nx = Math.cos(a) * rq,
        ny = Math.sin(a) * rq,
        nz = Math.sqrt(Math.max(0, 1 - rq * rq));
      let lum = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
      if (v > 0.55) lum -= 0.25; // ambient occlusion near the ground
      const tone = lum > 0.82 ? C.highlight : lum > 0.55 ? C.light : lum > 0.22 ? C.mid : C.shadow;
      cells.push({ x, y, u, v, tone });
    }
  for (const { x, y, u, v, tone } of cells) {
    let color = tone;
    // Moss settles on the upper faces in soft clumps.
    const clump = hash(Math.floor(x / 3), Math.floor(y / 2), seed + 3);
    if (moss > 0 && v < -0.3 && clump < moss + (-v - 0.3) * 0.7) {
      const top = cv.get(x, y - 1) === 0 && !mask.has(`${x},${y - 1}`);
      color = top ? C.mossLight : v < -0.55 || hash(x, y, seed + 5) < 0.6 ? C.moss : C.mossDark;
    }
    cv.set(x, y, color);
    mask.set(`${x},${y}`, { u, v });
  }
  if (crack) {
    let x = Math.round(cx + rx * 0.15),
      y = Math.round(cy - ry * 0.45);
    for (let i = 0; i < Math.round(ry * 0.9); i++) {
      if (mask.has(`${x},${y}`)) cv.set(x, y, C.crack);
      y += 1;
      if (hash(i, 0, seed + 9) < 0.45) x += hash(i, 1, seed) < 0.5 ? -1 : 1;
    }
  }
}

/** One-pixel outline round the silhouette: lit grey on the north-west, near-black elsewhere. */
function outline(cv, mask) {
  const add = [];
  for (let y = 0; y < cv.h; y++)
    for (let x = 0; x < cv.w; x++) {
      if (mask.has(`${x},${y}`)) continue;
      const n = mask.has(`${x + 1},${y}`) || mask.has(`${x},${y + 1}`),
        s = mask.has(`${x - 1},${y}`) || mask.has(`${x},${y - 1}`);
      if (n || s) add.push([x, y, n && !s ? C.outlineLit : C.outline]);
    }
  for (const [x, y, c] of add) cv.set(x, y, c);
}

function contactShadow(cv, cx, cy, rx, ry) {
  for (let y = 0; y < cv.h; y++)
    for (let x = 0; x < cv.w; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d <= 1 && cv.get(x, y) === 0) cv.set(x, y, C.ground, d < 0.5 ? 110 : 70);
    }
}

function render(w, h, stones, shadow) {
  const cv = canvas(w, h),
    mask = new Map();
  // Back to front so nearer stones overlap further ones.
  for (const s of [...stones].sort((a, b) => a.cy + a.ry - (b.cy + b.ry))) stone(cv, mask, s);
  outline(cv, mask);
  contactShadow(cv, ...shadow);
  return cv;
}

async function save(cv, name) {
  const file = path.join(OUT_DIR, name);
  await sharp(Buffer.from(cv.px.buffer), { raw: { width: cv.w, height: cv.h, channels: 4 } }).png().toFile(file);
  console.log(`wrote ${path.relative(ROOT, file)}`);
}

await save(
  render(
    32,
    32,
    [
      { cx: 14.5, cy: 18, rx: 11.5, ry: 10.5, seed: 11, moss: 0.2, crack: true },
      { cx: 25, cy: 25.5, rx: 5, ry: 4, seed: 23, moss: 0.1 },
    ],
    [16, 29.5, 14, 2.6],
  ),
  'rock_boulder.png',
);
await save(
  render(
    16,
    17,
    [
      { cx: 6.5, cy: 10, rx: 5, ry: 4.2, seed: 5, moss: 0.15 },
      { cx: 12, cy: 13, rx: 3, ry: 2.4, seed: 9 },
    ],
    [8.5, 14.6, 7, 1.8],
  ),
  'rock_pebble.png',
);
