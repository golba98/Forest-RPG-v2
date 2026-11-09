import { CHARACTER_FOOT_OFFSET_PX } from '../types/physical';
import { DIRECTIONS, playerSheetAlias, type PlayerSheetAnim } from './PlayerSheets';
import fluid from './playerFluidMetadata.json';
/**
 * Data-only animation metadata for every sprite set, keyed by
 * `RenderEntityView.spriteKey`. Frame specs and timings are taken from the
 * legacy game (src/game/game-movement.js, game-enemies.js, runtime/renderer.js)
 * and verified against the PNG dimensions in public/assets/images.
 *
 * Units: `scale` is world pixels per source pixel at the 32 px logical tile
 * (GameConfig tileSize); `footOffsetPx` is in world pixels at that tile size.
 */
import type { AnimState, Direction } from '../types/entities';

export type CardinalDirection = 'N' | 'E' | 'S' | 'W';

/** Order of the four direction rows on an enemy/projectile sheet, top to bottom. */
export type RowOrder = readonly [
  CardinalDirection,
  CardinalDirection,
  CardinalDirection,
  CardinalDirection,
];

/** A texture laid out as a uniform grid. `sheetWidth / columns` may be fractional. */
export interface SheetLayout {
  /** Texture alias exactly as registered in asset_manifest.json. */
  readonly alias: string;
  readonly sheetWidth: number;
  readonly sheetHeight: number;
  readonly columns: number;
  readonly rows: number;
}

/** One texture per facing direction (player). */
export interface DirectionalSheet {
  readonly alias: string;
  readonly sheetWidth: number;
  readonly sheetHeight: number;
  /** Mirror horizontally when drawing (for directions that reuse another sheet). */
  readonly flipX?: boolean;
}

export type ClipSource =
  /** Grid with one row per cardinal direction (enemies, acid blob). */
  | { readonly kind: 'directionalRows'; readonly sheet: SheetLayout; readonly rowOrder: RowOrder }
  /** Single-row strip per facing direction (player). Columns = clip frameCount. */
  | {
      readonly kind: 'perDirectionSheets';
      readonly sheets: Readonly<Record<Direction, DirectionalSheet>>;
    }
  /** Single row, direction-independent (coin, portal, static items). */
  | { readonly kind: 'single'; readonly sheet: SheetLayout };

export interface ClipDef {
  readonly source: ClipSource;
  readonly frameCount: number;
  readonly frameDurationMs: number;
  /** Optional pose dwell times; their sum is the unchanged clip duration. */
  readonly frameDurationsMs?: readonly number[];
  readonly loop: boolean;
  /** Optional per-clip override of the sprite set's native rendering scale. */
  readonly scale?: number;
  /** Actual ground distance per locomotion cycle, in world pixels. */
  readonly stridePx?: number;
}

export type AnchorDef =
  /** Source foot (default: bottom-centre) sits `footOffsetPx` below the entity point. */
  | {
      readonly kind: 'feet';
      readonly footOffsetPx: number;
      readonly sourceFoot?: { readonly x: number; readonly y: number };
    }
  | { readonly kind: 'center' };

export interface SpriteSetDef {
  readonly scale: number;
  readonly anchor: AnchorDef;
  /** Presentation variants selected from the simulation-owned combo step. */
  readonly attackClips?: Readonly<Partial<Record<2 | 3, ClipDef>>>;
  readonly clips: Readonly<Partial<Record<AnimState, ClipDef>>>;
  /** Clips used instead of `clips` when the view's `active` flag is true (portal). */
  readonly activeClips?: Readonly<Partial<Record<AnimState, ClipDef>>>;
}

/** Fallback order for states a sprite set has no art for. */
export const ANIM_FALLBACKS: Readonly<Record<AnimState, readonly AnimState[]>> = {
  idle: [],
  walk: ['idle'],
  run: ['walk', 'idle'],
  jump: ['idle'],
  attack: ['idle'],
  hurt: ['idle'],
  death: ['hurt', 'idle'],
};

/**
 * `hurt`/`death` without dedicated art hold the first frame of their fallback
 * clip for this long (one-shot), so combat/death code still gets a finite
 * duration. 250 ms = legacy PLAYER_ATTACK_HURT_MS.
 */
export const SYNTHETIC_HOLD_MS: Readonly<Partial<Record<AnimState, number>>> = {
  hurt: 250,
  death: 500,
};

function playerSheets(
  anim: PlayerSheetAnim,
  sheetWidth: number,
): Readonly<Record<Direction, DirectionalSheet>> {
  const out = {} as Record<Direction, DirectionalSheet>;
  for (const dir of DIRECTIONS) {
    out[dir] = { alias: playerSheetAlias(anim, dir), sheetWidth, sheetHeight: 64 };
  }
  return out;
}

function grid(
  alias: string,
  sheetWidth: number,
  sheetHeight: number,
  columns: number,
  rows: number,
): SheetLayout {
  return { alias, sheetWidth, sheetHeight, columns, rows };
}

