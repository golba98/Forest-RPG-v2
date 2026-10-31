import { DECOR_VEGETATION, VEGETATION } from './vegetationArt';
import { hashTile } from '../world/TileHash';
export { hashTile } from '../world/TileHash';
import { plateauDecoration, hilltopSpritePlacement } from '../world/HilltopDecoration';
import { Tile } from '../types/tiles';
import type { PropKind, WorldProp } from '../types/world';
import { decorAlias } from './assetCatalog';
import { waterBaseAlias, waterEdgeAlias, waterEdges, bankAlias } from './waterArt';
import { HILL_ATLAS_ALIAS, NB, hillFrame, hillShadowEastFrame, hillShadowFrame, hillStairsFrame, isElevatedTile, reduceMask, type AtlasRect } from './hillAutotile';

/**
 * Ground-only terrain descriptions. Trees and standing props are rendered
 * separately in foot-depth order. Water is procedural (waterArt.ts); bridges use the original game's
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

const TONE_CELL = 7;

/**
 * Large-scale tone variation (bilinear value noise on a 7-tile lattice) as a
 * grey tint, so wide fields and hill tops are not one flat colour.
 */
export function toneTint(x: number, y: number, depth = 0.12): number {
  const gx = x / TONE_CELL, gy = y / TONE_CELL;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0, fy = gy - y0;
  const v = (ix: number, iy: number) => (hashTile(ix * 7 + 3, iy * 13 + 5) % 1000) / 999;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const top = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
  const bottom = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
  const k = Math.round(255 * (1 - depth * (top + (bottom - top) * sy)));
  return (k << 16) | (k << 8) | k;
}

/**
 * Layers (bottom → top) for the terrain tile at (x, y). `elevation` is the
 * tile's 8-neighbour elevated-cell mask (hillAutotile.elevationMask);
 * `shore` is its land-neighbour mask (waterArt.waterEdgeMask), used by water.
 */
export function getTileArt(tileId: number, x: number, y: number, elevation = 0, shore = 0): TileArtLayer[] {
  if (isElevatedTile(tileId)) {
    const h = hashTile(x, y);
    const interior = reduceMask(elevation) === 255;
    const layers = [grass(), fill(HILL_ATLAS_ALIAS, { type: 'rect', rect: hillFrame(elevation, h) }, interior ? toneTint(x, y, 0.14) : WHITE)];
    if (tileId === Tile.STAIRS) layers.push(fill(HILL_ATLAS_ALIAS, { type: 'rect', rect: hillStairsFrame(elevation) }));
    const decor = plateauDecoration(tileId, x, y, elevation);
    // Solid decor is an authoritative world prop, never part of a terrain cache.
    if (decor && decor.kind !== 'rock_boulder') {
      const frame = DECOR_VEGETATION[decor.kind];
      layers.push(frame
        ? { ...contain(frame.atlas, 1, 1, 'center'), source: { type: 'rect', rect: frame.rect } }
        : contain(decorAlias(decor.kind), 0.9, 0.9, 'center', WHITE, decor.offsetX, decor.offsetY));
    }
    return layers;
  }
  if (tileId === Tile.RIVER) {
    const h = hashTile(x, y);
    // Gentle tone tint breaks up the repeating swell; shoreline overlays sit on top.
    return [fill(waterBaseAlias(h), FULL, toneTint(x, y, 0.18)), ...waterEdges(shore).map((edge) => fill(waterEdgeAlias(edge)))];
  }
  const layers = getGroundArt(tileId, x, y);
  if (shore && [Tile.GRASS, Tile.FLOWERS].includes(tileId as 1 | 9)) layers.push(fill(bankAlias(shore)));
  const base = layers[0];
  if (base?.alias === GRASS_ALIAS && base.tint === WHITE) layers[0] = grass(toneTint(x, y));
  // Sun from the north-west: low ground south and east of a hill is shaded (visual only).
  if (elevation & NB.N) layers.push(fill(HILL_ATLAS_ALIAS, { type: 'rect', rect: hillShadowFrame() }));
  if (elevation & NB.W) layers.push(fill(HILL_ATLAS_ALIAS, { type: 'rect', rect: hillShadowEastFrame() }));
  return layers;
}

function getGroundArt(tileId: number, x: number, y: number): TileArtLayer[] {
  switch (tileId) {
    case Tile.MUD:
      // Soil composition is sampled from the world field when building chunks.
      return [grass()];
    case Tile.GRASS:
      return [grass()];
    case Tile.FLOWERS: {
      const h = hashTile(x, y);
      const kind = FLOWER_VARIANTS[h % FLOWER_VARIANTS.length] ?? 'flower_clump';
      const jitterX = ((h >>> 8) % 9) - 4;
      const jitterY = ((h >>> 16) % 7) - 3;
      const frame = DECOR_VEGETATION[kind] ?? VEGETATION.flowers;
      return [grass(), { ...contain(frame.atlas, 1, 1, 'center', WHITE, jitterX, jitterY), source: { type: 'rect', rect: frame.rect } }];
    }
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

/** Preserve the exact legacy 32×32 boulder image, scale and pixel-snapped jitter. */
export function getWorldPropArt(prop: WorldProp): TileArtLayer {
  if (!prop.hilltop) return getPropArt(prop.kind);
  const p = hilltopSpritePlacement(prop.hilltop);
  return contain(decorAlias(prop.kind), p.scale, p.scale, 'center', WHITE, p.jitterX, p.jitterY);
}
