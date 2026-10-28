import { elevationMask, isRaisedSurface, NB, reduceMask, stairsDirection } from '../world/ElevationTopology';
export { elevationMask, NB, reduceMask };
import atlas from './generated/cliff_tileset.json';

/**
 * Pixi-free 8-neighbour ("blob") autotiling for raised hill terrain.
 *
 * Art is chosen from elevation topology (which cells are hill/plateau), not
 * from the generator's HILL_* edge ids. Collision shares this topology;
 * topology-driven art also covers concave corners and lower faces
 * the 8 legacy edge ids cannot express. Frames come from the generated
 * `cliff_tileset.png` (scripts/build-hill-tileset.mjs), whose mask reduction
 * must match `reduceMask` below.
 */

export const HILL_ATLAS_ALIAS = 'hill_cliff_tileset';
export const HILL_ATLAS_SRC = 'assets/images/terrain/hills/cliff_tileset.png';

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
export const isElevatedTile = isRaisedSurface;

/** The 47 distinct reduced masks, ascending (atlas frame order). */
export const BLOB_MASKS: readonly number[] = [...new Set(Array.from({ length: 256 }, (_, m) => reduceMask(m)))].sort((a, b) => a - b);

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
  const dir = stairsDirection(mask);
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
