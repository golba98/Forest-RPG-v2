import { Rectangle, Texture } from 'pixi.js';
import { rasterizeSoilTile, SOIL_TILE_SIZE as SIZE, type SoilWorld } from './soilMaterial';

/** One sparse atlas per terrain chunk, owned and released with that chunk. */
export interface SoilChunkArt {
  readonly tiles: ReadonlyMap<number, Texture>;
  destroy(): void;
}

export function createSoilChunkArt(
  world: SoilWorld,
  x: number,
  y: number,
  chunkSize: number,
): SoilChunkArt | null {
  const pixels: { key: number; data: Uint8ClampedArray }[] = [];
  for (let ty = y; ty < Math.min(y + chunkSize, world.meta.height); ty++)
    for (let tx = x; tx < Math.min(x + chunkSize, world.meta.width); tx++) {
      const data = rasterizeSoilTile(world, tx, ty);
      if (data) pixels.push({ key: ty * world.meta.width + tx, data });
    }
  if (!pixels.length) return null;
  const columns = Math.min(chunkSize, pixels.length),
    rows = Math.ceil(pixels.length / columns);
  const canvas = document.createElement('canvas');
  canvas.width = columns * SIZE;
  canvas.height = rows * SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot rasterize bank material: 2D canvas unavailable');
  const image = ctx.createImageData(SIZE, SIZE);
  for (const [i, p] of pixels.entries()) {
    image.data.set(p.data);
    ctx.putImageData(image, (i % columns) * SIZE, Math.floor(i / columns) * SIZE);
  }
  const atlas = Texture.from(canvas);
  atlas.source.scaleMode = 'nearest';
  const tiles = new Map<number, Texture>();
  for (const [i, p] of pixels.entries())
    tiles.set(
      p.key,
      new Texture({
        source: atlas.source,
        frame: new Rectangle((i % columns) * SIZE, Math.floor(i / columns) * SIZE, SIZE, SIZE),
      }),
    );
  return {
    tiles,
    destroy() {
      for (const texture of tiles.values()) texture.destroy(false);
      tiles.clear();
      atlas.destroy(true);
    },
  };
}
