import { entityFootprint, resolveFootprint } from './EntityFootprint';
import { GAME_CONFIG as C } from '../config/GameConfig';
import type { Direction, PlayerEntity, PlayerIntent } from '../types/entities';
import type { WorldData } from '../types/world';
import { TILE_PROPERTIES, type TileId } from '../types/tiles';
import { canOccupy, moveWithCollision } from './CollisionSystem';

const dashTimers = new WeakMap<PlayerEntity, { remaining: number; cooldown: number }>();
const landingPositions = new WeakMap<PlayerEntity, { x: number; y: number }>();

/** True when the player's box overlaps a jumpable cliff edge. */
function overJumpableEdge(world: WorldData, p: PlayerEntity): boolean {
  const { width, height } = world.meta;
  const f = resolveFootprint(entityFootprint(p));
  for (
    let y = Math.floor(p.y + f.offsetY - f.halfHeight);
    y <= Math.floor(p.y + f.offsetY + f.halfHeight);
    y++
  )
    for (
      let x = Math.floor(p.x + f.offsetX - f.halfWidth);
      x <= Math.floor(p.x + f.offsetX + f.halfWidth);
      x++
    ) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (TILE_PROPERTIES[world.tiles[y * width + x] as TileId]?.jumpable) return true;
    }
  return false;
}

/**
 * A jump that ends on a cliff edge completes the climb (or drop): the player
 * lands on the first free spot ahead within LANDING_SEARCH_TILES, in the direction they
 * were travelling (or facing). Null when there is none.
 */
function finishCrossing(world: WorldData, p: PlayerEntity): { x: number; y: number } | null {
  let dx = p.vx,
    dy = p.vy;
  if (Math.hypot(dx, dy) < 1e-9) [dx, dy] = FACING_VECTORS[p.facing];
  const len = Math.hypot(dx, dy) || 1;
  for (let d = 0.05; d <= LANDING_SEARCH_TILES + 1e-9; d += 0.05) {
    const x = p.x + (dx / len) * d,
      y = p.y + (dy / len) * d;
    if (canOccupy(world, x, y, entityFootprint(p))) return { x, y };
  }
  return null;
}

/** How far past a cliff edge a nearly-complete jump may step to land. */
const LANDING_SEARCH_TILES = 0.7;

const FACING_VECTORS: Readonly<Record<Direction, readonly [number, number]>> = {
  N: [0, -1],
  NE: [1, -1],
  E: [1, 0],
  SE: [1, 1],
  S: [0, 1],
  SW: [-1, 1],
  W: [-1, 0],
  NW: [-1, -1],
};

export function movePlayer(
  world: WorldData,
  p: PlayerEntity,
  intent: PlayerIntent,
  dt: number,
  sensitivity = 5,
): void {
  if (intent.jump && !p.isJumping) {
    p.isJumping = true;
    p.jumpProgress = 0;
    landingPositions.set(p, { x: p.x, y: p.y });
  }
  if (p.isJumping) {
    p.jumpProgress = Math.min(1, p.jumpProgress + (dt * 1000) / C.player.jumpDurationMs);
    if (p.jumpProgress >= 1 - 1e-9) {
      if (!canOccupy(world, p.x, p.y, entityFootprint(p))) {
        const across = overJumpableEdge(world, p) ? finishCrossing(world, p) : null;
        const safe = across ?? landingPositions.get(p);
        if (safe) {
          p.x = safe.x;
          p.y = safe.y;
        }
      }
      p.isJumping = false;
      p.jumpProgress = 0;
    }
  }
  p.prevX = p.x;
  p.prevY = p.y;
  p.sprintLockoutMs = Math.max(0, p.sprintLockoutMs - dt * 1000);
  const length = Math.hypot(intent.moveX, intent.moveY);
  const dash = dashTimers.get(p) ?? { remaining: 0, cooldown: 0 };
  dash.cooldown = Math.max(0, dash.cooldown - dt * 1000);
  dash.remaining = Math.max(0, dash.remaining - dt * 1000);
  if (
    (intent.dash || intent.sprint) &&
    length > 0 &&
    dash.cooldown === 0 &&
    !p.isJumping &&
    p.sprintLockoutMs === 0 &&
    p.stats.stamina > 0
  ) {
    dash.remaining = C.player.dashDurationMs;
    dash.cooldown = C.player.dashCooldownMs;
  }
  p.isDashing = dash.remaining > 0;
  dashTimers.set(p, dash);
  p.isSprinting = intent.sprint && length > 0 && p.sprintLockoutMs === 0 && p.stats.stamina > 0;
  if (p.isSprinting) {
    p.stats.stamina = Math.max(0, p.stats.stamina - C.player.sprintDrainPerSec * dt);
    if (p.stats.stamina === 0) p.sprintLockoutMs = C.player.sprintLockoutMs;
  } else
    p.stats.stamina = Math.min(
      p.stats.maxStamina,
      p.stats.stamina + C.player.staminaRegenPerSec * dt,
    );
  const terrain = world.tiles[Math.floor(p.y) * world.meta.width + Math.floor(p.x)] as TileId;
  const groundSpeed =
    ((p.isDashing
      ? C.player.sprintSpeed * 1.45
      : p.isSprinting
        ? C.player.sprintSpeed
        : C.player.walkSpeed) *
      (TILE_PROPERTIES[terrain]?.speedMultiplier ?? 1) *
      (p.speedBuffMs > 0 ? 1.4 : 1)) /
    (1 - (sensitivity - 5) * 0.06);
  // A jump covers about two tiles: enough to clear a cliff edge, not to fly.
  const speed = p.isJumping
    ? Math.min(groundSpeed * C.player.jumpAirSpeedFactor, C.player.jumpMaxAirSpeed)
    : groundSpeed;
  p.vx = length ? (intent.moveX / length) * speed : 0;
  p.vy = length ? (intent.moveY / length) * speed : 0;
  if (length)
    p.facing =
      `${intent.moveY < 0 ? 'N' : intent.moveY > 0 ? 'S' : ''}${intent.moveX < 0 ? 'W' : intent.moveX > 0 ? 'E' : ''}` as Direction;
  const anim = p.isJumping ? 'jump' : length ? (p.isSprinting ? 'run' : 'walk') : 'idle';
  p.animTimeMs = p.anim === anim ? p.animTimeMs + dt * 1000 : 0;
  p.anim = anim;
  moveWithCollision(world, p, p.vx * dt, p.vy * dt, p.isJumping ? 'jumping' : 'player');
}
