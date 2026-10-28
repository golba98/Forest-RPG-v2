import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  BLOB_MASKS,
  NB,
  elevationMask,
  hillAtlasMasks,
  hillFrame,
  hillShadowFrame,
  isElevatedTile,
  reduceMask,
} from '../../../src/rendering/hillAutotile';
import { getTileArt } from '../../../src/rendering/terrainArt';
import { Tile } from '../../../src/types/tiles';
import { generateWorld } from '../../../src/world/WorldGenerator';

const ATLAS = resolve(__dirname, '../../../public/assets/images/terrain/hills/cliff_tileset.png');

describe('hill autotile', () => {
  it('has the 47 blob masks in the same order as the generated atlas', () => {
    expect(BLOB_MASKS).toHaveLength(47);
    expect(hillAtlasMasks()).toEqual(BLOB_MASKS);
  });

  it('maps every one of the 256 neighbour masks to a non-blank frame inside the atlas', async () => {
    const { data, info } = await sharp(readFileSync(ATLAS)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const opaque = (rect: { x: number; y: number; w: number; h: number }) => {
      let n = 0;
      for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) if ((data[(y * info.width + x) * 4 + 3] ?? 0) > 0) n++;
      return n / (rect.w * rect.h);
    };
    for (let mask = 0; mask < 256; mask++) {
      for (let variant = 0; variant < 3; variant++) {
        const rect = hillFrame(mask, variant);
        expect(rect.x + rect.w).toBeLessThanOrEqual(info.width);
        expect(rect.y + rect.h).toBeLessThanOrEqual(info.height);
        // Rounded outer corners are transparent, but no configuration renders blank.
        expect(opaque(rect)).toBeGreaterThan(0.85);
      }
    }
    const shadow = hillShadowFrame();
    expect(opaque(shadow)).toBeGreaterThan(0.1);
  });

  it('keeps a gutter between frames so nearest sampling cannot bleed', () => {
    const rects = BLOB_MASKS.map((m) => hillFrame(m));
    for (const a of rects) for (const b of rects) {
      if (a === b) continue;
      const apart = a.x + a.w + 2 <= b.x || b.x + b.w + 2 <= a.x || a.y + a.h + 2 <= b.y || b.y + b.h + 2 <= a.y;
      expect(apart).toBe(true);
    }
  });

  it('only keeps diagonals whose two cardinals are elevated', () => {
    expect(reduceMask(NB.NE)).toBe(0);
    expect(reduceMask(NB.N | NB.NE)).toBe(NB.N);
    expect(reduceMask(NB.N | NB.E | NB.NE)).toBe(NB.N | NB.E | NB.NE);
  });

  it('reads elevation topology from world tiles', () => {
    const w = 3, h = 3;
    const tiles = new Uint8Array(w * h).fill(Tile.GRASS);
    tiles[0] = Tile.PLATEAU; // NW of centre
    tiles[1] = Tile.HILL_N; // N of centre
    tiles[5] = Tile.HILL_E; // E of centre
    expect(elevationMask(tiles, w, h, 1, 1)).toBe(NB.NW | NB.N | NB.E);
    expect(isElevatedTile(Tile.CLIFF)).toBe(false);
    expect(isElevatedTile(Tile.PLATEAU)).toBe(true);
  });

  it('draws hills from the atlas and shades the ground below a cliff face', () => {
    const hill = getTileArt(Tile.HILL_S, 4, 4, NB.N | NB.E | NB.W);
    expect(hill.map((l) => l.alias)).toEqual(['tile_grass', 'hill_cliff_tileset']);
    const below = getTileArt(Tile.GRASS, 4, 5, NB.N);
    expect(below.at(-1)?.alias).toBe('hill_cliff_tileset');
    expect(getTileArt(Tile.GRASS, 4, 9, 0).map((l) => l.alias)).toEqual(['tile_grass']);
  });

  it('gives every elevated cell of generated worlds an atlas frame', () => {
    for (const seed of [1, 42, 1337]) {
      const world = generateWorld({ seed, level: 1, difficulty: 'normal' });
      const { width, height } = world.meta;
      let elevated = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const tile = world.tiles[y * width + x] ?? 0;
        if (!isElevatedTile(tile)) continue;
        elevated++;
        const layers = getTileArt(tile, x, y, elevationMask(world.tiles, width, height, x, y));
        expect(layers[1]?.source.type).toBe('rect');
      }
      expect(elevated).toBeGreaterThan(0);
    }
  });
});
