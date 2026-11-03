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
  const builder = new SoilChunkBuilder(world, chunkSize);
  for (let ty = y; ty < Math.min(y + chunkSize, world.meta.height); ty++)
    for (let tx = x; tx < Math.min(x + chunkSize, world.meta.width); tx++) builder.add(tx, ty);
  return builder.finish();
}

/** Tile-sized preparation steps let the residency queue yield between rasterizations. */
export class SoilChunkBuilder {
  private readonly pixels: { key: number; data: Uint8ClampedArray }[] = [];
  constructor(
    private readonly world: SoilWorld,
    private readonly chunkSize: number,
  ) {}

  add(tx: number, ty: number, ground?: Uint8ClampedArray): void {
    const pigment = rasterizeSoilTile(this.world, tx, ty);
    // An opening needs opaque ground, not transparency revealing the cliff below.
    const data = ground ?? pigment;
    if (ground && pigment)
      for (let i = 0; i < ground.length; i += 4) {
        const a = (pigment[i + 3] ?? 0) / 255;
        if (!ground[i + 3]) {
          ground.set(pigment.subarray(i, i + 4), i);
          continue;
        }
        for (let k = 0; k < 3; k++)
          ground[i + k] = Math.round((pigment[i + k] ?? 0) * a + (ground[i + k] ?? 0) * (1 - a));
      }
    if (data) this.pixels.push({ key: ty * this.world.meta.width + tx, data });
  }

  finish(): SoilChunkArt | null {
    const { pixels, chunkSize } = this;
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
}
