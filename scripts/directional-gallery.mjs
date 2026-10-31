// Assemble actual browser pixel-test crops; no re-rendering of game artwork.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root = process.argv[2] ?? 'test-results';
const destination = process.argv[3] ?? 'artifacts/directional-gallery';
async function files(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(path.join(dir, e.name)) : path.join(dir, e.name)))).flat();
}
const all = await files(root);
const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const columns = [['idle', 4], ['walk', 4], ['run', 6], ['punch', 4]].flatMap(([anim, count]) => Array.from({ length: count }, (_, i) => `${anim}-${i}`));
await fs.mkdir(destination, { recursive: true });
for (const browser of process.argv[4] ? [process.argv[4]] : ['chromium', 'firefox']) {
  const layers = [], labels = [];
  for (const [row, direction] of directions.entries()) {
    labels.push(`<text x="5" y="${row * 96 + 80}">${direction}</text>`);
    for (const [col, label] of columns.entries()) {
      const file = all.find(f => f.includes(browser) && path.basename(f) === `${direction}-${label}.png`);
      if (!file) throw new Error(`Missing ${browser} ${direction}-${label}`);
      layers.push({ input: file, left: 40 + col * 96, top: 32 + row * 96 });
      if (!row) labels.push(`<text x="${42 + col * 96}" y="20">${label}</text>`);
    }
  }
  const width = 40 + columns.length * 96, height = 32 + directions.length * 96;
  const svg = `<svg width="${width}" height="${height}"><g fill="#eee" font-family="sans-serif" font-size="13">${labels.join('')}</g></svg>`;
  layers.push({ input: Buffer.from(svg), left: 0, top: 0 });
  await sharp({ create: { width, height, channels: 4, background: '#17241c' } }).composite(layers).png().toFile(path.join(destination, `${browser}-all-frames.png`));
}
