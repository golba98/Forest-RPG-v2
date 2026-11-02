import type { Entity } from '../../types/entities';

export function translateEntity<T extends Entity>(entity: T, dx: number, dy: number): T {
  const e = structuredClone(entity);
  e.x += dx;
  e.y += dy;
  e.prevX += dx;
  e.prevY += dy;
  if (e.kind === 'enemy' && e.encounterHome) {
    e.encounterHome.x += dx;
    e.encounterHome.y += dy;
  }
  return e;
}
