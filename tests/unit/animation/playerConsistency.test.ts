import faces from '../../../src/animation/playerFaceMetadata.json';
import { it, expect } from 'vitest';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import manifest from '../../../docs/assets/source/player-face-continuity/manifest.json';
import approval from '../../../docs/assets/source/player-face-continuity/approval.json';
import native from '../../../src/animation/playerNativePixels.json';
import { decodePlayerPixels, playerRgba } from '../../../src/animation/playerPixelMath';
const root = 'docs/assets/source/player-face-continuity';
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
it('uses the exact existing first-idle head in each direction', async () => {
  for (const [dir, face] of Object.entries(faces)) {
    const old = await sharp(`public/assets/images/characters/player/idle/idle_${dir}.png`)
      .extract({ left: 0, top: 0, width: 64, height: 64 })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const head = playerRgba(decodePlayerPixels(face.head));
    const end = (face.cut + 1) * 64 * 4;
    expect(Buffer.from(head.subarray(0, end)).equals(old.subarray(0, end)), dir).toBe(true);
    expect(head.subarray(end).every((c) => c === 0)).toBe(true);
  }
});
it('packs all 912 reviewed native frames and runtime definitions without changing a pixel', async () => {
  let frames = 0;
  for (const c of manifest.clips)
    for (let f = 0; f < c.frames; f++) {
      const file = `${root}/frames/${c.dir}/${c.clip}-${f}.png`;
      const source = await sharp(file).ensureAlpha().raw().toBuffer();
      const packed = await sharp(
        `public/assets/images/characters/player/${c.clip}/${c.clip}_${c.dir}.png`,
      )
        .extract({ left: f * 64, top: 0, width: 64, height: 64 })
        .ensureAlpha()
        .raw()
        .toBuffer();
      const encoded =
        native[c.dir as keyof typeof native][c.clip as keyof typeof manifest.counts][f]!;
      expect(hash(source), file).toBe(c.hashes[f]);
      expect(packed.equals(source), file).toBe(true);
      expect(Buffer.from(playerRgba(decodePlayerPixels(encoded))).equals(source), file).toBe(true);
      frames++;
    }
  expect(frames).toBe(912);
}, 20000);
it('preserves the approved head and adjacent anchors in every pose', async () => {
  let checked = 0;
  for (const c of manifest.clips) {
    const dir = c.dir as keyof typeof native;
    const clip = c.clip as keyof typeof manifest.counts;
    const face = faces[dir];
    const reference = decodePlayerPixels(face.head);
    for (let f = 0; f < c.frames; f++) {
      const out = decodePlayerPixels(native[dir][clip][f]!);
      const registration = face.poses[clip][f]!;
      const [dx, dy] = registration.offset;
      const front = decodePlayerPixels(registration.foreground);
      const previous = face.poses[clip][(f + c.frames - 1) % c.frames]!;
      if (f > 0 || ['idle', 'walk', 'run'].includes(clip)) {
        expect(Math.abs(dx! - previous.offset[0]!)).toBeLessThanOrEqual(1);
        expect(Math.abs(dy! - previous.offset[1]!)).toBeLessThanOrEqual(1);
      }
      for (let i = 0; i < 4096; i++) {
        const at = i + dx! + dy! * 64;
        if (reference[i] && !front[at])
          expect(out[at], `${dir}/${clip}/${f} head ${i}`).toBe(reference[i]);
      }
      checked++;
    }
  }
  expect(checked).toBe(912);
}, 30000);
it('locks the approved source, runtime definitions and all 56 exports', async () => {
  const locked = Object.entries(approval.files);
  expect(approval.status).toBe('approved');
  expect(locked).toHaveLength(989);
  for (const [file, expected] of locked) expect(hash(await fs.readFile(file)), file).toBe(expected);
  const hashes = JSON.parse(await fs.readFile(`${root}/sheet-hashes.json`, 'utf8')) as Record<
    string,
    string
  >;
  expect(Object.keys(hashes)).toHaveLength(56);
  for (const [file, expected] of Object.entries(hashes)) {
    const bytes = await fs.readFile(`public/assets/images/characters/player/${file}`);
    expect(hash(bytes), file).toBe(expected);
    const { data, info } = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.height).toBe(64);
    expect(info.width).toBe(
      manifest.counts[file.split('/')[0] as keyof typeof manifest.counts] * 64,
    );
    let invalid = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0 && data[i] !== 255) invalid++;
    expect(invalid, file).toBe(0);
  }
}, 20000);
