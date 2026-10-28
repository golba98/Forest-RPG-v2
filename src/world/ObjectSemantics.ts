import type { Bounds } from '../types/gameplay';
import type { PropKind, WorldProp } from '../types/world';

/** Physical footprints in tile units, relative to the sprite's ground tile. */
export const OBJECT_FOOTPRINTS: Readonly<Partial<Record<PropKind, Bounds>>> = {
  tree: { minX: 0.25, minY: 0.55, maxX: 0.75, maxY: 1 },
  rock_boulder: { minX: 0.1, minY: 0.4, maxX: 0.9, maxY: 1 },
  bush_obstacle: { minX: 0.1, minY: 0.45, maxX: 0.9, maxY: 1 },
  log_horizontal: { minX: 0, minY: 0.6, maxX: 1, maxY: 1 },
  log_vertical: { minX: 0.3, minY: 0.1, maxX: 0.7, maxY: 1 },
  log_stump: { minX: 0.2, minY: 0.5, maxX: 0.8, maxY: 1 },
};
export function propFootprint(prop: WorldProp): Bounds | null {
  return (
    OBJECT_FOOTPRINTS[prop.kind] ?? (prop.solid ? { minX: 0, minY: 0, maxX: 1, maxY: 1 } : null)
  );
}
export function isSolidProp(prop: WorldProp): boolean {
  return propFootprint(prop) !== null;
}
