import type { Entity, PickupEntity, PlayerEntity } from '../types/entities';
import type { WorldData } from '../types/world';
import { hasClearPath, registerChestColliders } from './CollisionSystem';
import { groundPosition } from './EntityFootprint';
import { isRaisedSurface } from '../world/HillCollisionGeometry';

export const LOOT_RULES = { pickupRadius: 0.7, chestRadius: 1.25, openingMs: 600 } as const;
export const chestReward = (variant: 'wooden' | 'reinforced'): number =>
  variant === 'reinforced' ? 10 : 5;
export function prepareLoot(world: WorldData, entities: readonly Entity[]): void {
  const chests = entities.filter(
    (e): e is PickupEntity => e.kind === 'pickup' && e.pickupType === 'chest' && e.alive,
  );
  for (const c of chests) c.chest ??= { variant: 'wooden', state: 'closed', elapsedMs: 0 };
  registerChestColliders(world, chests);
}
export function canReachLoot(world: WorldData, p: PlayerEntity, e: PickupEntity): boolean {
  const ground = groundPosition(p);
  const raised = (x: number, y: number) =>
    isRaisedSurface(world.tiles[Math.floor(y) * world.meta.width + Math.floor(x)] ?? 0);
  return (
    !p.isJumping &&
    raised(ground.x, ground.y) === raised(e.x, e.y) &&
    hasClearPath(world, ground.x, ground.y, e.x, e.y, 0.01, 'player', { ignoreChestId: e.id })
  );
}
/** State and rewards are committed together before notifying observers that may save. */
export function collectLoot(
  world: WorldData,
  p: PlayerEntity,
  entities: readonly Entity[],
  dt: number,
  interact: boolean,
  feedback: () => void,
): void {
  if (p.stats.health <= 0) return;
  let target: PickupEntity | undefined;
  let distance = LOOT_RULES.chestRadius as number;
  for (const e of entities) {
    if (e.kind !== 'pickup' || !e.alive) continue;
    if (e.pickupType === 'chest') {
      const chest = e.chest;
      if (!chest) continue;
      if (chest.state === 'opening') {
        chest.elapsedMs = Math.min(LOOT_RULES.openingMs, chest.elapsedMs + dt * 1000);
        if (chest.elapsedMs === LOOT_RULES.openingMs) {
          chest.state = 'opened';
          p.stats.coins += chestReward(chest.variant);
          feedback();
        }
      } else if (interact && chest.state === 'closed') {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < distance && canReachLoot(world, p, e)) {
          target = e;
          distance = d;
        }
      }
      continue;
    }
    if (Math.hypot(e.x - p.x, e.y - p.y) >= LOOT_RULES.pickupRadius || !canReachLoot(world, p, e))
      continue;
    e.alive = false;
    if (e.pickupType === 'coin') {
      p.stats.coins += e.value ?? 1;
      feedback();
    } else if (e.pickupType === 'health_potion') p.inventory.healthPotions++;
    else if (e.pickupType === 'speed_potion') p.inventory.speedPotions++;
  }
  if (target?.chest) {
    target.chest.state = 'opening';
    target.chest.elapsedMs = 0;
  }
}
