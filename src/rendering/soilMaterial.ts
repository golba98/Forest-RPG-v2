import { Tile } from '../types/tiles';
import { channelTerrain } from '../world/RiverTopology';
import { hashTile } from '../world/TileHash';

export interface SoilWorld {
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
  const nx = worldX / 16,
    ny = worldY / 16,
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
  if (!receivesSoil(tileAt(world, tx, ty))) return null;
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
      const r = hashTile(wx, wy);
      const color = r % 11 === 0 ? 0x686039 : r % 3 ? 0x514829 : 0x595032;
      const i = (y * SOIL_TILE_SIZE + x) * 4;
      data[i] = color >> 16;
      data[i + 1] = (color >> 8) & 255;
      data[i + 2] = color & 255;
      data[i + 3] = alpha;
    }
  return visible ? data : null;
}
