import fs from 'node:fs/promises';
import { expect, it } from 'vitest';
import sharp from 'sharp';

const root = 'docs/assets/source/player-final';
type Frame = {
  direction: string;
  clip: string;
  frame: number;
  file: string;
  headOrigin: [number, number];
};

it('preserves the archived experimental fixed-model study for historical comparison', async () => {
  const manifest = JSON.parse(await fs.readFile(`${root}/manifest.json`, 'utf8')) as {
    frames: Frame[];
    heads: { direction: string }[];
  };
  expect(manifest.frames).toHaveLength(456);
  for (const { direction } of manifest.heads) {
    const head = await sharp(`${root}/heads/${direction}.png`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const frames = manifest.frames.filter((f) => f.direction === direction);
    const buffers = new Map<string, Buffer>();
    for (const f of frames) {
      const pixels = await sharp(`${root}/${f.file}`).ensureAlpha().raw().toBuffer();
      buffers.set(`${f.clip}/${f.frame}`, pixels);
      // The crown and facial plane must never grow/shrink, stretch or boil.
      // Hands can occlude the bottom of the head in an upward strike.
      const crown = Buffer.alloc(head.info.width * 15 * 4);
      for (let y = 0; y < 15; y++) {
        const target = ((y + f.headOrigin[1]) * 64 + f.headOrigin[0]) * 4;
        pixels.copy(crown, y * head.info.width * 4, target, target + head.info.width * 4);
      }
      expect(crown, `${direction}/${f.clip}/${f.frame}`).toEqual(
        head.data.subarray(0, crown.length),
      );
      if (f.frame > 0) {
        const previous = frames.find(
          (other) => other.clip === f.clip && other.frame === f.frame - 1,
        );
        expect(previous).toBeDefined();
        expect(Math.abs(f.headOrigin[0] - previous!.headOrigin[0])).toBeLessThanOrEqual(2);
        expect(Math.abs(f.headOrigin[1] - previous!.headOrigin[1])).toBeLessThanOrEqual(1);
      }
    }
    const neutral = buffers.get('idle/0');
    expect(neutral).toBeDefined();
    const opaqueRows = Array.from({ length: 64 }, (_, y) => y).filter((y) =>
      Array.from({ length: 64 }, (_, x) => x).some(
        (x) => (neutral![(y * 64 + x) * 4 + 3] ?? 0) > 0,
      ),
    );
    expect(Math.max(...opaqueRows) + 1, `${direction} planted foot baseline`).toBe(54);
    expect(54 - Math.min(...opaqueRows)).toBeGreaterThanOrEqual(31);
    expect(54 - Math.min(...opaqueRows)).toBeLessThanOrEqual(32);

    for (const clip of ['attack', 'attack2', 'attack3']) {
      expect(buffers.get(`${clip}/0`), `${direction}/${clip} starts neutral`).toEqual(neutral);
      expect(buffers.get(`${clip}/8`), `${direction}/${clip} returns neutral`).toEqual(neutral);
      expect(buffers.get(`${clip}/3`), `${direction}/${clip} has impact at 120ms`).not.toEqual(
        neutral,
      );
    }
    expect(buffers.get('walk/0')).toEqual(neutral);
    expect(buffers.get('jump/0')).toEqual(neutral);
    expect(buffers.get('jump/7')).toEqual(neutral);

  }
}, 20_000);
