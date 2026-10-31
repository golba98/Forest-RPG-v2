import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { GROVE_ASSETS } from '../../../src/rendering/groveArt';

it('ships exact native-resolution pixel crops from the credited source, with clean transparency', async () => {
  const src = readFileSync('docs/assets/source/grove/plants.png');
  const provenance = JSON.parse(readFileSync('docs/assets/source/grove/provenance.json', 'utf8'));
  expect(createHash('sha256').update(src).digest('hex')).toBe(provenance.plantsSha256);
  const rects = [
    [32, 800, 64, 48],
    [22, 578, 8, 8],
    [33, 578, 8, 8],
    [54, 580, 8, 8],
  ];
  for (const [i, a] of GROVE_ASSETS.entries()) {
    const [left, top, width, height] = rects[i]!;
    let original = sharp(src).extract({ left: left!, top: top!, width: width!, height: height! });
    if (i > 0)
      original = original.extend({
        top: 7,
        bottom: 1,
        left: 4,
        right: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });
    const expected = await original.ensureAlpha().raw().toBuffer();
    const { data, info } = await sharp('public/' + a.src)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data).toEqual(expected);
    expect([info.width, info.height]).toEqual([a.width, a.height]);
    const alphas = Array.from({ length: info.width * info.height }, (_, p) => data[p * 4 + 3]);
    expect(alphas).toContain(0);
    expect(alphas).toContain(255);
    // The artist painted half-opacity contact shadows, not anti-aliased contours.
    expect([...new Set(alphas)].every((a) => a === 0 || a === 127 || a === 255)).toBe(true);
    if (i > 0) {
      for (let x = 0; x < 16; x++) expect(data[(15 * 16 + x) * 4 + 3]).toBe(0);
      for (let y = 0; y < 16; y++) {
        expect(data[y * 16 * 4 + 3]).toBe(0);
        expect(data[(y * 16 + 15) * 4 + 3]).toBe(0);
      }
    }
  }
  const notice = readFileSync('public/assets/licenses/grove/NOTICE.txt', 'utf8');
  expect(notice).toContain(provenance.source);
  expect(notice).toContain('CC BY-SA 3.0');
  expect(notice).toContain(readFileSync('public/assets/licenses/grove/CREDITS-plants.txt', 'utf8'));
});
