import type { PortalState } from './gameplay';
import type { Direction } from '../core/events/types';

export type { Direction };

export type EnemyType = 'mantis' | 'maggot' | 'beetle' | 'ghost';
export type PickupType = 'coin' | 'health_potion' | 'speed_potion' | 'chest';
export type ProjectileType = 'acid' | 'magic_bolt';
export type EntityKind = 'player' | 'enemy' | 'projectile' | 'pickup' | 'portal';

/** Simulation-level animation intent; the animation layer maps it to sprite frames. */
export type AnimState = 'idle' | 'walk' | 'run' | 'jump' | 'attack' | 'hurt' | 'death';

export type EnemyAIState =
  | 'idle'
  | 'patrol'
  | 'chase'
  | 'attack'
  | 'flee'
  | 'investigate'
  | 'return'
  | 'recover'
  | 'stunned'
  | 'dead';

/**
 * Common entity fields. Positions are in TILE units (floats); (x, y) is the
 * entity's foot/centre point. `prevX/prevY` hold the previous fixed-step
 * position for render interpolation.
 */
export interface EntityBase {
  readonly id: string;
  readonly kind: EntityKind;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** Collision half-extent in tiles (square AABB around x, y). */
  halfSize: number;
  facing: Direction;
  anim: AnimState;
  /** Simulation time (ms) spent in the current `anim`; drives frame selection. */
  animTimeMs: number;
  alive: boolean;
}

export interface PlayerStats {
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  stamina: number;
  maxStamina: number;
  level: number;
  xp: number;
  xpToNextLevel: number;
  statPoints: number;
  baseDamage: number;
  coins: number;
}

export interface PlayerInventory {
  healthPotions: number;
  speedPotions: number;
}

export interface PlayerEntity extends EntityBase {
  /** First haunted encounter completed or escaped, carried across levels. */
  hauntedIntroComplete?: boolean;
  readonly kind: 'player';
  vx: number;
  vy: number;
  stats: PlayerStats;
  inventory: PlayerInventory;
  isSprinting: boolean;
  /** Remaining sprint lockout after stamina hits 0 (ms). */
  sprintLockoutMs: number;
  isJumping: boolean;
  /** 0..1 progress through the jump arc (0 when grounded). */
  jumpProgress: number;
  isDashing: boolean;
  /** Remaining invulnerability after taking damage (ms). */
  hurtTimerMs: number;
  /** Number of completed hits in the current chain (0, 1 or 2); resets after the finisher. */
  comboCount: number;
  speedBuffMs: number;
}

export interface EnemyEntity extends EntityBase {
  encounterId?: string;
  /** Derived by EncounterDirector; never trusted when restoring a save. */
  combatReady?: boolean;
  encounterHome?: { x: number; y: number };
  returningToNest?: boolean;
  despawnMs?: number;
  readonly kind: 'enemy';
  readonly enemyType: EnemyType;
  health: number;
  maxHealth: number;
  aiState: EnemyAIState;
  attackPhase?: 'none' | 'windup' | 'strike' | 'recover';
  moving?: boolean;
  aggressive: boolean;
  hurtTimerMs: number;
  attackCooldownMs: number;
}

export interface ProjectileEntity extends EntityBase {
  readonly kind: 'projectile';
  readonly projectileType: ProjectileType;
  readonly ownerId: string;
  vx: number;
  vy: number;
  damage: number;
  travelled: number;
  maxDistance: number;
}

export interface PickupEntity extends EntityBase {
  readonly kind: 'pickup';
  readonly pickupType: PickupType;
}

export interface PortalEntity extends EntityBase {
  readonly kind: 'portal';
  active: boolean;
  portalState?: PortalState;
  roundComplete?: boolean;
  entryEligible?: boolean;
}

export type Entity = PlayerEntity | EnemyEntity | ProjectileEntity | PickupEntity | PortalEntity;

/**
 * Per-step player intent, produced from InputManager by the game layer.
 * Keeps the simulation independent of DOM input.
 * `moveX/moveY` are raw axis values in [-1, 1] (not yet normalised).
 * Edge-triggered actions (attack, skills, potions, jump, dash) are true only
 * on the step the key was pressed.
 */
export interface PlayerIntent {
  interact?: boolean;
  moveX: number;
  moveY: number;
  sprint: boolean;
  attack: boolean;
  skillQ: boolean;
  skillE: boolean;
  jump: boolean;
  dash: boolean;
  potionHealth: boolean;
  potionSpeed: boolean;
}

export const IDLE_INTENT: Readonly<PlayerIntent> = Object.freeze({
  interact: false,
  moveX: 0,
  moveY: 0,
  sprint: false,
  attack: false,
  skillQ: false,
  skillE: false,
  jump: false,
  dash: false,
  potionHealth: false,
  potionSpeed: false,
});
