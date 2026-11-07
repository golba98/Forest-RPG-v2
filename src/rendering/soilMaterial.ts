import { Tile } from '../types/tiles';
import { channelTerrain } from '../world/RiverTopology';
import { hashTile } from '../world/TileHash';
import { elevationMask, isRaisedSurface, NB, stairsDirection } from '../world/ElevationTopology';
import { HILL_SURFACE } from '../world/HillCollisionGeometry';

export interface SoilWorld {
  readonly elevations?: Uint8Array;
  readonly environment?: import('../world/Biomes').WorldEnvironment;
  readonly window?: {
    readonly originX: number;
    readonly originY: number;
    readonly descriptor?: { readonly generatorVersion: number };
  };
  readonly tiles: ArrayLike<number>;
  readonly meta: { readonly width: number; readonly height: number };
}
export const SOIL_TILE_SIZE = 32;
const MAX_OPACITY = 0.94;

function tileAt(world: SoilWorld, x: number, y: number): number {
  return x < 0 || y < 0 || x >= world.meta.width || y >= world.meta.height
    ? Tile.BORDER
    : (world.tiles[y * world.meta.width + x] ?? Tile.BORDER);
}

function receivesSoil(tile: number): boolean {
  return tile === Tile.MUD || tile === Tile.GRASS || tile === Tile.FLOWERS || tile === Tile.FOREST;
}
const smooth = (v: number): number => v * v * (3 - 2 * v);

/** Continuous material weights at cell centres, independent of tile/chunk origins. */
export function soilCoverage(world: SoilWorld, worldX: number, worldY: number): number {
  const gx = worldX / SOIL_TILE_SIZE - 0.5,
    gy = worldY / SOIL_TILE_SIZE - 0.5;
  const x0 = Math.floor(gx),
    y0 = Math.floor(gy),
    fx = gx - x0,
    fy = gy - y0;
  let soil = 0,
    land = 0;
  for (let dy = 0; dy <= 1; dy++)
    for (let dx = 0; dx <= 1; dx++) {
      const tile = tileAt(world, x0 + dx, y0 + dy);
      const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
      // Water continues a damp bank to its shoreline, but cannot create soil by itself.
      if (channelTerrain(tile)) continue;
      land += weight;
      if (tile === Tile.MUD) soil += weight;
    }
  const coverage = land > 0 ? soil / land : 0;
  // Continuous world-space grain bends the fringe without holes in solid soil.
  const nx = (worldX + (world.window?.originX ?? 0) * SOIL_TILE_SIZE) / 16,
    ny = (worldY + (world.window?.originY ?? 0) * SOIL_TILE_SIZE) / 16,
    ix = Math.floor(nx),
    iy = Math.floor(ny);
  const sx = smooth(nx - ix),
    sy = smooth(ny - iy);
  const value = (x: number, y: number) => (hashTile(x, y) & 255) / 255;
  const top = value(ix, iy) * (1 - sx) + value(ix + 1, iy) * sx;
  const bottom = value(ix, iy + 1) * (1 - sx) + value(ix + 1, iy + 1) * sx;
  const grain = (top * (1 - sy) + bottom * sy - 0.5) * coverage * (1 - coverage);
  return smooth(coverage + grain);
}

