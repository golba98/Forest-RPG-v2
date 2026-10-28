import { GAME_CONFIG as C } from '../config/GameConfig';
import type { Direction, PlayerEntity, PlayerIntent } from '../types/entities';
import type { WorldData } from '../types/world';
import { TILE_PROPERTIES, type TileId } from '../types/tiles';
import { moveWithCollision } from './CollisionSystem';

export function movePlayer(world: WorldData, p: PlayerEntity, intent: PlayerIntent, dt: number): void {
  p.prevX = p.x; p.prevY = p.y;
  p.sprintLockoutMs = Math.max(0, p.sprintLockoutMs - dt * 1000);
  const length = Math.hypot(intent.moveX, intent.moveY);
  p.isSprinting = intent.sprint && length > 0 && p.sprintLockoutMs === 0 && p.stats.stamina > 0;
  if (p.isSprinting) {
    p.stats.stamina = Math.max(0, p.stats.stamina - C.player.sprintDrainPerSec * dt);
    if (p.stats.stamina === 0) p.sprintLockoutMs = C.player.sprintLockoutMs;
  } else p.stats.stamina = Math.min(p.stats.maxStamina, p.stats.stamina + C.player.staminaRegenPerSec * dt);
  const terrain = world.tiles[Math.floor(p.y) * world.meta.width + Math.floor(p.x)] as TileId;
  const speed = (p.isSprinting ? C.player.sprintSpeed : C.player.walkSpeed) * (TILE_PROPERTIES[terrain]?.speedMultiplier ?? 1);
  p.vx = length ? intent.moveX / length * speed : 0;
  p.vy = length ? intent.moveY / length * speed : 0;
  if (length) p.facing = `${intent.moveY < 0 ? 'N' : intent.moveY > 0 ? 'S' : ''}${intent.moveX < 0 ? 'W' : intent.moveX > 0 ? 'E' : ''}` as Direction;
  const anim = length ? p.isSprinting ? 'run' : 'walk' : 'idle';
  p.animTimeMs = p.anim === anim ? p.animTimeMs + dt * 1000 : 0;
  p.anim = anim;
  moveWithCollision(world, p, p.vx * dt, p.vy * dt);
}
