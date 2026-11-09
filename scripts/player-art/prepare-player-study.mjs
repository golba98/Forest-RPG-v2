import { stagingDirectory } from '../assets/output-directory.mjs';
// Lossless packing of reviewed native frames. No resizing or recolouring.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = 'docs/assets/source/player-rework';
const destination = stagingDirectory(process.argv[2], 'artifacts/player-rework/sheets');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
const gallery = [];
for (const [row, sheet] of manifest.sheets.entries()) {
  const layers = [];
  for (const [column, frame] of sheet.frames.entries()) {
    const input = await fs.readFile(path.join(root, frame.file));
    const m = await sharp(input).metadata();
    if (m.width !== 64 || m.height !== 64) throw Error(`Invalid native cell: ${frame.file}`);
    layers.push({ input, left: column * 64, top: 0 });
    gallery.push({ input, left: column * 64, top: row * 64 });
  }
  await fs.mkdir(path.join(destination, sheet.clip), { recursive: true });
  await sharp({
    create: { width: sheet.frames.length * 64, height: 64, channels: 4, background: '#00000000' },
  })
    .composite(layers)
    .png()
    .toFile(path.join(destination, sheet.clip, `${sheet.clip}_${sheet.direction}.png`));
}
await fs.mkdir('artifacts/player-rework', { recursive: true });
await sharp({ create: { width: 576, height: 576, channels: 4, background: '#445846' } })
  .composite(gallery)
  .png()
  .toFile('artifacts/player-rework/native-gallery.png');
await sharp('artifacts/player-rework/native-gallery.png')
  .resize(1728, 1728, { kernel: 'nearest' })
  .png()
  .toFile('artifacts/player-rework/gallery-3x.png');
console.log(`Packed 9 sample strips / 69 frames losslessly into ${destination}`);