function staticItem(alias: string, scale: number): SpriteSetDef {
  return {
    scale,
    anchor: { kind: 'center' },
    clips: {
      idle: {
        source: { kind: 'single', sheet: grid(alias, 32, 32, 1, 1) },
        frameCount: 1,
        frameDurationMs: 1000,
        loop: true,
      },
    },
  };
}

/** All remastered player frames have integer bounds and independently drawn directions.
 * The old diagonal filename swaps and SW run mirror belong to the replaced art,
 * not combat direction. The simulation's locked attack facing is unchanged. */
function playerClip(
  anim: Parameters<typeof playerSheetAlias>[0],
  count: number,
  _ms: number,
  loop: boolean,
  stridePx?: number,
): ClipDef {
  return {
    source: { kind: 'perDirectionSheets', sheets: playerSheets(anim, count * 64) },
    frameCount: count,
    frameDurationMs: fluid.durations[anim].reduce((a, b) => a + b, 0) / count,
    loop,
    frameDurationsMs: fluid.durations[anim],
    ...(stridePx === undefined ? {} : { stridePx }),
  };
}

/** Legacy getDirectionSpriteRow_SEWN. */
const ROWS_SEWN: RowOrder = ['S', 'E', 'W', 'N'];
/** Legacy getDirectionSpriteRow_NSEW (despite the name, rows are S, W, E, N). */
const ROWS_SWEN: RowOrder = ['S', 'W', 'E', 'N'];
/** Legacy getDirectionSpriteRow_Ghost. */
const ROWS_SNEW: RowOrder = ['S', 'N', 'E', 'W'];

function enemyClip(
  sheet: SheetLayout,
  rowOrder: RowOrder,
  frameCount: number,
  frameDurationMs: number,
  loop: boolean,
): ClipDef {
  return {
    source: { kind: 'directionalRows', sheet, rowOrder },
    frameCount,
    frameDurationMs,
    loop,
  };
}

const MANTIS_MOVE = grid('enemy_mantis_move', 128, 128, 4, 4);
const MANTIS_ATTACK = grid('enemy_mantis_attack', 224, 128, 7, 4);
const MAGGOT_WALK = grid('enemy_maggot_walk', 128, 128, 4, 4);
const MAGGOT_SPIT = grid('enemy_maggot_spit', 224, 128, 7, 4);
const BEETLE_MOVE = grid('enemy_beetle_move', 128, 128, 4, 4);
const BEETLE_ATTACK = grid('enemy_beetle_attack', 192, 128, 6, 4);
const GHOST_MOVE = grid('enemy_ghost_move', 234, 256, 3, 4);
const GHOST_ATTACK = grid('enemy_ghost_attack', 234, 256, 3, 4);
const ACID_BLOB = grid('projectile_acid_blob', 224, 128, 7, 4);
const COIN_ANIM = grid('item_coin_anim', 128, 32, 4, 1);
const PORTAL_INACTIVE = grid('portal_inactive', 1536, 256, 6, 1);
const PORTAL_ACTIVE = grid('portal_active', 1536, 256, 6, 1);

function portalClips(sheet: SheetLayout): Readonly<Partial<Record<AnimState, ClipDef>>> {
  return {
    idle: { source: { kind: 'single', sheet }, frameCount: 6, frameDurationMs: 150, loop: true },
  };
}

const PLAYER: SpriteSetDef = {
  scale: 1,
  anchor: { kind: 'feet', footOffsetPx: CHARACTER_FOOT_OFFSET_PX, sourceFoot: { x: 32, y: 54 } },
  clips: {
    idle: playerClip('idle', fluid.counts.idle, 200, true),
    walk: playerClip('walk', fluid.counts.walk, 320 / 12, true, 64),
    run: playerClip('run', fluid.counts.run, 8000 / 34 / 12, true, 64),
    jump: playerClip('jump', fluid.counts.jump, 500 / 12, false),
    // Impact pose starts at 120 ms, matching the unchanged combat strike.
    attack: playerClip('attack', fluid.counts.attack, 30, false),
  },
  attackClips: {
    2: playerClip('attack2', fluid.counts.attack2, 30, false),
    3: playerClip('attack3', fluid.counts.attack3, 30, false),
  },
};

