import { stagingDirectory } from '../assets/output-directory.mjs';
// One uniform reduction of the reference-guided model sheet; no per-pose fit.
import fs from 'node:fs/promises';
import sharp from 'sharp';
const inputRoot = 'docs/assets/source/player-final';
const root = stagingDirectory(process.argv[2], 'artifacts/player-final/model');
export const palette = [
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
const colors = palette.map((s) => [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)));
const { data, info } = await sharp(`${inputRoot}/generated/turnaround.png`)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
for (let i = 0; i < data.length; i += 4) {
  if (data[i + 3] < 245) data.fill(0, i, i + 4);
  else data[i + 3] = 255;
}
const scale = 1 / 14.5;
const { data: p, info: m } = await sharp(data, {
  raw: { width: info.width, height: info.height, channels: 4 },
})
  .resize(Math.round(info.width * scale), Math.round(info.height * scale), { kernel: 'nearest' })
  .raw()
  .toBuffer({ resolveWithObject: true });
for (let i = 0; i < p.length; i += 4) {
  if (!p[i + 3]) continue;
  let best = 0,
    dist = Infinity;
  for (let c = 0; c < colors.length; c++) {
    const d = colors[c].reduce((s, v, k) => s + (v - p[i + k]) ** 2, 0);
    if (d < dist) {
      dist = d;
      best = c;
    }
  }
  p.set(colors[best], i);
}
await fs.mkdir(`${root}/heads`, { recursive: true });
await fs.mkdir(`${root}/bodies`, { recursive: true });
const directions = [
  'south',
  'southeast',
  'east',
  'northeast',
  'north',
  'northwest',
  'west',
  'southwest',
];
const audit = [];
for (let n = 0; n < 8; n++) {
  const direction = directions[n];
  let head;
  if (['south', 'east', 'northeast'].includes(direction)) {
    // The three approved sample heads are reused pixel-for-pixel, not redrawn.
    head = await sharp(`docs/assets/source/player-rework/frames/${direction}/idle-0.png`)
      .extract({ left: 20, top: 22, width: 24, height: 21 })
      .png()
      .toBuffer();
  } else {
    const x = Math.round(((n % 4) * m.width) / 4);
    head = await sharp(p, { raw: { width: m.width, height: m.height, channels: 4 } })
      .extract({ left: x, top: n < 4 ? 6 : 39, width: Math.min(26, m.width - x), height: 20 })
      .png()
      .toBuffer();
    head = await sharp(head).trim().png().toBuffer();
  }
  const { data: h, info: hm } = await sharp(head)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = hm.width,
    right = 0,
    top = hm.height,
    bottom = 0;
  for (let y = 0; y < hm.height; y++)
    for (let x = 0; x < hm.width; x++)
      if (h[(y * hm.width + x) * 4 + 3]) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  const crop = { left, top, width: right - left + 1, height: bottom - top + 1 };
  await sharp(head).extract(crop).png().toFile(`${root}/heads/${direction}.png`);
  let body;
  if (['south', 'east', 'northeast'].includes(direction)) {
    body = await sharp(`docs/assets/source/player-rework/frames/${direction}/idle-0.png`)
      .extract({ left: 20, top: 43, width: 24, height: 11 })
      .png()
      .toBuffer();
  } else {
    const x = Math.round(((n % 4) * m.width) / 4);
    const rawBody = await sharp(p, { raw: { width: m.width, height: m.height, channels: 4 } })
      .extract({ left: x, top: n < 4 ? 26 : 59, width: Math.min(26, m.width - x), height: 11 })
      .png()
      .toBuffer();
    body = await sharp(rawBody)
      .extract({ left: 1, top: 0, width: 24, height: 11 })
      .png()
      .toBuffer();
  }
  await fs.writeFile(`${root}/bodies/${direction}.png`, body);
  audit.push({
    direction,
    source: ['south', 'east', 'northeast'].includes(direction)
      ? `docs/assets/source/player-rework/frames/${direction}/idle-0.png`
      : `${inputRoot}/generated/turnaround.png`,
    width: crop.width,
    height: crop.height,
  });
}
await fs.writeFile(
  `${root}/model.json`,
  JSON.stringify({ palette, scale, heads: audit }, null, 2) + '\n',
);
console.log(audit);
