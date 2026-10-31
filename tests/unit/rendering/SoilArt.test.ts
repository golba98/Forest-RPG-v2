import { afterEach, expect, it, vi } from 'vitest';
import { Texture, TextureSource } from 'pixi.js';
import { createSoilChunkArt } from '../../../src/rendering/SoilArt';
import { rasterizeSoilTile } from '../../../src/rendering/soilMaterial';
import { Tile } from '../../../src/types/tiles';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('packs exact pixels across chunk borders, rebuilds after edits and releases owned sources', () => {
  const writes: Uint8ClampedArray[] = [];
  const canvases: { width: number; height: number }[] = [];
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          createImageData: () => ({ data: new Uint8ClampedArray(4096) }),
          putImageData: (image: { data: Uint8ClampedArray }) => writes.push(image.data.slice()),
        }),
      };
      canvases.push(canvas);
      return canvas;
    },
  });
  vi.spyOn(Texture, 'from').mockImplementation((resource) => {
    const canvas = resource as unknown as { width: number; height: number };
    return new Texture({
      source: new TextureSource({ width: canvas.width, height: canvas.height }),
    });
  });
  const tiles = new Uint8Array(32 * 32).fill(Tile.GRASS);
  tiles[15 * 32 + 15] = Tile.MUD;
  const world = { tiles, meta: { width: 32, height: 32 } };
  const chunks = [createSoilChunkArt(world, 0, 0, 16)!, createSoilChunkArt(world, 16, 0, 16)!];
  expect(chunks.every(Boolean)).toBe(true);
  expect(chunks[0]!.tiles.has(15 * 32 + 15)).toBe(true);
  expect(chunks[1]!.tiles.has(15 * 32 + 16)).toBe(true);
  const expected = rasterizeSoilTile(world, 16, 15)!;
  expect(writes.some((p) => p.every((v, i) => v === expected[i]))).toBe(true);
  const sources = chunks.map((c) => [...c.tiles.values()][0]!.source);
  for (const chunk of chunks) chunk.destroy();
  expect(sources.every((s) => s.destroyed)).toBe(true);
  expect(chunks.every((c) => c.tiles.size === 0)).toBe(true);
  tiles[15 * 32 + 15] = Tile.GRASS;
  expect(createSoilChunkArt(world, 0, 0, 16)).toBeNull();
  expect(canvases).toHaveLength(2);
});
