import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
const out = 'public/assets/images/objects/nest';
await mkdir(out, { recursive: true });
const { data } = await sharp('docs/assets/source/bug-nest-generated.png').trim().resize(96, 80, { fit: 'fill', kernel: 'nearest' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
// Binary alpha prevents fringes. All layers retain the same native pixel grid.
for (let i = 0; i < data.length; i += 4) data[i + 3] = data[i + 3] >= 128 ? 255 : 0;
for (const layer of ['body', 'front', 'ground', 'cleared']) {
  const pixels = Buffer.from(data);
  for (let y = 0; y < 80; y++) for (let x = 0; x < 96; x++) {
    const i = (y * 96 + x) * 4;
    const keep = layer === 'body' ? y < 62 : layer === 'ground' ? y >= 72 : y >= 62 && y < 72;
    if (!keep) pixels[i + 3] = 0;
    if (layer === 'cleared' && keep) {
      pixels[i] = Math.round(pixels[i] * 0.7);
      pixels[i + 1] = Math.min(255, Math.round(pixels[i + 1] * 1.2));
    }
  }
  await sharp(pixels, { raw: { width: 96, height: 80, channels: 4 } }).png({ palette: true, colours: 32, dither: 0 }).toFile(`${out}/nest_${layer}.png`);
}
