import type { EnemyType, PickupType } from './entities';
import type { EncounterSite } from './encounters';

/** Bump whenever generator output for a given seed changes. Stored in saves. */
export const WORLD_GENERATOR_VERSION = 10;

export type Difficulty = 'easy' | 'normal' | 'hard';

/** Continuous world position in tile units; distinguish actor anchors from foot contact at call sites. */
export interface WorldPosition {
  readonly x: number;
  readonly y: number;
}

/** Integer tile coordinate. */
export interface TilePoint {
  readonly x: number;
  readonly y: number;
}

export interface WorldMeta {
  readonly seed: number;
  readonly generatorVersion: number;
  readonly hilltopObjectsVersion?: 1;
  readonly riverRepairVersion?: number;
  readonly riverRepairSkipped?: readonly TilePoint[];
  readonly width: number;
  readonly height: number;
  readonly isTutorial: boolean;
  /** 1-based world/level number (tutorial is level 0). */
  readonly level: number;
  readonly difficulty: Difficulty;
}

/** Origin is the north/west bank end; span counts water tiles, excluding both bank ends. */
export interface WorldBridge {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly orientation: 'horizontal' | 'vertical';
  readonly span: number;
  readonly variant: number;
}

export type PropKind =
  | 'tree'
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

/** Static world object anchored to a tile; semantics define physical footprints. */
export interface WorldProp {
  readonly id: number;
  readonly kind: PropKind;
  readonly tileX: number;
  readonly tileY: number;
  readonly solid: boolean;
  /** Promoted legacy hill decoration: stable source identity, on the raised surface.
   * Sprite transform, footprint and contact anchor derive from this source hash. */
  readonly hilltop?: { readonly sourceX: number; readonly sourceY: number };
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
  readonly encounterSites?: readonly EncounterSite[];
  readonly meta: WorldMeta;
  readonly tiles: Uint8Array;
  readonly props: readonly WorldProp[];
  /** Older saves and legacy maps have no bridge overlay. */
  readonly bridges?: readonly WorldBridge[];
  readonly spawn: TilePoint;
  readonly portal: TilePoint;
  readonly enemySpawns: readonly EnemySpawn[];
  /** Coins and any pre-placed pickups. */
  readonly pickupSpawns: readonly PickupSpawn[];
}

export interface WorldGenOptions {
  /** Defaults to v10. Historical algorithms are load-only, never silently substituted. */
  readonly generatorVersion?: number;
  readonly seed: number;
  readonly level: number;
  readonly difficulty: Difficulty;
  /** Defaults to GAME_CONFIG.world.width/height (150x150). */
  readonly width?: number;
  readonly height?: number;
}
