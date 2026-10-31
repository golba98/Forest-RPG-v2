/** Extract licensed pixel art; deliberately performs no resampling or redrawing. */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const source = new URL('../docs/assets/source/grove/plants.png', import.meta.url);
const provenance = JSON.parse(
  await readFile(new URL('../docs/assets/source/grove/provenance.json', import.meta.url), 'utf8'),
);
const bytes = await readFile(source);
if (createHash('sha256').update(bytes).digest('hex') !== provenance.plantsSha256)
  throw new Error('LPC source changed: verify license/provenance before extracting');
const output = new URL('../public/assets/images/objects/grove/', import.meta.url);
await mkdir(output, { recursive: true });
const crops = [
  ['stump', 32, 800, 64, 48],
  ['mushroom_1', 22, 578, 8, 8],
  ['mushroom_2', 33, 578, 8, 8],
  ['mushroom_3', 54, 580, 8, 8],
];
for (const [name, left, top, width, height] of crops) {
  let image = sharp(bytes).extract({ left, top, width, height });
  // The source is not a uniform tile grid. Isolate each complete fungus first;
  // transparent padding gives all variants one bottom-centred placement anchor.
  if (name !== 'stump')
    image = image.extend({
      top: 7,
      bottom: 1,
      left: 4,
      right: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  await image.png().toFile(fileURLToPath(new URL(`${name}.png`, output)));
}
