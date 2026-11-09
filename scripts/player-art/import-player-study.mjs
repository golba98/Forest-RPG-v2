import { stagingDirectory } from '../assets/output-directory.mjs';
// One-time preparation of reference-guided drawings into the native review grid.
// A single UNIFORM source-to-native scale is shared by every pose/direction.
// No bounding-box fitting, per-pose scaling, head stretching or runtime filters.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const inputRoot = 'docs/assets/source/player-rework';
const root = stagingDirectory(process.argv[2], 'artifacts/player-rework/source');
const palette = [
  '2f2522',
  '5b5146',
  '817566',
  'a79d89',
  'b9b3a1',
  'd2c9b7',
  'e7d5c6',
  'e9e2d4',
  'faf3e8',
  'fffaf2',
  'd19da7',
  'e5b6bc',
];
const rgb = palette.map((c) => [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16)));
const manifest = {
  status: 'art-review-only',
  sourceRoot: inputRoot,
  frameSize: 64,
  sourceFoot: { x: 32, y: 54 },
  sourceScale: 1 / 7,
  palette,
  sheets: [],
};
const selected = {
  south: {
    idle: [0, 1, 2, 3, 4, 5],
    walk: [0, 1, 2, 3, 4, 5, 6, 7],
    attack: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  },
  east: {
    idle: [0, 1, 2, 3, 4, 5],
    walk: [0, 1, 2, 3, 4, 5, 6, 7],
    attack: [0, 1, 2, 4, 5, 6, 7, 8, 0],
  },
  northeast: {
    idle: [0, 1, 2, 3, 4, 5],
    walk: [0, 1, 2, 3, 4, 5, 6, 7],
    attack: [0, 1, 2, 5, 6, 7, 8, 0, 0],
  },
};
for (const direction of Object.keys(selected)) {
  const sourceFile = `generated/${direction}.png`;
  const source = await fs.readFile(path.join(inputRoot, sourceFile));
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let p = 0; p < data.length; p += 4) {
    const [r, g, b, a] = data.subarray(p, p + 4);
    // Discard generated fringe, including saturated red/yellow fragments.
    if (a < 220 || (r > 140 && r > g * 1.8 && r > b * 1.8) || (r > 160 && g > 140 && b < 90))
      data.fill(0, p, p + 4);
    else data[p + 3] = 255;
  }
  // Exactly one resize for the entire drawing sheet. This retains all
  // source pose size relationships and cannot reshape a head independently.
  const { data: pixels, info: native } = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(Math.round(info.width / 7), Math.round(info.height / 7), { kernel: 'nearest' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let p = 0; p < pixels.length; p += 4) {
    if (!pixels[p + 3]) continue;
    let best = 0,
      distance = Infinity;
    for (let i = 0; i < rgb.length; i++) {
      const d = rgb[i].reduce((sum, value, c) => sum + (value - pixels[p + c]) ** 2, 0);
      if (d < distance) {
        best = i;
        distance = d;
      }
    }
    pixels.set(rgb[best], p);
    pixels[p + 3] = 255;
  }
  // Generated gutters are not a reliable grid: record explicit drawing
  // rectangles once, after the single global reduction. Ignore isolated fringe.
  const labels = new Int32Array(native.width * native.height);
  const components = [];
  let id = 0;
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] || !pixels[start * 4 + 3]) continue;
    const queue = [start];
    labels[start] = ++id;
    let left = native.width,
      top = native.height,
      right = 0,
      bottom = 0;
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i],
        x = p % native.width,
        y = Math.floor(p / native.width);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy,
            next = ny * native.width + nx;
          if (
            nx < 0 ||
            nx >= native.width ||
            ny < 0 ||
            ny >= native.height ||
            labels[next] ||
            !pixels[next * 4 + 3]
          )
            continue;
          labels[next] = id;
          queue.push(next);
        }
    }
    if (queue.length > 150)
      components.push({ id, x: left, y: top, width: right - left + 1, height: bottom - top + 1 });
  }
  if (components.length !== 27)
    throw Error(`${direction}: expected 27 connected drawings, found ${components.length}`);
  components.sort((a, b) => a.y + a.height / 2 - b.y - b.height / 2);
  const ordered = [];
  for (let row = 0; row < 3; row++)
    ordered.push(...components.slice(row * 9, row * 9 + 9).sort((a, b) => a.x - b.x));
  for (const [row, clip] of ['idle', 'walk', 'attack'].entries()) {
    const frames = [];
    for (const [frame, column] of selected[direction][clip].entries()) {
      const drawing = ordered[row * 9 + column];
      const { x, y, width, height } = drawing;
      let bottom = 0,
        top = height,
        headLeft = width,
        headRight = 0;
      for (let py = 0; py < height; py++)
        for (let px = 0; px < width; px++) {
          if (labels[(py + y) * native.width + px + x] !== drawing.id) continue;
          bottom = Math.max(bottom, py + 1);
          top = Math.min(top, py);
        }
      for (let py = top; py < Math.min(height, top + 12); py++)
        for (let px = 0; px < width; px++) {
          if (labels[(py + y) * native.width + px + x] !== drawing.id) continue;
          headLeft = Math.min(headLeft, px);
          headRight = Math.max(headRight, px);
        }
      const offset = { x: 32 - Math.round((headLeft + headRight + 1) / 2), y: 54 - bottom };
      const frameFile = `frames/${direction}/${clip}-${frame}.png`;
      await fs.mkdir(path.dirname(path.join(root, frameFile)), { recursive: true });
      const framePixels = Buffer.alloc(width * height * 4);
      for (let py = 0; py < height; py++)
        for (let px = 0; px < width; px++) {
          const p = (py + y) * native.width + px + x;
          if (labels[p] === drawing.id)
            pixels.copy(framePixels, (py * width + px) * 4, p * 4, p * 4 + 4);
        }
      const crop = await sharp(framePixels, { raw: { width, height, channels: 4 } })
        .png()
        .toBuffer();
      await sharp({ create: { width: 64, height: 64, channels: 4, background: '#00000000' } })
        .composite([{ input: crop, left: offset.x, top: offset.y }])
        .png()
        .toFile(path.join(root, frameFile));
      frames.push({
        file: frameFile,
        sourceCell: { row, column },
        nativeRect: { x, y, width, height },
        registration: offset,
      });
    }
    manifest.sheets.push({
      direction,
      clip,
      sourceFile,
      sourceSHA256: crypto.createHash('sha256').update(source).digest('hex'),
      frames,
    });
  }
}
await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(
  'Prepared 69 native review frames using one uniform sheet scale. Inspect before packing.',
);
