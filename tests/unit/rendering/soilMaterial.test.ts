import { expect, it } from 'vitest';
import { rasterizeSoilTile, type SoilWorld } from '../../../src/rendering/soilMaterial';
import { Tile } from '../../../src/types/tiles';

function scene(): SoilWorld {
  const tiles = new Uint8Array(25).fill(Tile.GRASS);
  tiles[12] = Tile.MUD;
  tiles[7] = Tile.RIVER;
  return { tiles, meta: { width: 5, height: 5 } };
}
const alpha = (pixels: Uint8ClampedArray, x: number, y: number) => pixels[(y * 32 + x) * 4 + 3]!;

it('a bank patch has a graded material transition instead of a nearly opaque rectangular stamp', () => {
  const pixels = rasterizeSoilTile(scene(), 2, 2)!;
  const levels = new Set(Array.from({ length: 1024 }, (_, i) => pixels[i * 4 + 3]));
  expect(levels.size).toBeGreaterThan(16);
  expect(alpha(pixels, 16, 16)).toBeGreaterThan(200); // Keep actual soil.
});

it('soil and adjacent grass share a transition rather than clipping at the tile border', () => {
  const world = scene();
  const mud = rasterizeSoilTile(world, 2, 2)!;
  const grass = rasterizeSoilTile(world, 3, 2);
  expect(grass).not.toBeNull();
  expect(alpha(grass!, 0, 16)).toBeGreaterThan(0);
  expect(Math.abs(alpha(mud, 31, 16) - alpha(grass!, 0, 16))).toBeLessThan(32);
});

it('retains deterministic rasterization without modifying saved cells', () => {
  const world = scene(),
    before = Array.from(world.tiles);
  expect(rasterizeSoilTile(world, 2, 2)).toEqual(rasterizeSoilTile(world, 2, 2));
  expect(Array.from(world.tiles)).toEqual(before);
  expect(rasterizeSoilTile(world, 2, 1)).toBeNull(); // Never paint over water.
});

it('keeps a continuous bank solid at connected cell corners without periodic grass cutouts', () => {
  const tiles = new Uint8Array(25).fill(Tile.MUD);
  for (let x = 0; x < 5; x++) tiles[x] = Tile.RIVER;
  const world = { tiles, meta: { width: 5, height: 5 } };
  for (const tx of [1, 2, 3]) {
    const p = rasterizeSoilTile(world, tx, 1)!;
    expect(alpha(p, 0, 0)).toBe(240);
    expect(alpha(p, 31, 0)).toBe(240);
  }
});

it('water alone never paints soil and raised/solid surfaces never receive it', () => {
  const world = scene();
  (world.tiles as Uint8Array)[12] = Tile.GRASS;
  expect(rasterizeSoilTile(world, 2, 2)).toBeNull();
  for (const tile of [Tile.PLATEAU, Tile.STAIRS, Tile.CLIFF, Tile.BORDER, Tile.LOG, Tile.RAMP]) {
    (world.tiles as Uint8Array)[12] = Tile.MUD;
    (world.tiles as Uint8Array)[13] = tile;
    expect(rasterizeSoilTile(world, 3, 2)).toBeNull();
  }
});

it('matches sampling across tile/chunk borders for every 8-neighbor material arrangement', () => {
  const offsets = [
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
  ];
  for (let mask = 0; mask < 256; mask++) {
    const tiles = new Uint8Array(25).fill(Tile.GRASS);
    tiles[12] = Tile.MUD;
    offsets.forEach(([dx, dy], i) => {
      if (mask & (1 << i)) tiles[(2 + dy!) * 5 + 2 + dx!] = Tile.MUD;
    });
    const world = { tiles, meta: { width: 5, height: 5 } };
    const a = rasterizeSoilTile(world, 2, 2)!,
      b = rasterizeSoilTile(world, 3, 2)!;
    for (let y = 0; y < 32; y++)
      expect(Math.abs(alpha(a, 31, y) - alpha(b, 0, y)), `mask ${mask}, row ${y}`).toBeLessThan(32);
  }
});
