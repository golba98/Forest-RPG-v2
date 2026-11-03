import { expect, it } from 'vitest';
import { composeStairGround } from '../../../src/rendering/stairGround';
import { rasterizeSoilTile, type SoilWorld } from '../../../src/rendering/soilMaterial';
import { elevationMask } from '../../../src/world/ElevationTopology';
import { Tile } from '../../../src/types/tiles';

const directions = [
  { mask: 254, nx: 0, ny: -1, vertical: true },
  { mask: 251, nx: 1, ny: 0, vertical: false },
  { mask: 239, nx: 0, ny: 1, vertical: true },
  { mask: 191, nx: -1, ny: 0, vertical: false },
] as const;
const solid = (rgb: readonly number[]) =>
  Uint8ClampedArray.from({ length: 4096 }, (_, i) => (i % 4 === 3 ? 255 : rgb[i % 4]!));
function world(nx: number, ny: number, level: number, biome = 2): SoilWorld {
  const tiles = new Uint8Array(25),
    elevations = new Uint8Array(25);
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 5; x++) {
      const h = (x - 2) * nx + (y - 2) * ny <= 0 ? level : level - 1;
      tiles[y * 5 + x] = h > 0 ? Tile.PLATEAU : Tile.GRASS;
      elevations[y * 5 + x] = h;
    }
  tiles[12] = Tile.STAIRS;
  return {
    tiles,
    elevations,
    meta: { width: 5, height: 5 },
    window: { originX: -64, originY: 128, descriptor: { generatorVersion: 16 } },
    environment: {
      version: 1,
      biome: Array(25).fill(biome),
      secondary: Array(25).fill(biome),
      blend: Array(25).fill(0),
      relief: Array(25).fill(240),
      moisture: Array(25).fill(100),
      material: Array(25).fill(0),
      cover: Array(25).fill(0),
    },
  };
}
it('backs the whole collision opening opaquely and follows upper/lower materials in all orientations', () => {
  for (const d of directions) {
    const upper = { pixels: solid([142, 146, 132]), tint: 0xffffff },
      lower = { pixels: solid([83, 102, 46]), tint: 0xffffff };
    const p = composeStairGround(d.mask, upper, lower);
    for (let along = 0; along < 32; along++)
      for (let side = 0; side < 32; side++) {
        const x = d.vertical ? side : along,
          y = d.vertical ? along : side,
          i = (y * 32 + x) * 4;
        expect(p[i + 3]).toBe(side >= 2 && side < 30 ? 255 : 0);
        if (side === 16) {
          const low = d.nx + d.ny > 0 ? along : 31 - along;
          expect(p[i]).toBe(Math.round(142 * (1 - low / 31) + (83 * low) / 31));
        }
      }
  }
});
it('uses the supplied floor tint instead of baking in a grass palette', () => {
  const p = composeStairGround(
    239,
    { pixels: solid([160, 120, 90]), tint: 0x808080 },
    { pixels: solid([80, 60, 45]), tint: 0xffffff },
  );
  expect(p[16 * 4]).toBe(Math.round((160 * 128) / 255));
  expect(p[(31 * 32 + 16) * 4]).toBe(80);
});
it('carries highland pigment through stair openings at every tier without painting adjacent cliff cheeks', () => {
  for (const d of directions)
    for (const level of [1, 2, 3]) {
      const w = world(d.nx, d.ny, level),
        before = Array.from(w.tiles);
      expect(elevationMask(w.tiles, 5, 5, 2, 2, w.elevations) & 85).toBe(d.mask & 85);
      const stair = rasterizeSoilTile(w, 2, 2)!;
      for (let along = 0; along < 32; along++)
        for (let side = 2; side < 30; side++) {
          const x = d.vertical ? side : along,
            y = d.vertical ? along : side;
          expect(stair[(y * 32 + x) * 4 + 3]).toBeGreaterThan(200);
        }
      const normal = rasterizeSoilTile(
        { ...w, tiles: Uint8Array.from(w.tiles, (t, i) => (i === 12 ? Tile.PLATEAU : t)) },
        2,
        2,
      )!;
      // Pixels outside the passable corridor retain the normal relief clipping.
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++)
          if ((d.vertical ? x : y) < 2 || (d.vertical ? x : y) >= 30)
            expect(stair[(y * 32 + x) * 4 + 3]).toBe(normal[(y * 32 + x) * 4 + 3]);
      expect(Array.from(w.tiles)).toEqual(before);
    }
});
it('blends a wetland mud approach into the opening while keeping legacy rendering unchanged', () => {
  const w = world(0, 1, 1, 3);
  (w.tiles as Uint8Array).fill(Tile.MUD, 15);
  const p = rasterizeSoilTile(w, 2, 2)!;
  expect(p[(31 * 32 + 16) * 4 + 3]).toBeGreaterThan(50);
  expect(p[(1 * 32 + 16) * 4 + 3]).toBe(0);
  expect(
    rasterizeSoilTile(
      { ...w, window: { originX: 0, originY: 0, descriptor: { generatorVersion: 14 } } },
      2,
      2,
    ),
  ).toBeNull();
});
it('keeps ground material aligned after a negative-coordinate window rebase', () => {
  const a = world(0, 1, 2),
    b = {
      ...a,
      meta: { width: 7, height: 7 },
      tiles: new Uint8Array(49).fill(Tile.GRASS),
      elevations: new Uint8Array(49),
      window: { ...a.window!, originX: -65, originY: 127 },
      environment: {
        ...a.environment!,
        ...Object.fromEntries(
          ['biome', 'secondary', 'blend', 'relief', 'moisture', 'material', 'cover'].map((k) => [
            k,
            Array(49).fill(k === 'biome' || k === 'secondary' ? 2 : k === 'relief' ? 240 : 0),
          ]),
        ),
      },
    };
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 5; x++) {
      b.tiles[(y + 1) * 7 + x + 1] = a.tiles[y * 5 + x]!;
      b.elevations[(y + 1) * 7 + x + 1] = a.elevations![y * 5 + x]!;
    }
  expect(rasterizeSoilTile(a, 2, 2)).toEqual(rasterizeSoilTile(b, 3, 3));
});
