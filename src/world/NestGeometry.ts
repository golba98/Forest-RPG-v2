import type { EncounterSite } from '../types/encounters';
import type { CollisionWorld } from '../systems/CollisionSystem';
import type { Bounds } from '../types/gameplay';
import { hasClearPath } from '../systems/CollisionSystem';

/** Site remains the combat/home anchor. Only the harmless crawl starts behind it. */
export function nestGeometry(world: CollisionWorld, site: EncounterSite) {
  const travel =
    [0.75, 0.5, 0.25, 0].find((d) =>
      hasClearPath(world, site.x, site.y - d, site.x, site.y, 0.3, 'groundEnemy'),
    ) ?? 0;
  return { entrance: { x: site.x, y: site.y - travel }, exit: { x: site.x, y: site.y }, travel };
}

/** Native 96×80 sprite geometry; projections and thin root tips are not solid. */
export const NEST_ART = { mouthX: 48, mouthY: 52, footOffset: -10 } as const;
export const NEST_BASE_PIXELS = [
  { minX: 22, minY: 30, maxX: 74, maxY: 76 },
  { minX: 12, minY: 46, maxX: 84, maxY: 72 },
  { minX: 4, minY: 58, maxX: 92, maxY: 68 },
] as const;
export function nestLayout(world: CollisionWorld, site: EncounterSite) {
  const geometry = nestGeometry(world, site);
  const mouthX = geometry.entrance.x * 32;
  const mouthY = geometry.entrance.y * 32 + NEST_ART.footOffset;
  return {
    ...geometry,
    mouthX,
    mouthY,
    originX: mouthX - NEST_ART.mouthX,
    originY: mouthY - NEST_ART.mouthY,
  };
}
export function nestBaseBounds(world: CollisionWorld, site: EncounterSite): Bounds[] {
  const { originX, originY } = nestLayout(world, site);
  return NEST_BASE_PIXELS.map((b) => ({
    minX: (originX + b.minX) / 32,
    minY: (originY + b.minY) / 32,
    maxX: (originX + b.maxX) / 32,
    maxY: (originY + b.maxY) / 32,
  }));
}