export const ANIMATION_DEFS: Readonly<Record<string, SpriteSetDef>> = {
  player: PLAYER,

  // Mantis: MANTIS_ANIM_MS 200, attack 7 × 100 ms. drawH = 1.2 tiles.
  mantis: {
    scale: 1.2,
    anchor: { kind: 'feet', footOffsetPx: CHARACTER_FOOT_OFFSET_PX },
    clips: {
      // Idle breathes on two frames at a slow cadence so it never reads as walking.
      idle: enemyClip(MANTIS_MOVE, ROWS_SEWN, 2, 450, true),
      walk: enemyClip(MANTIS_MOVE, ROWS_SEWN, 4, 200, true),
      attack: enemyClip(MANTIS_ATTACK, ROWS_SEWN, 7, 100, false),
    },
  },

  // Maggot: MAGGOT_ANIM_MS 250, spit 7 × 120 ms. drawH = 1.0 tile.
  maggot: {
    scale: 1,
    anchor: { kind: 'feet', footOffsetPx: CHARACTER_FOOT_OFFSET_PX },
    clips: {
      idle: enemyClip(MAGGOT_WALK, ROWS_SWEN, 2, 500, true),
      walk: enemyClip(MAGGOT_WALK, ROWS_SWEN, 4, 250, true),
      attack: enemyClip(MAGGOT_SPIT, ROWS_SWEN, 7, 120, false),
    },
  },

  // Beetle boss: BEETLE_MOVE_ANIM_MS 150 (frame 0 when standing), attack 6 × 100 ms. 80 px draw size.
  beetle: {
    scale: 80 / 32,
    anchor: { kind: 'feet', footOffsetPx: CHARACTER_FOOT_OFFSET_PX },
    clips: {
      idle: enemyClip(BEETLE_MOVE, ROWS_SWEN, 1, 1000, true),
      walk: enemyClip(BEETLE_MOVE, ROWS_SWEN, 4, 150, true),
      attack: enemyClip(BEETLE_ATTACK, ROWS_SWEN, 6, 100, false),
    },
  },

  // Ghost: GHOST_ANIM_MS 120 (3 cols), attack 3 × 140 ms. 78×64 frames drawn 1.3 tiles tall.
  ghost: {
    scale: (32 * 1.3) / 64,
    anchor: { kind: 'feet', footOffsetPx: CHARACTER_FOOT_OFFSET_PX },
    clips: {
      idle: enemyClip(GHOST_MOVE, ROWS_SNEW, 3, 120, true),
      walk: enemyClip(GHOST_MOVE, ROWS_SNEW, 3, 120, true),
      attack: enemyClip(GHOST_ATTACK, ROWS_SNEW, 3, 140, false),
    },
  },

  // Acid blob projectile: ACID_BLOB_ANIM_MS 80, 7 frames, rows S,W,E,N, drawn 0.8 tiles.
  acid: {
    scale: 0.8,
    anchor: { kind: 'center' },
    clips: { idle: enemyClip(ACID_BLOB, ROWS_SWEN, 7, 80, true) },
  },

  // Coin: 4 frames @ 150 ms, drawn 0.8 tiles.
  coin: {
    scale: 0.8,
    anchor: { kind: 'center' },
    clips: {
      idle: {
        source: { kind: 'single', sheet: COIN_ANIM },
        frameCount: 4,
        frameDurationMs: 150,
        loop: true,
      },
    },
  },

  // Portal: 6 frames @ 150 ms, 256 px frames drawn 2 tiles tall, bottom on the tile's bottom edge.
  portal: {
    scale: (32 * 2) / 256,
    anchor: { kind: 'feet', footOffsetPx: 16 },
    clips: portalClips(PORTAL_INACTIVE),
    activeClips: portalClips(PORTAL_ACTIVE),
  },

  health_potion: staticItem('item_potion_health', 0.75),
  speed_potion: staticItem('item_potion_speed', 0.75),
  chest: staticItem('item_chest', 1),
};

/**
 * Sprite keys with no texture art. The legacy magic bolt is a procedural
 * circle (game-input.js: fill(100,200,255), stroke 255 @ 1.5, 10 px diameter).
 * `resolveSpriteFrame` returns a placeholder ref for these.
 */
export interface ProceduralSpriteDef {
  readonly shape: 'circle';
  readonly radiusPx: number;
  readonly color: number;
  readonly outlineColor: number;
  readonly outlineWidthPx: number;
}

export const PROCEDURAL_SPRITES: Readonly<Record<string, ProceduralSpriteDef>> = {
  magic_bolt: {
    shape: 'circle',
    radiusPx: 5,
    color: 0x64c8ff,
    outlineColor: 0xffffff,
    outlineWidthPx: 1.5,
  },
};

/** Every texture alias referenced by ANIMATION_DEFS (for manifest validation). */
export function listReferencedAliases(): string[] {
  const aliases = new Set<string>();
  const addClips = (clips: Readonly<Partial<Record<AnimState, ClipDef>>> | undefined) => {
    if (!clips) return;
    for (const clip of Object.values(clips)) {
      if (!clip) continue;
      const src = clip.source;
      if (src.kind === 'perDirectionSheets') {
        for (const sheet of Object.values(src.sheets)) aliases.add(sheet.alias);
      } else {
        aliases.add(src.sheet.alias);
      }
    }
  };
  for (const def of Object.values(ANIMATION_DEFS)) {
    addClips(def.clips);
    addClips(def.activeClips);
    for (const clip of Object.values(def.attackClips ?? {})) addClips({ attack: clip });
  }
  return [...aliases].sort();
}
