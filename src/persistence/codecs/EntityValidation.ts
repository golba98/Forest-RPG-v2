import type { Entity } from '../../types/entities';
import { COORDINATE_LIMIT } from '../../world/infinite/coordinates';
import { finite, hasNumbers, integer, object, point } from './validation';

const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const animations = ['idle', 'walk', 'run', 'jump', 'attack', 'hurt', 'death'];
export function validEntity(v: unknown, w: number, h: number): v is Entity {
  if (
    !object(v) ||
    !point(v, w, h) ||
    !finite(v.halfSize) ||
    v.halfSize <= 0 ||
    v.halfSize > 2 ||
    typeof v.id !== 'string' ||
    !v.id ||
    !directions.includes(String(v.facing)) ||
    !animations.includes(String(v.anim)) ||
    typeof v.alive !== 'boolean' ||
    (v.kind === 'player' &&
      v.hauntedIntroComplete !== undefined &&
      typeof v.hauntedIntroComplete !== 'boolean') ||
    (v.encounterId !== undefined &&
      (typeof v.encounterId !== 'string' || v.encounterId.length > 160)) ||
    !hasNumbers(v, ['prevX', 'prevY', 'halfSize', 'animTimeMs'])
  )
    return false;
  if (v.kind === 'player') {
    if (
      !object(v.stats) ||
      !hasNumbers(v.stats, [
        'health',
        'maxHealth',
        'mana',
        'maxMana',
        'stamina',
        'maxStamina',
        'level',
        'xp',
        'xpToNextLevel',
        'statPoints',
        'baseDamage',
        'coins',
      ]) ||
      !object(v.inventory) ||
      !hasNumbers(v.inventory, ['healthPotions', 'speedPotions']) ||
      !hasNumbers(v, [
        'vx',
        'vy',
        'sprintLockoutMs',
        'jumpProgress',
        'hurtTimerMs',
        'comboCount',
        'speedBuffMs',
      ]) ||
      typeof v.isSprinting !== 'boolean' ||
      typeof v.isJumping !== 'boolean' ||
      typeof v.isDashing !== 'boolean'
    )
      return false;
    const s = v.stats,
      i = v.inventory;
    return (
      finite(s.maxHealth) &&
      s.maxHealth > 0 &&
      s.maxHealth <= 20 &&
      finite(s.health) &&
      s.health >= 0 &&
      s.health <= s.maxHealth &&
      finite(s.maxMana) &&
      s.maxMana > 0 &&
      s.maxMana <= 100000 &&
      finite(s.mana) &&
      s.mana >= 0 &&
      s.mana <= s.maxMana &&
      finite(s.maxStamina) &&
      s.maxStamina > 0 &&
      s.maxStamina <= 100000 &&
      finite(s.stamina) &&
      s.stamina >= 0 &&
      s.stamina <= s.maxStamina &&
      integer(s.level) &&
      s.level >= 1 &&
      s.level <= 1000 &&
      finite(s.xpToNextLevel) &&
      s.xpToNextLevel > 0 &&
      finite(s.xp) &&
      s.xp >= 0 &&
      s.xp < s.xpToNextLevel &&
      integer(s.statPoints) &&
      s.statPoints >= 0 &&
      s.statPoints <= 10000 &&
      finite(s.baseDamage) &&
      s.baseDamage > 0 &&
      s.baseDamage <= 100000 &&
      finite(s.coins) &&
      s.coins >= 0 &&
      finite(i.healthPotions) &&
      i.healthPotions >= 0 &&
      finite(i.speedPotions) &&
      i.speedPotions >= 0
    );
  }
  if (v.kind === 'enemy')
    return (
      ['mantis', 'maggot', 'beetle', 'ghost'].includes(String(v.enemyType)) &&
      [
        'idle',
        'patrol',
        'chase',
        'attack',
        'flee',
        'investigate',
        'return',
        'recover',
        'stunned',
        'dead',
      ].includes(String(v.aiState)) &&
      typeof v.aggressive === 'boolean' &&
      hasNumbers(v, ['health', 'maxHealth', 'hurtTimerMs', 'attackCooldownMs'])
    );
  if (v.kind === 'pickup')
    return (
      ['coin', 'health_potion', 'speed_potion', 'chest'].includes(String(v.pickupType)) &&
      (v.value === undefined || (integer(v.value) && v.value >= 1 && v.value <= 100)) &&
      (v.requiredForCompletion === undefined || typeof v.requiredForCompletion === 'boolean') &&
      (v.chest === undefined ||
        (v.pickupType === 'chest' &&
          object(v.chest) &&
          ['wooden', 'reinforced'].includes(String(v.chest.variant)) &&
          ['closed', 'opening', 'opened'].includes(String(v.chest.state)) &&
          finite(v.chest.elapsedMs) &&
          v.chest.elapsedMs >= 0 &&
          v.chest.elapsedMs <= 600 &&
          (v.chest.state !== 'closed' || v.chest.elapsedMs === 0) &&
          (v.chest.state !== 'opened' || v.chest.elapsedMs === 600)))
    );
  if (v.kind === 'portal')
    return (
      typeof v.active === 'boolean' &&
      (v.portalState === undefined ||
        ['locked', 'reacting', 'open', 'transitioning'].includes(String(v.portalState))) &&
      (v.roundComplete === undefined || typeof v.roundComplete === 'boolean') &&
      (v.entryEligible === undefined || typeof v.entryEligible === 'boolean')
    );
  if (v.kind === 'projectile')
    return (
      ['acid', 'magic_bolt'].includes(String(v.projectileType)) &&
      typeof v.ownerId === 'string' &&
      hasNumbers(v, ['vx', 'vy', 'damage', 'travelled', 'maxDistance'])
    );
  return false;
}

export function validGlobalEntity(value: unknown): boolean {
  if (
    !object(value) ||
    !finite(value.x) ||
    !finite(value.y) ||
    Math.abs(value.x) > COORDINATE_LIMIT - 1024 ||
    Math.abs(value.y) > COORDINATE_LIMIT - 1024
  )
    return false;
  if (typeof value.id !== 'string' || value.id.length > 160) return false;
  if (
    value.kind === 'enemy' &&
    (!finite(value.health) ||
      !finite(value.maxHealth) ||
      value.health < 0 ||
      value.maxHealth <= 0 ||
      value.health > value.maxHealth ||
      value.maxHealth > 1000000)
  )
    return false;
  return validEntity(
    { ...value, x: value.x + COORDINATE_LIMIT, y: value.y + COORDINATE_LIMIT },
    COORDINATE_LIMIT * 2 + 1,
    COORDINATE_LIMIT * 2 + 1,
  );
}
