import { Tile, isHillTile, TILE_PROPERTIES, type TileId } from '../types/tiles';
import type { TerrainInfo } from '../types/gameplay';
import type { WorldData } from '../types/world';

export function isHillTerrain(id: number): boolean {
  return isHillTile(id as TileId) || id === Tile.PLATEAU || id === Tile.CLIFF || id === Tile.STAIRS;
}
const NEIGHBORS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
] as const;
/** Derives topology from final cells, never from an image or stale generation mask. */
export function describeTerrain(
  world: Pick<WorldData, 'tiles'> & { readonly meta: Pick<WorldData['meta'], 'width' | 'height'> },
  x: number,
  y: number,
): TerrainInfo {
  const { width, height } = world.meta;
  const at = (tx: number, ty: number): number =>
    tx < 0 || ty < 0 || tx >= width || ty >= height
      ? Tile.BORDER
      : (world.tiles[ty * width + tx] ?? Tile.BORDER);
  const tileId = at(x, y) as TileId,
    hill = isHillTerrain(tileId);
  let hillNeighbors = 0,
    exposedEdges = 0,
    convexCorners = 0,
    concaveCorners = 0;
  NEIGHBORS.forEach(([dx, dy], i) => {
    if (isHillTerrain(at(x + dx, y + dy))) hillNeighbors |= 1 << i;
  });
  const n = (i: number) => (hillNeighbors & (1 << (i % 8))) !== 0;
  if (hill) {
    for (let i = 0; i < 4; i++) {
      if (!n(i * 2)) exposedEdges |= 1 << i;
      const a = n(i * 2),
        b = n((i * 2 + 2) % 8);
      if (!a && !b) convexCorners |= 1 << i;
      if (a && b && !n(i * 2 + 1)) concaveCorners |= 1 << i;
    }
  }
  const crossing = tileId === Tile.RAMP || tileId === Tile.LOG || tileId === Tile.STAIRS;
  return {
    tileId,
    category: hill
      ? 'hill'
      : crossing
        ? 'crossing'
        : tileId === Tile.RIVER
          ? 'water'
          : TILE_PROPERTIES[tileId]?.solid
            ? 'solid'
            : 'ground',
    elevation: hill ? 1 : 0,
    walkable: !(TILE_PROPERTIES[tileId]?.solid ?? true),
    hillNeighbors,
    exposedEdges,
    convexCorners,
    concaveCorners,
    crossing,
  };
}
