import { Tile } from '../types/tiles';
import type { PropKind } from '../types/world';
import { decorAlias } from './assetCatalog';

/**
 * Pixi-free description of how each terrain tile is drawn (Phase 1 art).
 *
 * Placeholder notes (Phase 2 replaces these):
 * - FOREST/BORDER: the 239×286 tree is shrunk into one tile; proper tall,
 *   depth-sorted trees come later.
 * - HILL_* corners: the ~77×78 corner art is squashed into one tile.
 * - CLIFF/CAVE: tinted grass + rock/hole decal; there is no dedicated art.
 * - Props are baked flat into the terrain (no depth sorting).
 */

/** Which part of the source texture a layer uses. */
export type TileArtSource =
  | { readonly type: 'full' }
  /** Equal grid cell: source split into cols × rows. */
  | { readonly type: 'grid'; readonly col: number; readonly row: number; readonly cols: number; readonly rows: number }
  /** Fixed-size cell at (frameX·frameW, frameY·frameH), as TextureStore.getFrame. */
  | {
      readonly type: 'cell';
      readonly frameX: number;
      readonly frameY: number;
      readonly frameW: number;
      readonly frameH: number;
    };

export interface TileArtLayer {
  readonly alias: string;
  readonly source: TileArtSource;
  /**
   * 'fill' stretches over the tile. 'contain' keeps aspect ratio, never
   * upscales, fits within maxWidthTiles × maxHeightTiles, centred horizontally.
   */
  readonly fit: 'fill' | 'contain';
  readonly maxWidthTiles: number;
  readonly maxHeightTiles: number;
  /** Vertical alignment for 'contain' layers. */
  readonly align: 'bottom' | 'center';
  /** Extra offset in world px (deterministic jitter). */
  readonly offsetX: number;
  readonly offsetY: number;
  readonly tint: number;
}

export const GRASS_ALIAS = 'tile_grass';
const WHITE = 0xffffff;
const FULL: TileArtSource = { type: 'full' };

/** Hills strips are 3 tiles long (e.g. hill_north 96×33). */
const HILL_STRIP_SEGMENTS = 3;
/** Water is sliced into 32 px cells repeating every 3 tiles (105×100 source). */
const WATER_CELL_PX = 32;
const WATER_CELLS = 3;

const FLOWER_VARIANTS: readonly PropKind[] = ['flower_pink', 'flower_yellow', 'flower_clump'];

/** Deterministic 32-bit hash of a tile coordinate. */
export function hashTile(x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function mod(value: number, n: number): number {
  return ((value % n) + n) % n;
}

function fill(alias: string, source: TileArtSource = FULL, tint = WHITE): TileArtLayer {
  return {
    alias,
    source,
    fit: 'fill',
    maxWidthTiles: 1,
    maxHeightTiles: 1,
    align: 'bottom',
    offsetX: 0,
    offsetY: 0,
    tint,
  };
}

function contain(
  alias: string,
  maxWidthTiles: number,
  maxHeightTiles: number,
  align: 'bottom' | 'center',
  tint = WHITE,
  offsetX = 0,
  offsetY = 0,
): TileArtLayer {
  return { alias, source: FULL, fit: 'contain', maxWidthTiles, maxHeightTiles, align, offsetX, offsetY, tint };
}

function grass(tint = WHITE): TileArtLayer {
  return fill(GRASS_ALIAS, FULL, tint);
}

function hillStrip(alias: string, index: number, horizontal: boolean): TileArtLayer {
  const segment = mod(index, HILL_STRIP_SEGMENTS);
  return fill(
    alias,
    horizontal
      ? { type: 'grid', col: segment, row: 0, cols: HILL_STRIP_SEGMENTS, rows: 1 }
      : { type: 'grid', col: 0, row: segment, cols: 1, rows: HILL_STRIP_SEGMENTS },
  );
}

/** Layers (bottom → top) for the terrain tile at (x, y). */
export function getTileArt(tileId: number, x: number, y: number): TileArtLayer[] {
  switch (tileId) {
    case Tile.GRASS:
      return [grass()];
    case Tile.FLOWERS: {
      const h = hashTile(x, y);
      const kind = FLOWER_VARIANTS[h % FLOWER_VARIANTS.length] ?? 'flower_clump';
      const jitterX = ((h >>> 8) % 9) - 4;
      const jitterY = ((h >>> 16) % 7) - 3;
      return [grass(), contain(decorAlias(kind), 0.8, 0.8, 'center', WHITE, jitterX, jitterY)];
    }
    case Tile.RIVER:
      return [
        fill('tile_water', {
          type: 'cell',
          frameX: mod(x, WATER_CELLS),
          frameY: mod(y, WATER_CELLS),
          frameW: WATER_CELL_PX,
          frameH: WATER_CELL_PX,
        }),
      ];
    case Tile.RAMP:
      return [fill('tile_bridge')];
    case Tile.LOG:
      return [grass(), contain(decorAlias('log_horizontal'), 1, 1, 'center')];
    case Tile.FOREST:
      return [grass(0xd6e6cc), contain('tile_tree', 1, 1, 'bottom')];
    case Tile.BORDER:
      return [grass(0xa8b8a0), contain('tile_tree', 1, 1, 'bottom', 0xa8b8a0)];
    case Tile.HILL_N:
      return [grass(), hillStrip('hill_n', x, true)];
    case Tile.HILL_S:
      return [grass(), hillStrip('hill_s', x, true)];
    case Tile.HILL_E:
      return [grass(), hillStrip('hill_e', y, false)];
    case Tile.HILL_W:
      return [grass(), hillStrip('hill_w', y, false)];
    case Tile.HILL_NE:
      return [grass(), fill('hill_ne')];
    case Tile.HILL_NW:
      return [grass(), fill('hill_nw')];
    case Tile.HILL_SE:
      return [grass(), fill('hill_se')];
    case Tile.HILL_SW:
      return [grass(), fill('hill_sw')];
    case Tile.CLIFF:
      return [grass(0x9c8a68), contain(decorAlias('rock_boulder'), 1, 1, 'center', 0xc8b8a0)];
    case Tile.CAVE:
      return [grass(0x4c5654), contain(decorAlias('hole'), 1, 1, 'center')];
    default:
      // Unknown IDs are a data bug: make them obvious rather than invisible.
      return [grass(0xff40ff)];
  }
}

/** Static world prop drawn on its tile: fits one tile wide, may rise 1.5 tiles. */
export function getPropArt(kind: PropKind): TileArtLayer {
  const isFlower = kind === 'flower_clump' || kind === 'flower_pink' || kind === 'flower_yellow';
  return contain(decorAlias(kind), 1, isFlower ? 1 : 1.5, isFlower ? 'center' : 'bottom');
}
