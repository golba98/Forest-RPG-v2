import { entityFootprint } from './EntityFootprint';
import type { EntityBase } from '../types/entities';
import type { TraversalProfile } from '../types/gameplay';
import type { WorldData } from '../types/world';
import { floodFill } from '../world/pathfinding';
import { canOccupy } from './CollisionSystem';

/** Deterministic nearest valid cell in the spawn component; used only on load/spawn. */
export function restoreSafePosition(
  world: WorldData,
  e: EntityBase,
  profile: TraversalProfile = 'player',
): void {
  if (canOccupy(world, e.x, e.y, entityFootprint(e), profile)) return;
  const passable = (x: number, y: number) =>
    canOccupy(world, x + 0.5, y + 0.5, entityFootprint(e), profile);
  let origin = world.spawn;
  if (!passable(origin.x, origin.y)) {
    let closest = Infinity;
    for (let y = 0; y < world.meta.height; y++)
      for (let x = 0; x < world.meta.width; x++)
        if (passable(x, y)) {
          const distance = (x - world.spawn.x) ** 2 + (y - world.spawn.y) ** 2;
          if (distance < closest) {
            closest = distance;
            origin = { x, y };
          }
        }
  }
  const reached = floodFill(world.meta, origin, passable);
  let best = Infinity,
    bestX = 0,
    bestY = 0;
  for (let y = 0; y < world.meta.height; y++)
    for (let x = 0; x < world.meta.width; x++)
      if (reached[y * world.meta.width + x]) {
        const distance = (e.x - x - 0.5) ** 2 + (e.y - y - 0.5) ** 2;
        if (distance < best) {
          best = distance;
          bestX = x + 0.5;
          bestY = y + 0.5;
        }
      }
  if (!Number.isFinite(best)) throw new Error(`No safe position for ${e.id}`);
  e.x = e.prevX = bestX;
  e.y = e.prevY = bestY;
}
