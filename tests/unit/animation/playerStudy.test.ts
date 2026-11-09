import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import sharp from 'sharp';

const root = 'docs/assets/source/player-rework';
type StudySheet = { direction: string; clip: string; frames: { file: string }[] };

it('preserves all 69 archived review poses with lossless packing and stable anchors', async () => {
  const manifest = JSON.parse(await fs.readFile(`${root}/manifest.json`, 'utf8')) as {
    palette: string[];
    sheets: StudySheet[];
    sourceScale: number;
  };
  expect(manifest.sourceScale).toBe(1 / 7);
  const palette = new Set(manifest.palette);
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'forest-player-study-'));
  try {
    execFileSync(process.execPath, ['scripts/player-art/prepare-player-study.mjs', out]);
    let total = 0;
    for (const sheet of manifest.sheets) {
      const packed = path.join(out, sheet.clip, `${sheet.clip}_${sheet.direction}.png`);
      const metadata = await sharp(packed).metadata();
      expect(metadata.width).toBe(sheet.frames.length * 64);
      expect(metadata.height).toBe(64);
      for (const [i, frame] of sheet.frames.entries()) {
        const { data, info } = await sharp(`${root}/${frame.file}`)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        expect(info.width).toBe(64);
        expect(info.height).toBe(64);
        expect(
          await sharp(packed)
            .extract({ left: i * 64, top: 0, width: 64, height: 64 })
            .ensureAlpha()
            .raw()
            .toBuffer(),
        ).toEqual(data);
        let invalid = 0,
          outside = 0,
          count = 0,
          bottom = 0,
          top = 64;
        for (let p = 0; p < data.length; p += 4) {
          const alpha = data[p + 3];
          if (!alpha) continue;
          const x = (p / 4) % 64,
            y = Math.floor(p / 4 / 64);
          if (alpha !== 255 || !palette.has(data.subarray(p, p + 3).toString('hex'))) invalid++;
          if (x < 3 || x >= 61 || y < 3 || y >= 61) outside++;
          count++;
          bottom = Math.max(bottom, y + 1);
          top = Math.min(top, y);
        }
        expect(invalid, frame.file).toBe(0);
        expect(outside, frame.file).toBe(0);
        expect(count, frame.file).toBeGreaterThan(200);
        expect(bottom, frame.file).toBe(54);
        expect(bottom - top, frame.file).toBeGreaterThanOrEqual(29);
        expect(bottom - top, frame.file).toBeLessThanOrEqual(35);
        total++;
      }
    }
    expect(total).toBe(69);
  } finally {
    await fs.rm(out, { recursive: true, force: true });
  }
}, 15_000);
