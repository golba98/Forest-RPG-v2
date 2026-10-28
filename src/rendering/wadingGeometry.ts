import { CHARACTER_FOOT_OFFSET_PX } from '../types/physical';
import { PLAYER_FOOTPRINT } from '../systems/EntityFootprint';
import { Tile } from '../types/tiles';
import type { WorldData } from '../types/world';
import type { Bounds } from '../types/gameplay';
import { bridgeAtTile, bridgeGeometry, subtractDeck } from '../world/BridgeGeometry';

const TILE = 32;
const IMMERSION_PX = 12;

/** The sprite sinks into the water; the water stays at the supporting ground plane. */
export function wadingPose(
  anchorX: number,
  anchorY: number,
): { x: number; spriteY: number; waterlineY: number } {
  const waterlineY = anchorY + PLAYER_FOOTPRINT.offsetY * TILE;
  return { x: anchorX, spriteY: waterlineY - CHARACTER_FOOT_OFFSET_PX + IMMERSION_PX, waterlineY };
}

/** Ripple/splash pixels belong to water, never a bank face or a supported bridge deck. */
export function nearbyWaterBounds(world: WorldData, x: number, y: number): Bounds[] {
  const areas: Bounds[] = [];
  for (
    let ty = Math.max(0, Math.floor(y / TILE) - 2);
    ty <= Math.min(world.meta.height - 1, Math.floor(y / TILE) + 2);
    ty++
  )
    for (
      let tx = Math.max(0, Math.floor(x / TILE) - 2);
      tx <= Math.min(world.meta.width - 1, Math.floor(x / TILE) + 2);
      tx++
    ) {
      if (world.tiles[ty * world.meta.width + tx] !== Tile.RIVER) continue;
      const tile = { minX: tx, minY: ty, maxX: tx + 1, maxY: ty + 1 };
      const bridge = bridgeAtTile(world, tx, ty);
      areas.push(...(bridge ? subtractDeck(tile, bridgeGeometry(bridge).deck) : [tile]));
    }
  return areas;
}
