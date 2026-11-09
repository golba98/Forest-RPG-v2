import { surfaceAt } from '../systems/SurfaceState';
import type { TileProperties } from '../types/tiles';
import { isTileId, Tile, TILE_PROPERTIES } from '../types/tiles';
import type { WorldData } from '../types/world';
import { onBridgeDeck, type BridgeWorld } from './BridgeGeometry';

/** Minimal row-major tile grid view (WorldData or an in-progress generation buffer). */
export interface TileGrid extends BridgeWorld {
  readonly width: number;
  readonly height: number;
  readonly tiles: Uint8Array;
}

/** Unknown IDs (corrupt data) behave like walls rather than holes in the world. */
const UNKNOWN_TILE: TileProperties = TILE_PROPERTIES[Tile.BORDER];

export function gridOf(world: WorldData): TileGrid {
  return {
    width: world.meta.width,
    height: world.meta.height,
    tiles: world.tiles,
    bridges: world.bridges ?? [],
  };
}

function inBounds(grid: TileGrid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height;
}

/** Tile at integer (x, y); out-of-bounds reads as BORDER. */
function getTile(grid: TileGrid, x: number, y: number): number {
  if (!inBounds(grid, x, y)) return Tile.BORDER;
  return grid.tiles[y * grid.width + x] ?? Tile.BORDER;
}

export function tileProperties(tile: number): TileProperties {
  return isTileId(tile) ? TILE_PROPERTIES[tile] : UNKNOWN_TILE;
}

/** Ground-enemy passability (rivers block mobs but not the player). */
export function isWalkableForMobs(grid: TileGrid, x: number, y: number): boolean {
  if (onBridgeDeck(grid, x + 0.5, y + 0.5)) return true;
  const props = tileProperties(getTile(grid, x, y));
  return !props.solid && !props.blocksMobs;
}

/** Speed factor for the tile under a continuous position (tile units). */
export function speedMultiplierAt(grid: TileGrid, x: number, y: number): number {
  return surfaceAt(grid, x, y).speedMultiplier;
}
