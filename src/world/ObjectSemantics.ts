import { hilltopSpritePlacement } from './HilltopDecoration';
import { CHARACTER_FOOT_OFFSET_PX } from '../types/physical';
import type { Bounds } from '../types/gameplay';
import type { PropKind, WorldProp } from '../types/world';

/** Physical footprints in tile units, relative to the sprite's ground tile. */
export const OBJECT_FOOTPRINTS: Readonly<Partial<Record<PropKind, Bounds>>> = {
  // Only the trunk and substantial roots block movement; foliage is overhead.
  tree: { minX: 0.32, minY: 0.65, maxX: 0.68, maxY: 1 },
  rock_boulder: { minX: 0.1, minY: 0.4, maxX: 0.9, maxY: 1 },
  bush_obstacle: { minX: 0.1, minY: 0.45, maxX: 0.9, maxY: 1 },
  log_horizontal: { minX: 0, minY: 0.6, maxX: 1, maxY: 1 },
  log_vertical: { minX: 0.3, minY: 0.1, maxX: 0.7, maxY: 1 },
  log_stump: { minX: 0.2, minY: 0.5, maxX: 0.8, maxY: 1 },
};
export function propFootprint(prop: WorldProp): Bounds | null {
  const bounds =
    OBJECT_FOOTPRINTS[prop.kind] ?? (prop.solid ? { minX: 0, minY: 0, maxX: 1, maxY: 1 } : null);
  if (!bounds || !prop.hilltop) return bounds;
  const p = hilltopSpritePlacement(prop.hilltop);
  return {
    minX: p.offsetX + bounds.minX * p.scale,
    maxX: p.offsetX + bounds.maxX * p.scale,
    minY: p.offsetY + bounds.minY * p.scale,
    maxY: p.offsetY + bounds.maxY * p.scale,
  };
}
export function isSolidProp(prop: WorldProp): boolean {
  return propFootprint(prop) !== null;
}

/** Actor depth is measured at the character anchor, ten pixels above its feet. */
export function propDepth(prop: WorldProp): number {
  const base = propFootprint(prop);
  return (
    prop.tileY +
    (base ? base.maxY - CHARACTER_FOOT_OFFSET_PX / 32 : 1)
  );
}
