import type { Texture } from 'pixi.js';
import type { WorldData } from '../types/world';
import { Tile } from '../types/tiles';
import { elevationAt, stairsDirection } from '../world/ElevationTopology';
import { HILL_SURFACE } from '../world/HillCollisionGeometry';
import { BIOMES } from '../world/Biomes';
import { biomeGroundTint, raisedSurfaceTint, uplandVariantOffset } from './environmentArt';
import { getTileArt } from './terrainArt';
import { tileArtTexture } from './SpriteArt';
import type { TextureStore } from './TextureStore';

// Only small source frames are read, once per live texture. Weak keys follow asset unloading.
const pixels = new WeakMap<Texture, Uint8ClampedArray>();
let scratch: CanvasRenderingContext2D | undefined;
function sourcePixels(texture: Texture): Uint8ClampedArray {
  const cached = pixels.get(texture);
  if (cached) return cached;
  if (!scratch) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    scratch = canvas.getContext('2d', { willReadFrequently: true }) ?? undefined;
    if (!scratch) throw new Error('Cannot prepare stair ground');
    scratch.imageSmoothingEnabled = false;
  }
  const f = texture.frame;
  scratch.clearRect(0, 0, 32, 32);
  scratch.drawImage(
    texture.source.resource as CanvasImageSource,
    f.x,
    f.y,
    f.width,
    f.height,
    0,
    0,
    32,
    32,
  );
  const data = scratch.getImageData(0, 0, 32, 32).data;
  pixels.set(texture, data);
  return data;
}

export interface GroundPixels {
  readonly pixels: ArrayLike<number>;
  readonly tint: number;
}
/** Opaque floor only in the passable opening; the surrounding cliff remains intact. */
export function composeStairGround(
  mask: number,
  upper: GroundPixels,
  lower: GroundPixels,
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(32 * 32 * 4);
  const dir = stairsDirection(mask),
    vertical = dir === 'n' || dir === 's';
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const side = vertical ? x : y;
      if (side < HILL_SURFACE.stairCheek || side >= 32 - HILL_SURFACE.stairCheek) continue;
      const along = vertical ? y : x;
      const t = (dir === 's' || dir === 'e' ? along : 31 - along) / 31;
      const i = (y * 32 + x) * 4;
      for (let k = 0; k < 3; k++) {
        const shift = 16 - k * 8;
        const a = ((upper.pixels[i + k] ?? 0) * ((upper.tint >> shift) & 255)) / 255;
        const b = ((lower.pixels[i + k] ?? 0) * ((lower.tint >> shift) & 255)) / 255;
        result[i + k] = Math.round(a * (1 - t) + b * t);
      }
      result[i + 3] = 255;
    }
  return result;
}

/** Same ground art/material inputs as ordinary terrain, with no cliffs or decorations. */
export function stairGround(
  world: WorldData,
  tx: number,
  ty: number,
  mask: number,
  textures: TextureStore,
): Uint8ClampedArray {
  const dir = stairsDirection(mask);
  const [nx, ny] = ({ n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const)[dir];
  const gx = tx + (world.window?.originX ?? 0),
    gy = ty + (world.window?.originY ?? 0);
  const floor = (sx: number, sy: number): GroundPixels => {
    const level = elevationAt(world, sx, sy);
    const layer = getTileArt(level > 0 ? Tile.PLATEAU : Tile.GRASS, gx, gy, 255)[level > 0 ? 1 : 0];
    if (!layer) throw new Error('Missing ground layer');
    if (level > 0 && layer.source.type === 'rect') {
      const biome = BIOMES[world.environment?.biome[sy * world.meta.width + sx] ?? 0];
      if (!biome) throw new Error('Unknown stair ground biome');
      const rect = layer.source.rect;
      const texture = textures.getRect(
        `${biome.assets}_upland`,
        rect.x,
        rect.y + uplandVariantOffset(gx, gy),
        rect.w,
        rect.h,
      );
      return {
        pixels: sourcePixels(texture),
        tint: world.elevations ? raisedSurfaceTint(layer.tint, level) : layer.tint,
      };
    }
    const tint = biomeGroundTint(world, sx, sy);
    const combined = [16, 8, 0].reduce(
      (c, shift) =>
        c | (Math.round((((tint >> shift) & 255) * ((layer.tint >> shift) & 255)) / 255) << shift),
      0,
    );
    return { pixels: sourcePixels(tileArtTexture(layer, textures)), tint: combined };
  };
  return composeStairGround(mask, floor(tx - nx, ty - ny), floor(tx + nx, ty + ny));
}
