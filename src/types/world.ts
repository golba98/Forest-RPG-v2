import type { EnemyType, PickupType } from './entities';

/** Bump whenever generator output for a given seed changes. Stored in saves. */
export const WORLD_GENERATOR_VERSION = 1;

export type Difficulty = 'easy' | 'normal' | 'hard';

/** Integer tile coordinate. */
export interface TilePoint {
  readonly x: number;
  readonly y: number;
}

export interface WorldMeta {
  readonly seed: number;
  readonly generatorVersion: number;
  readonly width: number;
  readonly height: number;
  readonly isTutorial: boolean;
  /** 1-based world/level number (tutorial is level 0). */
  readonly level: number;
  readonly difficulty: Difficulty;
}

export type PropKind =
  | 'bush_small'
  | 'bush_obstacle'
  | 'flower_clump'
  | 'flower_pink'
  | 'flower_yellow'
  | 'log_horizontal'
  | 'log_vertical'
  | 'log_stump'
  | 'rock_boulder'
  | 'rock_pebble'
  | 'hole';

/** Static decorative object placed on a tile (trees are FOREST tiles, not props). */
export interface WorldProp {
  readonly id: number;
  readonly kind: PropKind;
  readonly tileX: number;
  readonly tileY: number;
  readonly solid: boolean;
}

export interface EnemySpawn {
  readonly type: EnemyType;
  readonly x: number;
  readonly y: number;
  /** Tutorial dummy beetle spawns passive. Defaults to true. */
  readonly aggressive?: boolean;
  /** Overrides the level-scaled default HP (tutorial dummy = 5). */
  readonly maxHealth?: number;
}

export interface PickupSpawn {
  readonly type: PickupType;
  readonly x: number;
  readonly y: number;
}

/**
 * Immutable output of world generation (or of a loaded save).
 * Pure data — no PixiJS types. `tiles` is row-major: index = y * width + x.
 * Systems that mutate terrain (flower cutting) write into `tiles` and emit
 * `world:tileChanged` so renderers can rebuild only the affected chunk.
 */
export interface WorldData {
  readonly meta: WorldMeta;
  readonly tiles: Uint8Array;
  readonly props: readonly WorldProp[];
  readonly spawn: TilePoint;
  readonly portal: TilePoint;
  readonly enemySpawns: readonly EnemySpawn[];
  /** Coins and any pre-placed pickups. */
  readonly pickupSpawns: readonly PickupSpawn[];
}

export interface WorldGenOptions {
  readonly seed: number;
  readonly level: number;
  readonly difficulty: Difficulty;
  /** Defaults to GAME_CONFIG.world.width/height (150x150). */
  readonly width?: number;
  readonly height?: number;
}