/** Soil pigment over the existing grass base; never changes terrain or collision. */
export function rasterizeSoilTile(
  world: SoilWorld,
  tx: number,
  ty: number,
): Uint8ClampedArray | null {
  const env = world.environment;
  const tile = tileAt(world, tx, ty);
  const upper =
    (world.window?.descriptor?.generatorVersion ?? 0) >= 15 &&
    (world.elevations?.[ty * world.meta.width + tx] ?? Number(isRaisedSurface(tile))) > 0;
  const stair = tile === Tile.STAIRS && (world.window?.descriptor?.generatorVersion ?? 0) >= 15;
  const stairMask = stair
    ? elevationMask(world.tiles, world.meta.width, world.meta.height, tx, ty, world.elevations)
    : 0;
  const stairDir = stairsDirection(stairMask);
  const vertical = stairDir === 'n' || stairDir === 's';
  if (
    world.window &&
    env &&
    (env.biome[ty * world.meta.width + tx] === 2 ||
      (env.secondary[ty * world.meta.width + tx] === 2 &&
        (env.blend[ty * world.meta.width + tx] ?? 0) > 0)) &&
    (receivesSoil(tile) || tile === Tile.PLATEAU || upper)
  ) {
    // Rock exposures follow relief, with world-addressed grain. They are ground
    // material, not extra invisible colliders or a second elevation model.
    const data = new Uint8ClampedArray(SOIL_TILE_SIZE * SOIL_TILE_SIZE * 4);
    const mask = upper
      ? elevationMask(world.tiles, world.meta.width, world.meta.height, tx, ty, world.elevations)
      : 255;
    const { northRim, sideRim, southFaceTop } = HILL_SURFACE;
    const sample = (x: number, y: number) => {
      const i =
        Math.max(0, Math.min(world.meta.height - 1, y)) * world.meta.width +
        Math.max(0, Math.min(world.meta.width - 1, x));
      const blend = (env.blend[i] ?? 0) / 255;
      const weight = env.biome[i] === 2 ? 1 - blend : env.secondary[i] === 2 ? blend : 0;
      return Math.max(0, Math.min(0.92, ((env.relief[i] ?? 0) / 255 - 0.48) * 2.8)) * weight;
    };
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        // Ground material follows the upper surface right up to its rock rim;
        // it must never paint over the cliff face, concave corners or shadows.
        if (
          upper &&
          !(
            stair &&
            (vertical ? x : y) >= HILL_SURFACE.stairCheek &&
            (vertical ? x : y) < 32 - HILL_SURFACE.stairCheek
          ) &&
          ((!(mask & NB.N) && y < northRim) ||
            (!(mask & NB.S) && y >= southFaceTop) ||
            (!(mask & NB.W) && x < sideRim) ||
            (!(mask & NB.E) && x >= 32 - sideRim) ||
            (mask & NB.N && mask & NB.W && !(mask & NB.NW) && x < sideRim && y < northRim) ||
            (mask & NB.N && mask & NB.E && !(mask & NB.NE) && x >= 32 - sideRim && y < northRim) ||
            (mask & NB.S && mask & NB.W && !(mask & NB.SW) && x < sideRim && y >= southFaceTop) ||
            (mask & NB.S &&
              mask & NB.E &&
              !(mask & NB.SE) &&
              x >= 32 - sideRim &&
              y >= southFaceTop))
        )
          continue;
        const wx = (tx + (world.window.originX ?? 0)) * 32 + x,
          wy = (ty + (world.window.originY ?? 0)) * 32 + y;
        const gx = tx + x / 32 - 0.5,
          gy = ty + y / 32 - 0.5,
          ix = Math.floor(gx),
          iy = Math.floor(gy),
          fx = gx - ix,
          fy = gy - iy;
        const coverage =
          (sample(ix, iy) * (1 - fx) + sample(ix + 1, iy) * fx) * (1 - fy) +
          (sample(ix, iy + 1) * (1 - fx) + sample(ix + 1, iy + 1) * fx) * fy;
        const h = hashTile(wx, wy),
          coarse = hashTile(Math.floor(wx / 5), Math.floor(wy / 4));
        const alpha = Math.round(coverage * 255);
        const shade = (h % 19 === 0 ? -17 : h % 13 === 0 ? 12 : 0) + ((coarse % 9) - 4);
        const i = (y * 32 + x) * 4;
        const level = world.elevations?.[ty * world.meta.width + tx] ?? 0;
        const along = vertical ? y : x;
        const progress = (stairDir === 's' || stairDir === 'e' ? along : 31 - along) / 31;
        const heightLight = (stair && world.elevations ? Math.max(0, level - progress) : level) * 9;
        data[i] = 119 + shade + heightLight;
        data[i + 1] = 122 + shade + heightLight;
        data[i + 2] = 108 + shade + heightLight;
        data[i + 3] = alpha;
      }
    return data;
  }
  if (!receivesSoil(tile) && !stair) return null;
  let nearby = false;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (tileAt(world, tx + dx, ty + dy) === Tile.MUD) nearby = true;
  if (!nearby) return null;
  const data = new Uint8ClampedArray(SOIL_TILE_SIZE * SOIL_TILE_SIZE * 4);
  let visible = false;
  for (let y = 0; y < SOIL_TILE_SIZE; y++)
    for (let x = 0; x < SOIL_TILE_SIZE; x++) {
      const wx = tx * SOIL_TILE_SIZE + x,
        wy = ty * SOIL_TILE_SIZE + y;
      const alpha = Math.round(255 * MAX_OPACITY * soilCoverage(world, wx + 0.5, wy + 0.5));
      if (!alpha) continue;
      visible = true;
      const r = hashTile(
        wx + (world.window?.originX ?? 0) * SOIL_TILE_SIZE,
        wy + (world.window?.originY ?? 0) * SOIL_TILE_SIZE,
      );
      const color = r % 11 === 0 ? 0x686039 : r % 3 ? 0x514829 : 0x595032;
      const i = (y * SOIL_TILE_SIZE + x) * 4;
      data[i] = color >> 16;
      data[i + 1] = (color >> 8) & 255;
      data[i + 2] = color & 255;
      data[i + 3] = alpha;
    }
  return visible ? data : null;
}
