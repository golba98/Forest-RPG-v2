/**
 * Terrain tile registry.
 *
 * Numeric IDs intentionally match the original game's `TILE_TYPES` so legacy
 * `mapStates` arrays can be migrated without a lookup table. Pickup/marker IDs
 * from the legacy grid (MOB 3, CHEST 100, HEALTH 101, POWERUP 102, COIN 103)
 * are NOT terrain in V2 — they become entities (see LegacyTileMarker).
 */
export const Tile = {
  GRASS: 1,
  FOREST: 2,
  CLIFF: 6,
  RAMP: 7,
  LOG: 8,
  FLOWERS: 9,
  CAVE: 10,
  RIVER: 11,
  BORDER: 12,
  HILL_N: 13,
  HILL_NE: 14,
  HILL_E: 15,
  HILL_SE: 16,
  HILL_S: 17,
  HILL_SW: 18,
  HILL_W: 19,
  HILL_NW: 20,
  PLATEAU: 21,
  MUD: 22,
} as const;

export type TileId = (typeof Tile)[keyof typeof Tile];

/** Legacy grid markers that V2 converts into entities rather than terrain. */
export const LegacyTileMarker = {
  MOB: 3,
  CHEST: 100,
  HEALTH: 101,
  POWERUP: 102,
  COIN: 103,
} as const;

export interface TileProperties {
  /** Blocks player movement. */
  readonly solid: boolean;
  /** Blocks ground enemies (rivers block mobs but only slow the player). */
  readonly blocksMobs: boolean;
  /** Multiplier applied to player movement speed while standing on the tile. */
  readonly speedMultiplier: number;
  /** Melee swings convert this tile to GRASS (with a loot roll). */
  readonly cuttable: boolean;
}

const OPEN: TileProperties = { solid: false, blocksMobs: false, speedMultiplier: 1, cuttable: false };
const WALL: TileProperties = { solid: true, blocksMobs: true, speedMultiplier: 1, cuttable: false };

export const TILE_PROPERTIES: Readonly<Record<TileId, TileProperties>> = {
  [Tile.GRASS]: OPEN,
  [Tile.FOREST]: WALL,
  [Tile.CLIFF]: WALL,
  [Tile.RAMP]: OPEN,
  [Tile.LOG]: OPEN,
  [Tile.FLOWERS]: { ...OPEN, cuttable: true },
  [Tile.CAVE]: WALL,
  // Legacy RIVER_SPEED_MULTIPLIER 1.5 lengthened step time; as a speed factor that is 1/1.5.
  [Tile.RIVER]: { solid: false, blocksMobs: true, speedMultiplier: 1 / 1.5, cuttable: false },
  [Tile.BORDER]: WALL,
  [Tile.HILL_N]: WALL,
  [Tile.HILL_NE]: WALL,
  [Tile.HILL_E]: WALL,
  [Tile.HILL_SE]: WALL,
  [Tile.HILL_S]: WALL,
  [Tile.HILL_SW]: WALL,
  [Tile.HILL_W]: WALL,
  [Tile.HILL_NW]: WALL,
  [Tile.PLATEAU]: WALL,
  [Tile.MUD]: { ...OPEN, speedMultiplier: 0.72 },
};

const TILE_IDS = new Set<number>(Object.values(Tile));

export function isTileId(value: number): value is TileId {
  return TILE_IDS.has(value);
}

export function isHillTile(id: TileId): boolean {
  return id >= Tile.HILL_N && id <= Tile.HILL_NW;
}
