// Export only the approved native frames. Validate every output before writing.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
const root = 'docs/assets/source/player-face-continuity';
const out = 'public/assets/images/characters/player';
const approval = JSON.parse(await fs.readFile(`${root}/approval.json`, 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function validate(file, bytes) {
  if (hash(bytes) !== approval.files[file])
    throw Error(`Approved character checksum mismatch: ${file}. No exports were written.`);
}
for (const file of Object.keys(approval.files))
  if (file.startsWith(root + '/')) validate(file, await fs.readFile(file));
const m = JSON.parse(await fs.readFile(root + '/manifest.json'));
const outputs = new Map();
for (const c of m.clips) {
  const images = [];
  for (let f = 0; f < c.frames; f++)
    images.push({ input: `${root}/frames/${c.dir}/${c.clip}-${f}.png`, left: f * 64, top: 0 });
  const bytes = await sharp({
    create: { width: c.frames * 64, height: 64, channels: 4, background: '#00000000' },
  })
    .composite(images)
    .png()
    .toBuffer();
  outputs.set(`${out}/${c.clip}/${c.clip}_${c.dir}.png`, bytes);
}
outputs.set(
  'src/animation/playerFluidMetadata.json',
  Buffer.from(
    JSON.stringify(
      {
        counts: m.counts,
        durations: m.durations,
        gaitOffsets: m.gaitOffsets,
      },
      null,
      2,
    ),
  ),
);
outputs.set(
  'src/animation/playerNativePixels.json',
  await fs.readFile(root + '/native-pixels.json'),
);
outputs.set('src/animation/playerFaceMetadata.json', await fs.readFile(root + '/face.json'));
for (const [file, bytes] of outputs) validate(file, bytes);
for (const [file, bytes] of outputs) await fs.writeFile(file, bytes);
console.log(
  'Verified and exported the exact approved character: 56 strips and native definitions.',
);
