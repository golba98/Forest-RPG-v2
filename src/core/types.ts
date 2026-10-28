import type { Vector2 } from './math/Vector2';
import type { IInterpolatable } from './loop/types';

// Re-export subsystem type contracts
export * from './loop/types';
export * from './events/types';
export * from './di/types';
export * from './input/types';
export * from './spatial/types';

/**
 * Shared interface for entities presented by the rendering engine.
 */
export interface IRenderableEntity extends IInterpolatable {
  id: string;
  width: number;
  height: number;
  spriteKey: string;
  animationState: string;
  zIndex: number;
  visible: boolean;
}

/**
 * Target tracked by the 2D smooth camera.
 */
export interface ICameraTarget {
  x: number;
  y: number;
}

/**
 * Contract for authoritative simulation systems driven by GameLoop fixed updates.
 */
export interface ISimulationSystem {
  update(fixedDeltaSec: number): void;
}

/**
 * Forward-compatible placeholder types for world and combat systems.
 */
export interface IWorldData {
  seed: number;
  width: number;
  height: number;
  isTutorial: boolean;
  spawnPoint: Vector2;
  portalPosition: Vector2;
}

export interface IEntity {
  id: string;
  x: number;
  y: number;
  health?: number;
  maxHealth?: number;
  isEnemy?: boolean;
  isDead?: boolean;
}

export interface AttackResult {
  hitCount: number;
  totalDamage: number;
  critical: boolean;
}

export interface SkillResult {
  success: boolean;
  manaUsed: number;
}

export interface DamageResult {
  appliedDamage: number;
  killed: boolean;
}
