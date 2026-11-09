import { stagingDirectory } from '../assets/output-directory.mjs';
// Stable model animation: fixed native heads, shaded pixel limbs and small
// integer translations. No per-frame resampling, tween blur or image filters.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { directions, counts, poseFor } from './poses.mjs';
const source = 'docs/assets/source/player-final';
const output = stagingDirectory(process.argv[2], 'artifacts/player-final/archived-sheets');
const generatedSource = stagingDirectory(undefined, 'artifacts/player-final/source');
const model = JSON.parse(await fs.readFile(`${source}/model.json`, 'utf8'));
const rgb = model.palette.map((c) => [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16)));
const audit = {
  sourceRoot: source,
  cell: 64,
  foot: [32, 54],
  palette: model.palette,
  heads: model.heads,
  frames: [],
};
const gallery = [];
function set(pixels, x, y, color) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 2 || x > 61 || y < 2 || y > 61) throw Error(`Pixel outside safe cell: ${x},${y}`);
  const offset = (y * 64 + x) * 4;
  pixels.set(rgb[color], offset);
  pixels[offset + 3] = 255;
}
// Small pixel clusters with consistent screen-upper-left illumination.
// Capsules keep the same cross-section while the joints move.
function capsule(pixels, a, b, radius, far = false) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = dx * dx + dy * dy;
  for (
    let y = Math.floor(Math.min(a[1], b[1]) - radius);
    y <= Math.ceil(Math.max(a[1], b[1]) + radius);
    y++
  ) {
    for (
      let x = Math.floor(Math.min(a[0], b[0]) - radius);
      x <= Math.ceil(Math.max(a[0], b[0]) + radius);
      x++
    ) {
      const t = length ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / length)) : 0;
      const nx = x - a[0] - t * dx,
        ny = y - a[1] - t * dy;
      const distance = Math.hypot(nx, ny);
      if (distance > radius) continue;
      const shade = nx * 0.7 + ny * 0.5;
      const color =
        distance > radius - 0.75
          ? shade < -0.4
            ? 7
            : 2
          : shade < -0.4
            ? far
              ? 7
              : 9
            : shade > 0.65
              ? far
                ? 3
                : 4
              : far
                ? 5
                : 8;
      set(pixels, x, y, color);
    }
  }
}
function torso(pixels, cx, cy, profile, body) {
  // Preserve the approved model's deliberate torso clusters. The mask excludes
  // separately articulated limbs; head/shoulder overlap conceals the seam.
  const radii = profile ? [3, 4, 4, 4, 4, 4, 4, 3, 3] : [4, 5, 5, 5, 4, 5, 5, 4, 3];
  for (let y = 0; y < 9; y++)
    for (let x = 12 - radii[y]; x <= 12 + radii[y]; x++) {
      const from = (y * 24 + x) * 4;
      if (!body.data[from + 3]) continue;
      const to = ((cy - 3 + y) * 64 + cx + x - 12) * 4;
      body.data.copy(pixels, to, from, from + 4);
    }
}
function paste(pixels, head, x, y) {
  for (let py = 0; py < head.info.height; py++)
    for (let px = 0; px < head.info.width; px++) {
      const from = (py * head.info.width + px) * 4;
      if (!head.data[from + 3]) continue;
      const to = ((py + y) * 64 + px + x) * 4;
      head.data.copy(pixels, to, from, from + 4);
    }
}
let row = 0;
for (const [direction, [dx, dy]] of Object.entries(directions)) {
  const head = await sharp(`${source}/heads/${direction}.png`)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const body = await sharp(`${source}/bodies/${direction}.png`)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const headHash = crypto.createHash('sha256').update(head.data).digest('hex');
  for (const [clip, count] of Object.entries(counts)) {
    const layers = [];
    for (let f = 0; f < count; f++) {
      const p = poseFor(clip, f),
        pixels = Buffer.alloc(64 * 64 * 4);
      const cx = 32 + Math.round(dx * p.lean),
        cy = 46 + p.bob;
      const profile = Math.abs(dx) > 0.9,
        back = dy < -0.1;
      // Lateral offsets narrow in profile; depth separation increases instead.
      const separation = profile ? 1.5 : 3;
      const limbs = [-1, 1].map((side) => {
        const depth = profile ? side : 0;
        const swing = p.stride * side;
        const foot = [
          32 + side * separation + dx * swing,
          51.5 + dy * swing * 0.3 - (side < 0 ? p.liftLeft : p.liftRight) - p.tuck,
        ];
        const hip = [cx + side * separation, cy + 3];
        const shoulder = [cx + side * (profile ? 2 : 5), cy - 2 + depth];
        const attacking = p.hand === 0 || p.hand === side;
        const reach = attacking ? p.reach : 0;
        const hand = [
          shoulder[0] + side + dx * (p.armSwing * side + reach),
          shoulder[1] + 3 + dy * (p.armSwing * side * 0.5 + reach * 0.7) - p.guard,
        ];
        const elbow = [(shoulder[0] + hand[0]) / 2 - dx, (shoulder[1] + hand[1]) / 2 + 1];
        const far = profile ? side * dx < 0 : dy < 0 ? side > 0 : side < 0;
        return { side, hip, foot, shoulder, elbow, hand, far };
      });
      for (const l of [...limbs].sort((a, b) => Number(b.far) - Number(a.far))) {
        capsule(pixels, l.hip, l.foot, 2, l.far);
        capsule(pixels, [l.foot[0] - 0.5, l.foot[1]], [l.foot[0] + 0.5, l.foot[1]], 1.5, l.far);
      }
      const arm = (l) => {
        capsule(pixels, l.shoulder, l.elbow, 1.8, l.far);
        capsule(pixels, l.elbow, l.hand, 1.8, l.far);
        capsule(pixels, l.hand, l.hand, 2, l.far);
      };
      for (const l of limbs) if (l.far) arm(l);
      torso(pixels, cx, cy, profile, body);
      for (const l of limbs) if (!l.far) arm(l);
      const headOrigin = [cx - Math.ceil(head.info.width / 2), 43 - head.info.height + p.bob];
      paste(pixels, head, ...headOrigin);
      // In back-facing strikes the fist passes beyond the silhouette; keep the
      // leading hand visible without drawing a front-facing face or turning.
      if (back && p.reach > 0)
        for (const l of limbs)
          if (p.hand === 0 || p.hand === l.side) {
            capsule(pixels, l.elbow, l.hand, 1.8, l.far);
            capsule(pixels, l.hand, l.hand, 2, l.far);
          }
      const input = await sharp(pixels, { raw: { width: 64, height: 64, channels: 4 } })
        .png()
        .toBuffer();
      const frameFile = `frames/${direction}/${clip}-${f}.png`;
      await fs.mkdir(path.dirname(`${generatedSource}/${frameFile}`), { recursive: true });
      await fs.writeFile(`${generatedSource}/${frameFile}`, input);
      layers.push({ input, left: f * 64, top: 0 });
      gallery.push({ input, left: f * 64, top: row * 64 });
      audit.frames.push({
        direction,
        clip,
        frame: f,
        file: frameFile,
        headOrigin,
        headHash,
        pose: p,
      });
    }
    await fs.mkdir(`${output}/${clip}`, { recursive: true });
    await sharp({ create: { width: count * 64, height: 64, channels: 4, background: '#00000000' } })
      .composite(layers)
      .png()
      .toFile(`${output}/${clip}/${clip}_${direction}.png`);
    row++;
  }
}
await fs.writeFile(`${generatedSource}/manifest.json`, JSON.stringify(audit, null, 2) + '\n');
await fs.mkdir('artifacts/player-final', { recursive: true });
await sharp({ create: { width: 576, height: row * 64, channels: 4, background: '#445846' } })
  .composite(gallery)
  .png()
  .toFile('artifacts/player-final/native-gallery.png');
console.log(`Built ${audit.frames.length} frames in ${row} strips with fixed native head models.`);
