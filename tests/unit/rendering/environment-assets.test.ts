import { expect, it } from 'vitest';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assets from '../../../src/world/environmentAssets.json' with { type: 'json' };
import { BIOMES } from '../../../src/world/Biomes';
import { propFootprint } from '../../../src/world/ObjectSemantics';
import { hillFrame, hillStairsFrame } from '../../../src/rendering/hillAutotile';

it('ships complete transparent trees with shared render/collision metadata and real biome plant atlases', async () => {
  const hashes = new Set<string>();
  for (const [i, a] of assets.trees.entries()) {
    const file = await readFile(`public/assets/images/environment/shared/tree-${i}.png`);
    const { data, info } = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([a.width, a.height]);
    expect(data.some((v, n) => n % 4 === 3 && v === 0)).toBe(true);
    expect(data.some((v, n) => n % 4 === 3 && v > 200)).toBe(true);
    hashes.add(createHash('sha256').update(file).digest('hex'));
    expect(
      propFootprint({ id: i, kind: 'tree', tileX: 0, tileY: 0, solid: true, variant: i }),
    ).toEqual({
      minX: 0.5 + a.collision[0]!,
      minY: 1 + a.collision[1]!,
      maxX: 0.5 + a.collision[2]!,
      maxY: 1 + a.collision[3]!,
    });
  }
  expect(hashes.size).toBe(14);
  for (const biome of BIOMES) {
    expect(biome.trees.every((i) => assets.trees[i]?.biomes.includes(biome.id))).toBe(true);
    const image = await sharp(`public/assets/images/environment/${biome.id}/plants.png`).metadata();
    expect(image.width).toBe(biome.plants.length * 32);
    expect(image.height).toBe(32);
  }
});

it('paints raised ground and every ramp corridor opaquely without changing its geometry', async () => {
  const { data, info } = await sharp('public/assets/images/environment/shared/upland.png')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const top = hillFrame(255);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++)
      expect(data[((top.y + y) * info.width + top.x + x) * 4 + 3]).toBe(255);
  for (const [mask, vertical] of [
    [239, true],
    [254, true],
    [251, false],
    [191, false],
  ] as const) {
    const f = hillStairsFrame(mask);
    for (let along = 0; along < 32; along++)
      for (let side = 2; side < 30; side++) {
        const x = vertical ? side : along,
          y = vertical ? along : side;
        expect(data[((f.y + y) * info.width + f.x + x) * 4 + 3]).toBe(255);
      }
  }
});

it('ships biome relief variants with opaque treads and ground-revealing stair edges', async () => {
  const packs = new Set<string>();
  for (const b of BIOMES) {
    const path = `public/assets/images/environment/${b.id}/upland.png`;
    const { data, info } = await sharp(path)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.height).toBe(648);
    packs.add(createHash('sha256').update(data).digest('hex'));
    const variations = new Set<string>();
    for (let v = 0; v < 3; v++) {
      const face = hillFrame(239);
      const pixels = [];
      for (let y = 12; y < 32; y++)
        for (let x = 0; x < 32; x++)
          pixels.push(
            ...data.subarray(
              ((face.y + y + v * 216) * info.width + face.x + x) * 4,
              ((face.y + y + v * 216) * info.width + face.x + x) * 4 + 4,
            ),
          );
      variations.add(createHash('sha256').update(Buffer.from(pixels)).digest('hex'));
      for (const [mask, vertical] of [
        [239, true],
        [254, true],
        [251, false],
        [191, false],
      ] as const) {
        const f = hillStairsFrame(mask);
        for (let along = 0; along < 32; along++)
          for (let side = 2; side < 30; side++) {
            const alpha =
              data[
                ((f.y + (vertical ? along : side) + v * 216) * info.width +
                  f.x +
                  (vertical ? side : along)) *
                  4 +
                  3
              ];
            if (side === 2 || side === 29 || along === 0 || along === 31) expect(alpha).toBe(0);
            else if (side >= 5 && side <= 26 && along >= 3 && along <= 28) expect(alpha).toBe(255);
          }
      }
    }
    expect(variations.size).toBe(3);
  }
  expect(packs.size).toBe(5);
});
