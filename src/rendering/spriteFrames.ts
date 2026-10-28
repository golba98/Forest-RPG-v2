import type { Direction } from '../types/entities';
import type { RenderEntityView } from '../types/render';
import { PLAYER_SHEET_ALIASES } from './assetCatalog';

/**
 * Pixi-free sprite frame selection.
 *
 * `selectSpriteFrame` is the single place that maps an entity view to a
 * texture frame. Phase 1 picks a static frame per sprite key; Phase 2 swaps
 * this function for the animation system (src/animation).
 */
export interface SpriteFrameSpec {
  /** Texture alias; the sheet is split into an equal cols × rows grid. */
  alias: string;
  col: number;
  row: number;
  cols: number;
  rows: number;
  /** World pixels per source pixel. */
  scale: number;
  /** Vertical anchor: 1 = feet on (x, y), 0.5 = centred on (x, y). */
  anchorY: number;
  /** Base tint (0xRRGGBB) before hurt flash. */
  tint: number;
}

export const MISSING_SPRITE_ALIAS = 'missing_sprite';
/** Not shipped yet: renders as a tinted placeholder. */
export const MAGIC_BOLT_ALIAS = 'vfx_magic_bolt';

export function createFrameSpec(): SpriteFrameSpec {
  return { alias: MISSING_SPRITE_ALIAS, col: 0, row: 0, cols: 1, rows: 1, scale: 1, anchorY: 1, tint: 0xffffff };
}

/** Mantis / maggot / ghost sheets: rows S=0, E=1, W=2, N=3 (legacy getDirectionSpriteRow_SEWN). */
function rowSEWN(facing: Direction): number {
  switch (facing) {
    case 'E':
      return 1;
    case 'W':
      return 2;
    case 'N':
    case 'NE':
    case 'NW':
      return 3;
    default:
      return 0;
  }
}

/** Beetle sheet: rows S=0, W=1, E=2, N=3 (legacy getDirectionSpriteRow_NSEW). */
function rowSWEN(facing: Direction): number {
  switch (facing) {
    case 'W':
      return 1;
    case 'E':
      return 2;
    case 'N':
    case 'NE':
    case 'NW':
      return 3;
    default:
      return 0;
  }
}

function set(
  out: SpriteFrameSpec,
  alias: string,
  col: number,
  row: number,
  cols: number,
  rows: number,
  scale: number,
  anchorY: number,
  tint = 0xffffff,
): SpriteFrameSpec {
  out.alias = alias;
  out.col = col;
  out.row = row;
  out.cols = cols;
  out.rows = rows;
  out.scale = scale;
  out.anchorY = anchorY;
  out.tint = tint;
  return out;
}

/**
 * Chooses the frame for `view`, writing into `out` (allocation-free).
 * Scales follow the legacy draw sizes (player 2×, mantis ≈1.2 tiles, beetle
 * boss 80 px, ghost ≈1.3 tiles, portal ≈2 tiles).
 */
export function selectSpriteFrame(view: RenderEntityView, out: SpriteFrameSpec): SpriteFrameSpec {
  switch (view.spriteKey) {
    case 'player':
      return set(out, PLAYER_SHEET_ALIASES.idle[view.facing], 0, 0, 4, 1, 2, 1);
    case 'mantis':
      return set(out, 'enemy_mantis_move', 0, rowSEWN(view.facing), 4, 4, 1.25, 1);
    case 'maggot':
      return set(out, 'enemy_maggot_walk', 0, rowSEWN(view.facing), 4, 4, 1.25, 1);
    case 'beetle':
      return set(out, 'enemy_beetle_move', 0, rowSWEN(view.facing), 4, 4, 2.5, 1);
    case 'ghost':
      // 234×256 sheet = 3 cols × 4 rows of 78×64; legacy tint rgb(160,210,255).
      return set(out, 'enemy_ghost_move', 0, rowSEWN(view.facing), 3, 4, 0.65, 1, 0xa0d2ff);
    case 'coin':
      return set(out, 'item_coin', 0, 0, 1, 1, 0.75, 0.5);
    case 'health_potion':
      return set(out, 'item_potion_health', 0, 0, 1, 1, 0.75, 0.5);
    case 'speed_potion':
      return set(out, 'item_potion_speed', 0, 0, 1, 1, 0.75, 0.5);
    case 'chest':
      return set(out, 'item_chest', 0, 0, 1, 1, 1, 0.5);
    case 'portal':
      // 1536×256 = 6 frames of 256×256, drawn ≈ 2 tiles.
      return set(out, view.active === true ? 'portal_active' : 'portal_inactive', 0, 0, 6, 1, 0.25, 1);
    case 'acid':
      // 224×128 = 7 cols × 4 rows of 32×32.
      return set(out, 'projectile_acid_blob', 0, 0, 7, 4, 0.75, 0.5);
    case 'magic_bolt':
      return set(out, MAGIC_BOLT_ALIAS, 0, 0, 1, 1, 0.75, 0.5, 0x8fe3ff);
    default:
      return set(out, MISSING_SPRITE_ALIAS, 0, 0, 1, 1, 1, 1, 0xff40ff);
  }
}
