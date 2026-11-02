// Pixel preparation of imagegen-authored artwork, not an upscale of legacy art.
// node scripts/prepare-player-remaster.mjs [output-directory]
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const source = 'docs/assets/source/player-remaster';
const destination = process.argv[2] ?? 'public/assets/images/characters/player';
const directions = ['south', 'southeast', 'east', 'northeast', 'north', 'northwest', 'west', 'southwest'];
const palette = ['2f2522', '594a40', '8b7c69', 'b9b3a1', 'c9c2ae', 'dbd3c0', 'e7d5c6', 'e8e1d2', 'f4ecd9', 'faf3e8', 'fffaf2', 'd19da7', 'e5b6bc'].map(hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)));
const clips = [
  { name: 'idle', row: 0, frames: [0, 1, 3, 4, 6, 8] },
  { name: 'walk', row: 1, frames: [0, 1, 2, 3, 4, 5, 6, 7] },
  { name: 'run', row: 2, frames: [0, 1, 2, 3, 4, 5, 6, 7] },
  { name: 'jump', row: 3, frames: [0, 1, 2, 3, 4, 5, 6, 8] },
  // The generated impact drawing is column 5; schedule it at 120 ms.
  { name: 'attack', row: 4, frames: [0, 1, 2, 4, 5, 6, 7, 8, 0] },
  { name: 'attack2', row: 5, frames: [0, 1, 2, 4, 5, 6, 7, 8, 0] },
  { name: 'attack3', row: 6, frames: [0, 1, 2, 4, 5, 6, 7, 8, 0] },
];

// Extract connected figures rather than trusting a generated sheet's gutters.
// Small isolated edge noise/contact-shadow remnants are not part of the sprite.
function figures(data, width, height) {
  const ids = new Int32Array(width * height);
  for (let p = 0; p < ids.length; p++) {
    const [r, g, b, a] = data.subarray(p * 4, p * 4 + 4);
    if (a < 200 || (r > 150 && g < 100 && b < 100) || (r > 150 && g > 150 && b < 80)) ids[p] = -1;
  }
  const result = [];
  let id = 0;
  for (let start = 0; start < ids.length; start++) {
    if (ids[start] !== 0) continue;
    const queue = [start];
    ids[start] = ++id;
    let left = width, top = height, right = 0, bottom = 0;
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i], x = p % width, y = Math.floor(p / width);
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (ids[next] !== 0) continue;
        ids[next] = id; queue.push(next);
      }
    }
    if (queue.length > 1000) result.push({ id, left, top, width: right - left + 1, height: bottom - top + 1 });
  }
  if (result.length !== 63) throw new Error(`Expected 63 separate drawings, found ${result.length}`);
  result.sort((a, b) => a.top + a.height / 2 - b.top - b.height / 2);
  const ordered = [];
  for (let row = 0; row < 7; row++) ordered.push(...result.slice(row * 9, row * 9 + 9).sort((a, b) => a.left - b.left));
  return { ordered, ids };
}

const audit = { frameSize: 64, sourceFoot: { x: 32, y: 54 }, palette, clips, sources: {}, frames: [] };
const gallery = [];
for (const [directionIndex, direction] of directions.entries()) {
  const file = path.join(source, `${direction}.png`);
  const bytes = await fs.readFile(file);
  audit.sources[direction] = crypto.createHash('sha256').update(bytes).digest('hex');
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { ordered, ids } = figures(data, info.width, info.height);
  const idle = ordered.slice(0, 9);
  const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const sy = 32 / median(idle.map(f => f.height));
  const targetWidth = ['east', 'west', 'northeast', 'northwest'].includes(direction) ? 20 : 24;
  const sx = targetWidth / median(idle.map(f => f.width));
  for (const clip of clips) {
    const strip = [];
    for (const [column, sourceColumn] of clip.frames.entries()) {
      const f = ordered[clip.row * 9 + sourceColumn];
      const rgba = Buffer.alloc(f.width * f.height * 4);
      let headLeft = f.width, headRight = 0;
      for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) {
        const p = (f.top + y) * info.width + f.left + x;
        if (ids[p] !== f.id) continue;
        data.copy(rgba, (y * f.width + x) * 4, p * 4, p * 4 + 3);
        rgba[(y * f.width + x) * 4 + 3] = 255;
        if (y < f.height * .55) { headLeft = Math.min(headLeft, x); headRight = Math.max(headRight, x); }
      }
      // Registration removes incidental generation-size drift. The one-pixel
      // breathing/gait envelope is intentional; pose pixels remain authored.
      const width = clip.name === 'idle' ? targetWidth : Math.round(f.width * sx);
      const height = clip.name === 'idle' ? [32, 32, 33, 33, 32, 32][column]
        : clip.name === 'walk' ? [32, 31, 32, 33, 32, 31, 32, 33][column]
        : clip.name === 'run' ? [32, 31, 30, 31, 32, 31, 30, 31][column]
        : Math.round(f.height * sy);
      const native = await sharp(rgba, { raw: { width: f.width, height: f.height, channels: 4 } }).resize(width, height, { kernel: 'nearest', fit: 'fill' }).raw().toBuffer();
      for (let p = 0; p < native.length; p += 4) {
        if (native[p + 3] === 0) continue;
        let best = palette[0], distance = Infinity;
        for (const color of palette) {
          const d = color.reduce((sum, value, channel) => sum + (value - native[p + channel]) ** 2, 0);
          if (d < distance) { distance = d; best = color; }
        }
        native.set(best, p); native[p + 3] = 255;
      }
      const left = 32 - Math.round(((headLeft + headRight + 1) / 2) * width / f.width);
      const top = 54 - height;
      if (left < 2 || top < 2 || left + width > 62 || top + height > 62) throw new Error(`Clipping: ${direction}/${clip.name}/${column}`);
      const input = await sharp(native, { raw: { width, height, channels: 4 } }).png().toBuffer();
      const frame = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#00000000' } }).composite([{ input, left, top }]).png().toBuffer();
      strip.push({ input: frame, left: column * 64, top: 0 });
      audit.frames.push({ direction, clip: clip.name, column, source: f, bounds: { left, top, width, height } });
      if (column === 0 || (clip.name.startsWith('attack') && column === 3)) gallery.push({ input: frame, left: (clip.row + (clip.name.startsWith('attack') ? clip.row - 4 : 0) + (column === 3 ? 1 : 0)) * 64, top: directionIndex * 64 });
    }
    await fs.mkdir(path.join(destination, clip.name), { recursive: true });
    await sharp({ create: { width: clip.frames.length * 64, height: 64, channels: 4, background: '#00000000' } }).composite(strip).png().toFile(path.join(destination, clip.name, `${clip.name}_${direction}.png`));
  }
}
await fs.mkdir('artifacts/player-remaster', { recursive: true });
await fs.writeFile('artifacts/player-remaster/asset-audit.json', JSON.stringify(audit, null, 2));
await sharp({ create: { width: 640, height: 512, channels: 4, background: '#516351' } }).composite(gallery).png().toFile('artifacts/player-remaster/native-gallery.png');
await sharp('artifacts/player-remaster/native-gallery.png').resize(1920, 1536, { kernel: 'nearest' }).toFile('artifacts/player-remaster/gallery-3x.png');
console.log(`Prepared ${audit.frames.length} frames in 56 directional strips at ${destination}`);
