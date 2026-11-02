import type { WorldData } from '../../types/world';
import type { Entity } from '../../types/entities';
import type { SimulationRuntime } from '../../types/encounters';
import { Tile } from '../../types/tiles';
import { floodFill } from '../pathfinding';
import { canOccupy } from '../../systems/CollisionSystem';
import { PLAYER_FOOTPRINT } from '../../systems/EntityFootprint';
import type { LegacyRegion } from './types';
/** Alter only artificial BORDER cells that have an already reachable, physically clear approach. */
export function preserveLegacyRegion(
  world: WorldData,
  entities: readonly Entity[],
  runtime: SimulationRuntime,
  elapsedMs = 0,
  legacyExtras?: Record<string, unknown>,
): LegacyRegion {
  const { width: w, height: h } = world.meta;
  const reached = floodFill(
    world.meta,
    { x: Math.floor(world.spawn.x), y: Math.floor(world.spawn.y) },
    (x, y) => canOccupy(world, x + 0.5, y + 0.5, PLAYER_FOOTPRINT),
  );
  const exits: { x: number; y: number }[] = [];
  for (const side of ['n', 'e', 's', 'w']) {
    const candidates: { x: number; y: number }[] = [];
    for (let i = 2; i < (side === 'n' || side === 's' ? w : h) - 2; i++) {
      const x = side === 'w' ? 0 : side === 'e' ? w - 1 : i,
        y = side === 'n' ? 0 : side === 's' ? h - 1 : i;
      const ix = side === 'w' ? 1 : side === 'e' ? w - 2 : x,
        iy = side === 'n' ? 1 : side === 's' ? h - 2 : y;
      if (
        world.tiles[y * w + x] === Tile.BORDER &&
        reached[iy * w + ix] &&
        canOccupy(world, ix + 0.5, iy + 0.5, PLAYER_FOOTPRINT)
      )
        candidates.push({ x, y });
    }
    candidates.sort(
      (a, b) =>
        Math.hypot(a.x - world.spawn.x, a.y - world.spawn.y) -
          Math.hypot(b.x - world.spawn.x, b.y - world.spawn.y) ||
        a.y - b.y ||
        a.x - b.x,
    );
    const exit = candidates[0];
    if (exit) exits.push(exit);
  }
  return {
    world,
    entities: structuredClone(entities),
    runtime: structuredClone(runtime),
    elapsedMs,
    ...(legacyExtras ? { legacyExtras } : {}),
    exits,
    travelLink: exits.length === 0,
  };
}
