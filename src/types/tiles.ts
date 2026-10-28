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
  /** Stone steps cut into a hill edge: walkable link between ground and hill top. */
  STAIRS: 23,
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
  /** Solid to walking, but a jump carries the player over it (hill cliff edges). */
  readonly jumpable: boolean;
}

const OPEN: TileProperties = { solid: false, blocksMobs: false, speedMultiplier: 1, cuttable: false, jumpable: false };
const WALL: TileProperties = { solid: true, blocksMobs: true, speedMultiplier: 1, cuttable: false, jumpable: false };
/** Hill edges: walls when walking; jump up onto a hill or drop off it. */
const CLIFF_EDGE: TileProperties = { ...WALL, jumpable: true };

export const TILE_PROPERTIES: Readonly<Record<TileId, TileProperties>> = {
  [Tile.GRASS]: OPEN,
  [Tile.FOREST]: WALL,
  [Tile.CLIFF]: WALL,
  [Tile.RAMP]: OPEN,
  [Tile.LOG]: OPEN,
  [Tile.FLOWERS]: { ...OPEN, cuttable: true },
  [Tile.CAVE]: WALL,
  // Legacy RIVER_SPEED_MULTIPLIER 1.5 lengthened step time; as a speed factor that is 1/1.5.
  [Tile.RIVER]: { solid: false, blocksMobs: true, speedMultiplier: 1 / 1.5, cuttable: false, jumpable: false },
  [Tile.BORDER]: WALL,
  [Tile.HILL_N]: CLIFF_EDGE,
  [Tile.HILL_NE]: CLIFF_EDGE,
  [Tile.HILL_E]: CLIFF_EDGE,
  [Tile.HILL_SE]: CLIFF_EDGE,
  [Tile.HILL_S]: CLIFF_EDGE,
  [Tile.HILL_SW]: CLIFF_EDGE,
  [Tile.HILL_W]: CLIFF_EDGE,
  [Tile.HILL_NW]: CLIFF_EDGE,
  // Hill tops are walkable ground, reached by STAIRS or by jumping a cliff edge.
  [Tile.PLATEAU]: OPEN,
  [Tile.MUD]: { ...OPEN, speedMultiplier: 0.72 },
  [Tile.STAIRS]: OPEN,
};

const TILE_IDS = new Set<number>(Object.values(Tile));

export function isTileId(value: number): value is TileId {
  return TILE_IDS.has(value);
}

export function isHillTile(id: TileId): boolean {
  return id >= Tile.HILL_N && id <= Tile.HILL_NW;
}
