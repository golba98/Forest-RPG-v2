import { CHARACTER_FOOT_OFFSET_PX } from '../types/physical';
import type { EntityBase } from '../types/entities';
import type { CollisionFootprint } from '../types/gameplay';

/** Feet occupy the bottom six pixels of the existing ground anchor. */
export const PLAYER_FOOTPRINT: Readonly<CollisionFootprint> = {
  halfWidth: 0.22,
  halfHeight: 0.1,
  offsetX: 0,
  offsetY: CHARACTER_FOOT_OFFSET_PX / 32 - 0.1,
};
export function entityFootprint(
  entity: Pick<EntityBase, 'kind' | 'halfSize'>,
): number | CollisionFootprint {
  return entity.kind === 'player' ? PLAYER_FOOTPRINT : entity.halfSize;
}
export function resolveFootprint(shape: number | CollisionFootprint): CollisionFootprint {
  return typeof shape === 'number'
    ? { halfWidth: shape, halfHeight: shape, offsetX: 0, offsetY: 0 }
    : shape;
}
/** Continuous ground contact, independent of the animation frame and sprite lift. */
export function groundPosition(entity: Pick<EntityBase, 'kind' | 'halfSize' | 'x' | 'y'>): {
  x: number;
  y: number;
} {
  const f = resolveFootprint(entityFootprint(entity));
  return { x: entity.x + f.offsetX, y: entity.y + f.offsetY };
}
/** Tile supporting the centre of the feet. */
export function groundTile(entity: Pick<EntityBase, 'kind' | 'halfSize' | 'x' | 'y'>): { x: number; y: number } {
  const p = groundPosition(entity);
  return { x: Math.floor(p.x), y: Math.floor(p.y) };
}
