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
export type RowOrder = readonly [CardinalDirection, CardinalDirection, CardinalDirection, CardinalDirection];

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
  | { readonly kind: 'perDirectionSheets'; readonly sheets: Readonly<Record<Direction, DirectionalSheet>> }
  /** Single row, direction-independent (coin, portal, static items). */
  | { readonly kind: 'single'; readonly sheet: SheetLayout };

export interface ClipDef {
  readonly source: ClipSource;
  readonly frameCount: number;
  readonly frameDurationMs: number;
  readonly loop: boolean;
  /** Overrides the sprite set's scale for this clip (player attack art is hi-res). */
  readonly scale?: number;
}

export type AnchorDef =
  /** Sprite bottom-centre sits `footOffsetPx` below the entity point. */
  | { readonly kind: 'feet'; readonly footOffsetPx: number }
  | { readonly kind: 'center' };

export interface SpriteSetDef {
  readonly scale: number;
  readonly anchor: AnchorDef;
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

/** Characters' feet sit roughly at the bottom edge of their collision box (halfSize 0.3 tile). */
const CHARACTER_FOOT_OFFSET_PX = 10;

const DIRECTIONS: readonly Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const DIRECTION_FILE_SUFFIX: Readonly<Record<Direction, string>> = {
  N: 'n',
  NE: 'ne',
  E: 'e',
  SE: 'se',
  S: 's',
  SW: 'sw',
  W: 'w',
  NW: 'nw',
};

/** Player sheet aliases follow the manifest's `hill_ne` style: `player_<anim>_<dir>`. */
export function playerSheetAlias(anim: 'idle' | 'walk' | 'run' | 'jump' | 'attack', dir: Direction): string {
  return `player_${anim}_${DIRECTION_FILE_SUFFIX[dir]}`;
}

type HeightTable = Readonly<Record<Direction, number>>;

function playerSheets(
  anim: 'idle' | 'walk' | 'run' | 'jump' | 'attack',
  sheetWidth: number,
  heights: HeightTable,
): Readonly<Record<Direction, DirectionalSheet>> {
  const out = {} as Record<Direction, DirectionalSheet>;
  for (const dir of DIRECTIONS) {
    out[dir] = { alias: playerSheetAlias(anim, dir), sheetWidth, sheetHeight: heights[dir] };
  }
  return out;
}

function grid(alias: string, sheetWidth: number, sheetHeight: number, columns: number, rows: number): SheetLayout {
  return { alias, sheetWidth, sheetHeight, columns, rows };
}

function staticItem(alias: string, scale: number): SpriteSetDef {
  return {
    scale,
    anchor: { kind: 'center' },
    clips: {
      idle: { source: { kind: 'single', sheet: grid(alias, 32, 32, 1, 1) }, frameCount: 1, frameDurationMs: 1000, loop: true },
    },
  };
}

// Measured per-direction sheet heights (px). Widths are uniform per animation.
const IDLE_H: HeightTable = { N: 18, NE: 20, E: 19, SE: 20, S: 23, SW: 20, W: 19, NW: 20 };
const WALK_H: HeightTable = { N: 19, NE: 19, E: 20, SE: 21, S: 22, SW: 21, W: 20, NW: 19 };
const RUN_H: HeightTable = { N: 20, NE: 18, E: 22, SE: 20, S: 21, SW: 20, W: 22, NW: 18 };
const JUMP_H: HeightTable = { N: 20, NE: 20, E: 21, SE: 20, S: 21, SW: 20, W: 21, NW: 20 };
const ATTACK_H: HeightTable = { N: 92, NE: 96, E: 97, SE: 113, S: 121, SW: 113, W: 97, NW: 96 };

/** Legacy SPRITE_SCALE = cellSize * 1.25 / SPRITE_REFERENCE_HEIGHT(20) → 2 at a 32 px tile. */
const PLAYER_SCALE = 2;
/** Legacy ATTACK_SCALE = SPRITE_SCALE * ATTACK_SCALE_FACTOR(0.17). */
const PLAYER_ATTACK_SCALE = PLAYER_SCALE * 0.17;

/** Legacy getDirectionSpriteRow_SEWN. */
const ROWS_SEWN: RowOrder = ['S', 'E', 'W', 'N'];
/** Legacy getDirectionSpriteRow_NSEW (despite the name, rows are S, W, E, N). */
const ROWS_SWEN: RowOrder = ['S', 'W', 'E', 'N'];
/** Legacy getDirectionSpriteRow_Ghost. */
const ROWS_SNEW: RowOrder = ['S', 'N', 'E', 'W'];

function enemyClip(sheet: SheetLayout, rowOrder: RowOrder, frameCount: number, frameDurationMs: number, loop: boolean): ClipDef {
  return { source: { kind: 'directionalRows', sheet, rowOrder }, frameCount, frameDurationMs, loop };
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
  return { idle: { source: { kind: 'single', sheet }, frameCount: 6, frameDurationMs: 150, loop: true } };
}

const PLAYER: SpriteSetDef = {
  scale: PLAYER_SCALE,
  anchor: { kind: 'feet', footOffsetPx: CHARACTER_FOOT_OFFSET_PX },
  clips: {
    // Legacy playerAnimSpeed defaults to 150 ms and becomes moveDuration * 1.5
    // while moving (walk 100 ms → 150 ms, sprint 75 ms → 112.5 ms).
    idle: { source: { kind: 'perDirectionSheets', sheets: playerSheets('idle', 80, IDLE_H) }, frameCount: 4, frameDurationMs: 150, loop: true },
    walk: { source: { kind: 'perDirectionSheets', sheets: playerSheets('walk', 80, WALK_H) }, frameCount: 4, frameDurationMs: 150, loop: true },
    run: { source: { kind: 'perDirectionSheets', sheets: playerSheets('run', 120, RUN_H) }, frameCount: 6, frameDurationMs: 112.5, loop: true },
    // JUMP_FRAME_COUNT 5 × JUMP_ANIM_SPEED 100 ms = JUMP_DURATION 500 ms.
    jump: { source: { kind: 'perDirectionSheets', sheets: playerSheets('jump', 100, JUMP_H) }, frameCount: 5, frameDurationMs: 100, loop: false },
    // ATTACK_MAX_FRAMES 4 × ATTACK_FRAME_SPEED_MS 80. Sheets are 446 px wide → 111.5 px frames.
    // Legacy mirrored attack_west for East; V2 ships a real east sheet (= legacy
    // attack_west.png, which faces east) and a pre-mirrored west sheet, so no flip.
    attack: {
      source: { kind: 'perDirectionSheets', sheets: playerSheets('attack', 446, ATTACK_H) },
      frameCount: 4,
      frameDurationMs: 80,
      loop: false,
      scale: PLAYER_ATTACK_SCALE,
    },
  },
};

export const ANIMATION_DEFS: Readonly<Record<string, SpriteSetDef>> = {
  player: PLAYER,

  // Mantis: MANTIS_ANIM_MS 200 (animates while idle too), attack 7 × 100 ms. drawH = 1.2 tiles.
  mantis: {
    scale: 1.2,
    anchor: { kind: 'feet', footOffsetPx: CHARACTER_FOOT_OFFSET_PX },
    clips: {
      idle: enemyClip(MANTIS_MOVE, ROWS_SEWN, 4, 200, true),
      walk: enemyClip(MANTIS_MOVE, ROWS_SEWN, 4, 200, true),
      attack: enemyClip(MANTIS_ATTACK, ROWS_SEWN, 7, 100, false),
    },
  },

  // Maggot: MAGGOT_ANIM_MS 250, spit 7 × 120 ms. drawH = 1.0 tile.
  maggot: {
    scale: 1,
    anchor: { kind: 'feet', footOffsetPx: CHARACTER_FOOT_OFFSET_PX },
    clips: {
      idle: enemyClip(MAGGOT_WALK, ROWS_SWEN, 4, 250, true),
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
    clips: { idle: { source: { kind: 'single', sheet: COIN_ANIM }, frameCount: 4, frameDurationMs: 150, loop: true } },
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
  magic_bolt: { shape: 'circle', radiusPx: 5, color: 0x64c8ff, outlineColor: 0xffffff, outlineWidthPx: 1.5 },
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
  }
  return [...aliases].sort();
}
