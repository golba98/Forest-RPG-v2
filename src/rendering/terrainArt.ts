import { Tile } from '../types/tiles';
import type { PropKind } from '../types/world';
import { decorAlias } from './assetCatalog';
import { HILL_ATLAS_ALIAS, NB, hillFrame, hillShadowFrame, isElevatedTile, type AtlasRect } from './hillAutotile';

/**
 * Ground-only terrain descriptions. Trees and standing props are rendered
 * separately in foot-depth order. Water and bridges use the original game's
 * full-image-per-tile mapping; hills are autotiled from elevation topology
 * (see hillAutotile.ts).
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
    }
  /** Explicit source rectangle (padded atlases). */
  | { readonly type: 'rect'; readonly rect: AtlasRect };

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

const FLOWER_VARIANTS: readonly PropKind[] = ['flower_pink', 'flower_yellow', 'flower_clump'];

/** Deterministic 32-bit hash of a tile coordinate. */
export function hashTile(x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
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

/**
 * Layers (bottom → top) for the terrain tile at (x, y). `elevation` is the
 * tile's 8-neighbour elevated-cell mask (hillAutotile.elevationMask).
 */
export function getTileArt(tileId: number, x: number, y: number, elevation = 0): TileArtLayer[] {
  if (isElevatedTile(tileId)) {
    return [grass(), fill(HILL_ATLAS_ALIAS, { type: 'rect', rect: hillFrame(elevation, hashTile(x, y) % 3) })];
  }
  const layers = getGroundArt(tileId, x, y);
  // Ground directly below a cliff face gets a soft contact shadow (visual only).
  if (elevation & NB.N) layers.push(fill(HILL_ATLAS_ALIAS, { type: 'rect', rect: hillShadowFrame() }));
  return layers;
}

function getGroundArt(tileId: number, x: number, y: number): TileArtLayer[] {
  switch (tileId) {
    case Tile.MUD:
      return [fill('tile_mud')];
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
      return [fill('tile_water')];
    case Tile.RAMP:
      return [fill('tile_bridge')];
    case Tile.LOG:
      return [fill('tile_bridge')];
    case Tile.FOREST:
      return [grass()];
    case Tile.BORDER:
      return [grass()];
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
