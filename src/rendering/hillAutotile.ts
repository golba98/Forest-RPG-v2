import { Tile, isHillTile, type TileId } from '../types/tiles';
import atlas from './generated/cliff_tileset.json';

/**
 * Pixi-free 8-neighbour ("blob") autotiling for raised hill terrain.
 *
 * Art is chosen from elevation topology (which cells are hill/plateau), not
 * from the generator's HILL_* edge ids. The ids stay authoritative for
 * collision; topology-driven art also covers concave corners and lower faces
 * the 8 legacy edge ids cannot express. Frames come from the generated
 * `cliff_tileset.png` (scripts/build-hill-tileset.mjs), whose mask reduction
 * must match `reduceMask` below.
 */

export const HILL_ATLAS_ALIAS = 'hill_cliff_tileset';
export const HILL_ATLAS_SRC = 'assets/images/terrain/hills/cliff_tileset.png';

export const NB = { N: 1, NE: 2, E: 4, SE: 8, S: 16, SW: 32, W: 64, NW: 128 } as const;

const OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [0, -1, NB.N],
  [1, -1, NB.NE],
  [1, 0, NB.E],
  [1, 1, NB.SE],
  [0, 1, NB.S],
  [-1, 1, NB.SW],
  [-1, 0, NB.W],
  [-1, -1, NB.NW],
];

export interface AtlasRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface HillAtlasJson {
  readonly tileSize: number;
  readonly masks: readonly number[];
  readonly frames: Readonly<Record<string, AtlasRect>>;
}

const HILL_ATLAS: HillAtlasJson = atlas;
const INTERIOR = 255;
/** Plain interior first, then painted-detail variants; plain tiles dominate so detail stays sparse. */
const INTERIOR_KEYS = ['mask_255', 'mask_255', 'plateau_1', 'mask_255', 'plateau_2', 'plateau_3', 'mask_255', 'plateau_4', 'plateau_5'] as const;

/** Raised terrain drawn with the cliff tileset. */
export function isElevatedTile(tile: number): boolean {
  return isHillTile(tile as TileId) || tile === Tile.PLATEAU || tile === Tile.STAIRS;
}

/** Drops diagonal bits whose two adjacent cardinals are not both set. */
export function reduceMask(mask: number): number {
  let r = mask & (NB.N | NB.E | NB.S | NB.W);
  if (mask & NB.NE && mask & NB.N && mask & NB.E) r |= NB.NE;
  if (mask & NB.SE && mask & NB.S && mask & NB.E) r |= NB.SE;
  if (mask & NB.SW && mask & NB.S && mask & NB.W) r |= NB.SW;
  if (mask & NB.NW && mask & NB.N && mask & NB.W) r |= NB.NW;
  return r;
}

/** The 47 distinct reduced masks, ascending (atlas frame order). */
export const BLOB_MASKS: readonly number[] = [...new Set(Array.from({ length: 256 }, (_, m) => reduceMask(m)))].sort((a, b) => a - b);

/** Neighbour mask of elevated cells around (x, y). Out-of-bounds counts as low ground. */
export function elevationMask(tiles: ArrayLike<number>, width: number, height: number, x: number, y: number): number {
  let mask = 0;
  for (const [dx, dy, bit] of OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (isElevatedTile(tiles[ny * width + nx] ?? 0)) mask |= bit;
  }
  return mask;
}

/** Atlas rect for an elevated cell with neighbour mask `mask`; `variant` picks interior variety. */
export function hillFrame(mask: number, variant = 0): AtlasRect {
  const reduced = reduceMask(mask);
  const key = reduced === INTERIOR ? INTERIOR_KEYS[variant % INTERIOR_KEYS.length] ?? 'mask_255' : `mask_${reduced}`;
  return frameOrThrow(key);
}

/** Soft contact shadow drawn on low ground directly south of a cliff face. */
export function hillShadowFrame(): AtlasRect {
  return frameOrThrow('shadow_s');
}

/** Cast shadow on low ground directly east of a hill (sun from the north-west). */
export function hillShadowEastFrame(): AtlasRect {
  return frameOrThrow('shadow_e');
}

/** Steps overlay for a STAIRS cell, oriented toward its open (low-ground) side. */
export function hillStairsFrame(mask: number): AtlasRect {
  const dir = !(mask & NB.S) ? 's' : !(mask & NB.N) ? 'n' : !(mask & NB.E) ? 'e' : 'w';
  return frameOrThrow(`stairs_${dir}`);
}

export function hillAtlasMasks(): readonly number[] {
  return HILL_ATLAS.masks;
}

function frameOrThrow(key: string): AtlasRect {
  const rect = HILL_ATLAS.frames[key];
  if (!rect) throw new Error(`[hillAutotile] cliff_tileset.json has no frame "${key}"; re-run scripts/build-hill-tileset.mjs`);
  return rect;
}
