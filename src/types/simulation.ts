import type { Entity, EnemyType, PlayerEntity, PlayerIntent } from './entities';
import type { RenderSnapshot } from './render';
import type { WorldData } from './world';

/**
 * Headless game simulation boundary. Implemented in src/simulation; driven by
 * GameLoop.onFixedUpdate in src/game. Never imports PixiJS or the DOM.
 */
export interface ISimulation {
  readonly world: WorldData;
  readonly player: PlayerEntity;
  /** Increments every time `loadWorld` replaces the world. */
  readonly worldVersion: number;
  /** Total simulated time since the world was loaded (ms). */
  readonly elapsedMs: number;

  /** Replaces the world and (re)spawns the player and all entities from it. */
  loadWorld(world: WorldData): void;
  /** Advances one fixed step. */
  step(dtSec: number, intent: PlayerIntent): void;
  claimPortalTransition(): boolean;
  getGameplayDebug?(): import('./gameplay').GameplayDebug;
  getEntities(): readonly Entity[];
  /** Builds the read-only view consumed by the renderer. */
  buildRenderSnapshot(): RenderSnapshot;

  // Diagnostics / debug hooks (used by __GAME__ and the terminal)
  setPlayerPosition(x: number, y: number): void;
  spawnEnemy(type: EnemyType, x: number, y: number): string;
  /** 0..1, 0 = midnight. */
  setTimeOfDay(ratio: number): void;
  getTimeOfDay(): number;
}
