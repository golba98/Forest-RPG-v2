import type { EntityBase } from '../types/entities';
import { Tile, TILE_PROPERTIES, type TileId } from '../types/tiles';
import type { CollisionWorld } from './CollisionSystem';
import type { TileGrid } from '../world/TileMap';
import { groundPosition } from './EntityFootprint';
import { onBridgeDeck } from '../world/BridgeGeometry';

export interface SurfaceState {
  readonly kind: 'ground' | 'water' | 'deck';
  readonly speedMultiplier: number;
}
type SurfaceWorld = Pick<CollisionWorld, 'tiles' | 'meta' | 'bridges'> | TileGrid;

/** Sample only a resolved position. Deck support takes precedence over the underlying cells. */
export function surfaceAt(world: SurfaceWorld, x: number, y: number): SurfaceState {
  if (onBridgeDeck(world, x, y)) return { kind: 'deck', speedMultiplier: 1 };
  const tx = Math.floor(x),
    ty = Math.floor(y);
  const { width, height } = 'meta' in world ? world.meta : world;
  const tile =
    tx < 0 || ty < 0 || tx >= width || ty >= height
      ? Tile.BORDER
      : (world.tiles[ty * width + tx] as TileId);
  return {
    kind: tile === Tile.RIVER ? 'water' : 'ground',
    speedMultiplier: TILE_PROPERTIES[tile]?.speedMultiplier ?? 1,
  };
}

export function supportingSurface(
  world: SurfaceWorld,
  entity: Pick<EntityBase, 'kind' | 'halfSize' | 'x' | 'y'>,
): SurfaceState {
  const p = groundPosition(entity);
  return surfaceAt(world, p.x, p.y);
}
