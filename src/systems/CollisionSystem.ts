import type { EntityBase } from '../types/entities';
import type { Bounds, Collider, TraversalProfile } from '../types/gameplay';
import type { WorldData } from '../types/world';
export type CollisionWorld = Pick<WorldData, 'tiles' | 'props'> & {
  readonly meta: Pick<WorldData['meta'], 'width' | 'height'>;
};
import { TILE_PROPERTIES, type TileId, type TileProperties } from '../types/tiles';
import { propFootprint } from '../world/ObjectSemantics';

export const CONTACT_EPSILON = 1e-9;
const indexes = new WeakMap<CollisionWorld, Map<number, Collider[]>>();
function indexedProps(world: CollisionWorld): Map<number, Collider[]> {
  const cached = indexes.get(world);
  if (cached) return cached;
  const index = new Map<number, Collider[]>();
  for (const prop of world.props) {
    const bounds = propFootprint(prop);
    if (!bounds) continue;
    const collider: Collider = {
      ownerId: `prop:${prop.id}:${prop.kind}`,
      shape: 'aabb',
      classification: 'solid',
      source: 'object',
      minX: prop.tileX + bounds.minX,
      maxX: prop.tileX + bounds.maxX,
      minY: prop.tileY + bounds.minY,
      maxY: prop.tileY + bounds.maxY,
    };
    for (let y = Math.floor(collider.minY); y < Math.ceil(collider.maxY); y++)
      for (let x = Math.floor(collider.minX); x < Math.ceil(collider.maxX); x++) {
        const key = y * world.meta.width + x;
        const list = index.get(key) ?? [];
        list.push(collider);
        index.set(key, list);
      }
  }
  indexes.set(world, index);
  return index;
}
export function invalidatePropIndex(world: CollisionWorld): void {
  indexes.delete(world);
}
/** Whether terrain with these properties blocks an entity moving with `profile`. */
function blocksTile(properties: TileProperties | undefined, profile: TraversalProfile): boolean {
  if (!properties) return true;
  if (properties.solid) return !(profile === 'jumping' && properties.jumpable);
  return profile === 'groundEnemy' && properties.blocksMobs;
}
function overlaps(a: Bounds, b: Bounds): boolean {
  return (
    a.maxX > b.minX + CONTACT_EPSILON &&
    a.minX < b.maxX - CONTACT_EPSILON &&
    a.maxY > b.minY + CONTACT_EPSILON &&
    a.minY < b.maxY - CONTACT_EPSILON
  );
}
export function queryColliders(
  world: CollisionWorld,
  area: Bounds,
  profile: TraversalProfile = 'player',
): Collider[] {
  const { width, height } = world.meta;
  const make = (
    ownerId: string,
    source: Collider['source'],
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ): Collider => ({
    ownerId,
    source,
    shape: 'aabb',
    classification: 'solid',
    minX,
    minY,
    maxX,
    maxY,
  });
  const colliders = [
    make('boundary:w', 'boundary', -1e9, -1e9, 0, 1e9),
    make('boundary:e', 'boundary', width, -1e9, 1e9, 1e9),
    make('boundary:n', 'boundary', 0, -1e9, width, 0),
    make('boundary:s', 'boundary', 0, height, width, 1e9),
  ];
  if (profile === 'ghost') return colliders;
  const seen = new Set<Collider>();
  const index = indexedProps(world);
  for (
    let y = Math.max(0, Math.floor(area.minY));
    y <= Math.min(height - 1, Math.floor(area.maxY));
    y++
  )
    for (
      let x = Math.max(0, Math.floor(area.minX));
      x <= Math.min(width - 1, Math.floor(area.maxX));
      x++
    ) {
      const properties = TILE_PROPERTIES[world.tiles[y * width + x] as TileId];
      if (blocksTile(properties, profile))
        colliders.push(make(`tile:${x},${y}`, 'terrain', x, y, x + 1, y + 1));
      for (const c of index.get(y * width + x) ?? []) {
        if (profile === 'jumping' && !c.ownerId.endsWith(':tree')) continue;
        if (!seen.has(c)) {
          seen.add(c);
          colliders.push(c);
        }
      }
    }
  return colliders;
}
export function canOccupy(
  world: CollisionWorld,
  x: number,
  y: number,
  half: number,
  profile: TraversalProfile = 'player',
): boolean {
  if (![x, y, half].every(Number.isFinite) || half < 0) return false;
  const area = { minX: x - half, minY: y - half, maxX: x + half, maxY: y + half };
  return !queryColliders(world, area, profile).some((c) => overlaps(area, c));
}
interface Contact {
  time: number;
  nx: boolean;
  ny: boolean;
}
function sweep(
  x: number,
  y: number,
  dx: number,
  dy: number,
  half: number,
  c: Bounds,
): Contact | null {
  const slab = (p: number, d: number, min: number, max: number): [number, number] | null => {
    if (Math.abs(d) < 1e-14)
      return p > min + CONTACT_EPSILON && p < max - CONTACT_EPSILON ? [-Infinity, Infinity] : null;
    const a = (min - p) / d,
      b = (max - p) / d;
    return [Math.min(a, b), Math.max(a, b)];
  };
  const sx = slab(x, dx, c.minX - half, c.maxX + half),
    sy = slab(y, dy, c.minY - half, c.maxY + half);
  if (!sx || !sy) return null;
  const entry = Math.max(sx[0], sy[0]),
    exit = Math.min(sx[1], sy[1]);
  if (entry < -CONTACT_EPSILON || entry > 1 || exit < Math.max(0, entry) || exit <= CONTACT_EPSILON)
    return null;
  return {
    time: Math.max(0, entry),
    nx: Math.abs(sx[0] - entry) < CONTACT_EPSILON,
    ny: Math.abs(sy[0] - entry) < CONTACT_EPSILON,
  };
}
export function hasClearPath(
  world: CollisionWorld,
  x: number,
  y: number,
  tx: number,
  ty: number,
  half = 0.01,
  profile: TraversalProfile = 'player',
): boolean {
  if (!canOccupy(world, x, y, half, profile) || !canOccupy(world, tx, ty, half, profile))
    return false;
  const area = {
    minX: Math.min(x, tx) - half,
    minY: Math.min(y, ty) - half,
    maxX: Math.max(x, tx) + half,
    maxY: Math.max(y, ty) + half,
  };
  return !queryColliders(world, area, profile).some((c) => sweep(x, y, tx - x, ty - y, half, c));
}
/** Swept square AABB, earliest contact followed by tangential sliding. */
export function moveWithCollision(
  world: CollisionWorld,
  entity: EntityBase,
  dx: number,
  dy: number,
  profile: TraversalProfile = 'player',
): void {
  if (
    ![dx, dy].every(Number.isFinite) ||
    !canOccupy(world, entity.x, entity.y, entity.halfSize, profile)
  )
    return;
  for (let iteration = 0; iteration < 4 && Math.hypot(dx, dy) > 1e-12; iteration++) {
    const area = {
      minX: Math.min(entity.x, entity.x + dx) - entity.halfSize,
      minY: Math.min(entity.y, entity.y + dy) - entity.halfSize,
      maxX: Math.max(entity.x, entity.x + dx) + entity.halfSize,
      maxY: Math.max(entity.y, entity.y + dy) + entity.halfSize,
    };
    let time = 1,
      nx = false,
      ny = false;
    for (const c of queryColliders(world, area, profile)) {
      const hit = sweep(entity.x, entity.y, dx, dy, entity.halfSize, c);
      if (!hit) continue;
      // Tile faces shared with another blocking cell are internal to the union.
      // Suppress their normals so a seam cannot stop sliding along a wall.
      if (c.source === 'terrain') {
        const blocks = (x: number, y: number) => {
          if (x < 0 || y < 0 || x >= world.meta.width || y >= world.meta.height) return true;
          return blocksTile(TILE_PROPERTIES[world.tiles[y * world.meta.width + x] as TileId], profile);
        };
        if (hit.nx && blocks(c.minX - Math.sign(dx), c.minY)) hit.nx = false;
        if (hit.ny && blocks(c.minX, c.minY - Math.sign(dy))) hit.ny = false;
        if (!hit.nx && !hit.ny) continue;
      }
      if (hit.time < time - CONTACT_EPSILON) {
        time = hit.time;
        nx = hit.nx;
        ny = hit.ny;
      } else if (Math.abs(hit.time - time) < CONTACT_EPSILON) {
        nx ||= hit.nx;
        ny ||= hit.ny;
      }
    }
    entity.x += dx * time;
    entity.y += dy * time;
    dx = nx ? 0 : dx * (1 - time);
    dy = ny ? 0 : dy * (1 - time);
  }
}
