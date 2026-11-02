import fs from 'node:fs/promises';
import sharp from 'sharp';

export const studyPattern = /^\/assets\/images\/characters\/player\/(idle|walk|attack)\/\1_(south|east|northeast)\.png$/;
const cache = new Map();

export async function studyAsset(phase, clip, direction) {
  const key = `${phase}/${clip}/${direction}`;
  if (cache.has(key)) return cache.get(key);
  let result;
  if (phase === 'candidate' || phase === 'rejected') {
    const root = phase === 'candidate' ? 'artifacts/player-rework/sheets' : 'docs/assets/source/player-rework/rejected';
    result = await fs.readFile(`${root}/${clip}/${clip}_${direction}.png`);
  } else if (phase === 'original') {
    // Preserve legacy visible padding and scale while adapting only the cells
    // to the current animation metadata. This is an artwork comparison, not
    // a claim to recreate the original animation clock.
    const sourceDirection = clip === 'attack' && direction === 'northeast' ? 'northwest' : direction;
    const file = `docs/assets/source/player-remaster/original/${clip}/${clip}_${sourceDirection}.png`;
    const m = await sharp(file).metadata();
    const count = clip === 'idle' ? 6 : clip === 'walk' ? 8 : 9;
    const scale = clip === 'attack' ? .34 : 2;
    const frames = [];
    for (let i = 0; i < count; i++) {
      const old = Math.min(3, Math.floor(i * 4 / count));
      const x = Math.floor(old * m.width / 4), w = Math.floor((old + 1) * m.width / 4) - x;
      const width = Math.round(w * scale), height = Math.round(m.height * scale);
      const input = await sharp(file).extract({ left: x, top: 0, width: w, height: m.height })
        .resize(width, height, { kernel: 'nearest' }).png().toBuffer();
      frames.push({ input, left: i * 64 + 32 - Math.floor(width / 2), top: 54 - height });
    }
    result = await sharp({ create: { width: count * 64, height: 64, channels: 4, background: '#00000000' } })
      .composite(frames).png().toBuffer();
  } else return null;
  cache.set(key, result);
  return result;
}
