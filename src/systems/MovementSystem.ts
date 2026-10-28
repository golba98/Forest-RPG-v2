import { GAME_CONFIG as C } from '../config/GameConfig';
import type { Direction, PlayerEntity, PlayerIntent } from '../types/entities';
import type { WorldData } from '../types/world';
import { TILE_PROPERTIES, isHillTile, Tile, type TileId } from '../types/tiles';
import { canOccupy, moveWithCollision } from './CollisionSystem';

const dashTimers = new WeakMap<PlayerEntity, { remaining: number; cooldown: number }>();
const landingPositions = new WeakMap<PlayerEntity, { x: number; y: number }>();

export function movePlayer(world: WorldData, p: PlayerEntity, intent: PlayerIntent, dt: number, sensitivity = 5): void {
  if (intent.jump && !p.isJumping) { p.isJumping = true; p.jumpProgress = 0; landingPositions.set(p, { x: p.x, y: p.y }); }
  if (p.isJumping) {
    p.jumpProgress = Math.min(1, p.jumpProgress + dt * 1000 / C.player.jumpDurationMs);
    if (p.jumpProgress >= 1 - 1e-9) {
      if (!canOccupy(world, p.x, p.y, p.halfSize, true)) { const safe = landingPositions.get(p); if (safe) { p.x = safe.x; p.y = safe.y; } }
      p.isJumping = false; p.jumpProgress = 0;
    }
  }
  p.prevX = p.x; p.prevY = p.y;
  p.sprintLockoutMs = Math.max(0, p.sprintLockoutMs - dt * 1000);
  const length = Math.hypot(intent.moveX, intent.moveY);
  const dash = dashTimers.get(p) ?? { remaining: 0, cooldown: 0 };
  dash.cooldown = Math.max(0, dash.cooldown - dt * 1000); dash.remaining = Math.max(0, dash.remaining - dt * 1000);
  if ((intent.dash || intent.sprint) && length > 0 && dash.cooldown === 0 && !p.isJumping && p.sprintLockoutMs === 0 && p.stats.stamina > 0) { dash.remaining = C.player.dashDurationMs; dash.cooldown = C.player.dashCooldownMs; }
  p.isDashing = dash.remaining > 0; dashTimers.set(p, dash);
  p.isSprinting = intent.sprint && length > 0 && p.sprintLockoutMs === 0 && p.stats.stamina > 0;
  if (p.isSprinting) {
    p.stats.stamina = Math.max(0, p.stats.stamina - C.player.sprintDrainPerSec * dt);
    if (p.stats.stamina === 0) p.sprintLockoutMs = C.player.sprintLockoutMs;
  } else p.stats.stamina = Math.min(p.stats.maxStamina, p.stats.stamina + C.player.staminaRegenPerSec * dt);
  const terrain = world.tiles[Math.floor(p.y) * world.meta.width + Math.floor(p.x)] as TileId;
  const speed = (p.isDashing ? C.player.sprintSpeed * 1.45 : p.isSprinting ? C.player.sprintSpeed : C.player.walkSpeed) * (TILE_PROPERTIES[terrain]?.speedMultiplier ?? 1) * (p.speedBuffMs > 0 ? 1.4 : 1) / (1 - (sensitivity - 5) * 0.06);
  p.vx = length ? intent.moveX / length * speed : 0;
  p.vy = length ? intent.moveY / length * speed : 0;
  if (length) p.facing = `${intent.moveY < 0 ? 'N' : intent.moveY > 0 ? 'S' : ''}${intent.moveX < 0 ? 'W' : intent.moveX > 0 ? 'E' : ''}` as Direction;
  const anim = p.isJumping ? 'jump' : length ? p.isSprinting ? 'run' : 'walk' : 'idle';
  p.animTimeMs = p.anim === anim ? p.animTimeMs + dt * 1000 : 0;
  p.anim = anim;
  let onHill = false;
  for (let y = Math.floor(p.y - p.halfSize); y <= Math.floor(p.y + p.halfSize); y++) for (let x = Math.floor(p.x - p.halfSize); x <= Math.floor(p.x + p.halfSize); x++) {
    const tile = world.tiles[y * world.meta.width + x] as TileId;
    if (isHillTile(tile) || tile === Tile.CLIFF || tile === Tile.PLATEAU) onHill = true;
  }
  moveWithCollision(world, p, p.vx * dt, p.vy * dt, p.isJumping || onHill, p.isJumping);
}
