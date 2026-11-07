import { elevationAt } from '../world/ElevationTopology';
import { PERF_BUILD, profileBegin, profileEnd } from '../performance/FrameProfiler';
import { entityFootprint, resolveFootprint } from './EntityFootprint';
import { GAME_CONFIG as C } from '../config/GameConfig';
import type { PlayerEntity, PlayerIntent } from '../types/entities';
import { directionFromVector, DIRECTION_VECTORS } from '../core/math/Direction';
import type { WorldData } from '../types/world';
import { TILE_PROPERTIES, type TileId } from '../types/tiles';
import { canOccupy, moveWithCollision } from './CollisionSystem';
import { supportingSurface } from './SurfaceState';

const dashTimers = new WeakMap<PlayerEntity, { remaining: number; cooldown: number }>();
const landingPositions = new WeakMap<PlayerEntity, { x: number; y: number }>();
export interface MovementRuntime {
  readonly landing?: { readonly x: number; readonly y: number };
  readonly dash?: { readonly remaining: number; readonly cooldown: number };
}
export function movementRuntime(player: PlayerEntity): MovementRuntime {
  const landing = landingPositions.get(player),
    dash = dashTimers.get(player);
  return {
    ...(landing ? { landing: { ...landing } } : {}),
    ...(dash ? { dash: { ...dash } } : {}),
  };
}
export function restoreMovementRuntime(player: PlayerEntity, state: MovementRuntime): void {
  if (state.landing) landingPositions.set(player, { ...state.landing });
  if (state.dash) dashTimers.set(player, { ...state.dash });
}
export function rebaseMovementRuntime(player: PlayerEntity, dx: number, dy: number): void {
  const landing = landingPositions.get(player);
  if (landing) landingPositions.set(player, { x: landing.x + dx, y: landing.y + dy });
}

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

/** A jump may climb/drop one tier; safe landing recovery retains the existing timing. */
function validLandingLevel(world: WorldData, p: PlayerEntity, x: number, y: number): boolean {
  const from = landingPositions.get(p);
  const f = resolveFootprint(entityFootprint(p));
  return (
    !world.elevations ||
    !from ||
    Math.abs(
      elevationAt(world, x + f.offsetX, y + f.offsetY) -
        elevationAt(world, from.x + f.offsetX, from.y + f.offsetY),
    ) <= 1
  );
}

/**
 * A jump that ends on a cliff edge completes the climb (or drop): the player
 * lands on the first free spot ahead within LANDING_SEARCH_TILES, in the direction they
 * were travelling (or facing). Null when there is none.
 */
function finishCrossing(world: WorldData, p: PlayerEntity): { x: number; y: number } | null {
  let dx = p.vx,
    dy = p.vy;
  if (Math.hypot(dx, dy) < 1e-9) [dx, dy] = DIRECTION_VECTORS[p.facing];
  const len = Math.hypot(dx, dy) || 1;
  for (let d = 0.05; d <= LANDING_SEARCH_TILES + 1e-9; d += 0.05) {
    const x = p.x + (dx / len) * d,
      y = p.y + (dy / len) * d;
    if (validLandingLevel(world, p, x, y) && canOccupy(world, x, y, entityFootprint(p)))
      return { x, y };
  }
  return null;
}

/** How far past a cliff edge a nearly-complete jump may step to land. */
const LANDING_SEARCH_TILES = 0.7;

export function movePlayer(
  world: WorldData,
  p: PlayerEntity,
  intent: PlayerIntent,
  dt: number,
  sensitivity = 5,
): 'idle' | 'walk' | 'run' | 'jump' {
  const profileToken = PERF_BUILD ? profileBegin('movement.player', 1) : -1;
  try {
    if (intent.jump && !p.isJumping) {
      p.isJumping = true;
      p.jumpProgress = 0;
      landingPositions.set(p, { x: p.x, y: p.y });
    }
    if (p.isJumping) {
      p.jumpProgress = Math.min(1, p.jumpProgress + (dt * 1000) / C.player.jumpDurationMs);
      if (p.jumpProgress >= 1 - 1e-9) {
        if (
          !validLandingLevel(world, p, p.x, p.y) ||
          !canOccupy(world, p.x, p.y, entityFootprint(p))
        ) {
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
    const surface = supportingSurface(world, p);
    const groundSpeed =
      ((p.isDashing
        ? C.player.sprintSpeed * 1.45
        : p.isSprinting
          ? C.player.sprintSpeed
          : C.player.walkSpeed) *
        surface.speedMultiplier *
        (p.speedBuffMs > 0 ? 1.4 : 1)) /
      (1 - (sensitivity - 5) * 0.06);
    // A jump covers about two tiles: enough to clear a cliff edge, not to fly.
    const speed = p.isJumping
      ? Math.min(groundSpeed * C.player.jumpAirSpeedFactor, C.player.jumpMaxAirSpeed)
      : groundSpeed;
    p.vx = length ? (intent.moveX / length) * speed : 0;
    p.vy = length ? (intent.moveY / length) * speed : 0;
    p.facing = directionFromVector(intent.moveX, intent.moveY, p.facing);
    const anim = p.isJumping ? 'jump' : length ? (p.isSprinting ? 'run' : 'walk') : 'idle';
    moveWithCollision(world, p, p.vx * dt, p.vy * dt, p.isJumping ? 'jumping' : 'player');
    return anim;
  } finally {
    if (PERF_BUILD) profileEnd(profileToken);
  }
}
