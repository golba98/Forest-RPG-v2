import type { Bounds } from '../types/gameplay';
import { Tile, isHillTile, type TileId } from '../types/tiles';

/** Contract shared with the existing 32px cliff atlas. No renderer dependencies. */
export const HILL_SURFACE = {
  tilePixels: 32,
  southFaceTop: 12,
  sideRim: 6,
  northRim: 4,
  cornerRadius: 6,
  lip: 1,
} as const;
export function isRaisedSurface(id: number): boolean {
  return isHillTile(id as TileId) || id === Tile.PLATEAU || id === Tile.STAIRS;
}

/** Local rectangles cover the drop/face, leaving the upper rim available to feet. */
export function hillCollisionBounds(tile: number, mask: number): Bounds[] {
  if (tile === Tile.STAIRS) return [];
  const n = Boolean(mask & 1),
    e = Boolean(mask & 4),
    s = Boolean(mask & 16),
    w = Boolean(mask & 64);
  const { tilePixels: t, southFaceTop: face, sideRim: rim, cornerRadius: r } = HILL_SURFACE;
  const blocked = (x: number, y: number): boolean => {
    // Match the atlas' rounded outer corners. The void is not standing space.
    if (!n && !w && x < r && y < r && (x - r) ** 2 + (y - r) ** 2 > r * r) return true;
    if (!n && !e && x > t - 1 - r && y < r && (x - (t - 1 - r)) ** 2 + (y - r) ** 2 > r * r)
      return true;
    if (!s && !w && x < r && y > t - 1 - r && (x - r) ** 2 + (y - (t - 1 - r)) ** 2 > r * r)
      return true;
    if (
      !s &&
      !e &&
      x > t - 1 - r &&
      y > t - 1 - r &&
      (x - (t - 1 - r)) ** 2 + (y - (t - 1 - r)) ** 2 > r * r
    )
      return true;
    if (!s && y >= face) return true;
    // The atlas paints exposed east/west rims as cliff sides; only the north rim is a thin lip.
    if ((!n && y < HILL_SURFACE.lip) || (!w && x < rim) || (!e && x >= t - rim)) return true;
    if (s && w && !(mask & 32) && x < rim && y >= face) return true;
    if (s && e && !(mask & 8) && x >= t - rim && y >= face) return true;
    return false;
  };
  // Merge equal horizontal pixel runs vertically; at most a few corner strips.
  const rectangles: Bounds[] = [];
  let active = new Map<string, number>();
  for (let y = 0; y < t; y++) {
    const next = new Map<string, number>();
    for (let x = 0; x < t;) {
      if (!blocked(x, y)) {
        x++;
        continue;
      }
      const start = x;
      while (x < t && blocked(x, y)) x++;
      const key = `${start}:${x}`,
        index = active.get(key);
      if (index !== undefined) {
        const previous = rectangles[index];
        if (previous) rectangles[index] = { ...previous, maxY: (y + 1) / t };
        next.set(key, index);
      } else {
        next.set(key, rectangles.length);
        rectangles.push({ minX: start / t, minY: y / t, maxX: x / t, maxY: (y + 1) / t });
      }
    }
    active = next;
  }
  return rectangles;
}

const cachedMasks = new Map<number, readonly Bounds[]>();
export function cachedHillBounds(tile: number, mask: number): readonly Bounds[] {
  const key = tile === Tile.STAIRS ? -1 : mask;
  let result = cachedMasks.get(key);
  if (!result) {
    result = hillCollisionBounds(tile, mask);
    cachedMasks.set(key, result);
  }
  return result;
}
