import { nestBaseBounds } from '../world/NestGeometry';
import { elevationMask } from '../world/ElevationTopology';
import { cachedHillBounds, isRaisedSurface } from '../world/HillCollisionGeometry';
import { entityFootprint, resolveFootprint } from './EntityFootprint';
import type { EntityBase } from '../types/entities';
import type { Bounds, Collider, CollisionFootprint, TraversalProfile } from '../types/gameplay';
import type { WorldData } from '../types/world';
import { bridgeAtTile, bridgeGeometry, boundsOverlap, subtractDeck } from '../world/BridgeGeometry';
export type CollisionWorld = Pick<WorldData, 'tiles' | 'props' | 'bridges' | 'encounterSites'> & {
  readonly meta: Pick<WorldData['meta'], 'width' | 'height'>;
};
import { Tile, TILE_PROPERTIES, type TileId, type TileProperties } from '../types/tiles';
import { propFootprint } from '../world/ObjectSemantics';

/** Visibility queries may inspect an interaction target through its own base. Movement never bypasses nests. */
export interface CollisionQueryOptions { readonly ignoreNestId?: string }
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
  options: CollisionQueryOptions = {},
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
  if (profile === 'player' || profile === 'jumping')
    for (const site of world.encounterSites ?? []) {
      if (site.kind !== 'nest' || site.id === options.ignoreNestId) continue;
      for (const [i, b] of nestBaseBounds(world, site).entries())
        if (boundsOverlap(area, b)) colliders.push(make(`nest:${site.id}:${i}`, 'nest', b.minX, b.minY, b.maxX, b.maxY));
    }
  if (profile !== 'jumping') {
    for (const bridge of world.bridges ?? [])
      for (const [i, rail] of bridgeGeometry(bridge).rails.entries())
        if (boundsOverlap(area, rail)) colliders.push(make(`bridge:${bridge.id}:rail:${i}`, 'bridge', rail.minX, rail.minY, rail.maxX, rail.maxY));
  }
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
      const tile = world.tiles[y * width + x] ?? Tile.BORDER;
      if (isRaisedSurface(tile)) {
        if (profile !== 'jumping') {
          const mask = elevationMask(world.tiles, width, height, x, y);
          const bridge = bridgeAtTile(world, x, y);
          for (const [i, b] of cachedHillBounds(tile, mask).entries()) {
            const bounds = { minX: x + b.minX, minY: y + b.minY, maxX: x + b.maxX, maxY: y + b.maxY };
            // Only the actual deck overrides a face at a landing. Placement buffers do not.
            const pieces = bridge ? subtractDeck(bounds, bridgeGeometry(bridge).deck) : [bounds];
            for (const [j, piece] of pieces.entries())
              colliders.push(make(`cliff:${x},${y}:${i}:${j}`, 'cliff', piece.minX, piece.minY, piece.maxX, piece.maxY));
          }
        }
      } else if (blocksTile(properties, profile)) {
        const bridge = tile === Tile.RIVER ? bridgeAtTile(world, x, y) : undefined;
        if (bridge) {
          for (const [i, b] of subtractDeck({ minX: x, minY: y, maxX: x + 1, maxY: y + 1 }, bridgeGeometry(bridge).deck).entries())
            colliders.push(make(`bridge:${bridge.id}:water:${x},${y}:${i}`, 'bridge', b.minX, b.minY, b.maxX, b.maxY));
        } else colliders.push(make(`tile:${x},${y}`, 'terrain', x, y, x + 1, y + 1));
      }
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
  shape: number | CollisionFootprint,
  profile: TraversalProfile = 'player',
  options: CollisionQueryOptions = {},
): boolean {
  const f = resolveFootprint(shape);
  if (
    ![x, y, f.halfWidth, f.halfHeight, f.offsetX, f.offsetY].every(Number.isFinite) ||
    f.halfWidth < 0 ||
    f.halfHeight < 0
  )
    return false;
  const area = {
    minX: x + f.offsetX - f.halfWidth,
    minY: y + f.offsetY - f.halfHeight,
    maxX: x + f.offsetX + f.halfWidth,
    maxY: y + f.offsetY + f.halfHeight,
  };
  return !queryColliders(world, area, profile, options).some((c) => overlaps(area, c));
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
  half: number | CollisionFootprint,
  c: Bounds,
): Contact | null {
  const slab = (p: number, d: number, min: number, max: number): [number, number] | null => {
    if (Math.abs(d) < 1e-14)
      return p > min + CONTACT_EPSILON && p < max - CONTACT_EPSILON ? [-Infinity, Infinity] : null;
    const a = (min - p) / d,
      b = (max - p) / d;
    return [Math.min(a, b), Math.max(a, b)];
  };
  const f = resolveFootprint(half);
  const sx = slab(x + f.offsetX, dx, c.minX - f.halfWidth, c.maxX + f.halfWidth),
    sy = slab(y + f.offsetY, dy, c.minY - f.halfHeight, c.maxY + f.halfHeight);
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
  half: number | CollisionFootprint = 0.01,
  profile: TraversalProfile = 'player',
  options: CollisionQueryOptions = {},
): boolean {
  if (!canOccupy(world, x, y, half, profile, options) || !canOccupy(world, tx, ty, half, profile, options))
    return false;
  const f = resolveFootprint(half);
  const area = {
    minX: Math.min(x, tx) + f.offsetX - f.halfWidth,
    minY: Math.min(y, ty) + f.offsetY - f.halfHeight,
    maxX: Math.max(x, tx) + f.offsetX + f.halfWidth,
    maxY: Math.max(y, ty) + f.offsetY + f.halfHeight,
  };
  return !queryColliders(world, area, profile, options).some((c) => sweep(x, y, tx - x, ty - y, half, c));
}
/** Swept square AABB, earliest contact followed by tangential sliding. */
export function moveWithCollision(
  world: CollisionWorld,
  entity: EntityBase,
  dx: number,
  dy: number,
  profile: TraversalProfile = 'player',
): void {
  const footprint = entityFootprint(entity),
    f = resolveFootprint(footprint);
  if (![dx, dy].every(Number.isFinite) || !canOccupy(world, entity.x, entity.y, footprint, profile))
    return;
  for (let iteration = 0; iteration < 4 && Math.hypot(dx, dy) > 1e-12; iteration++) {
    const area = {
      minX: Math.min(entity.x, entity.x + dx) + f.offsetX - f.halfWidth,
      minY: Math.min(entity.y, entity.y + dy) + f.offsetY - f.halfHeight,
      maxX: Math.max(entity.x, entity.x + dx) + f.offsetX + f.halfWidth,
      maxY: Math.max(entity.y, entity.y + dy) + f.offsetY + f.halfHeight,
    };
    let time = 1,
      nx = false,
      ny = false;
    const nearby = queryColliders(world, area, profile);
    for (const c of nearby) {
      const hit = sweep(entity.x, entity.y, dx, dy, footprint, c);
      if (!hit) continue;
      // Tile faces shared with another blocking cell are internal to the union.
      // Suppress their normals so a seam cannot stop sliding along a wall.
      if (c.source === 'terrain') {
        const blocks = (x: number, y: number) => {
          if (x < 0 || y < 0 || x >= world.meta.width || y >= world.meta.height) return true;
          // Partial bridge cells cannot hide a neighbouring water face.
          if (world.tiles[y * world.meta.width + x] === Tile.RIVER && bridgeAtTile(world, x, y)) return false;
          return blocksTile(
            TILE_PROPERTIES[world.tiles[y * world.meta.width + x] as TileId],
            profile,
          );
        };
        if (hit.nx && blocks(c.minX - Math.sign(dx), c.minY)) hit.nx = false;
        if (hit.ny && blocks(c.minX, c.minY - Math.sign(dy))) hit.ny = false;
        if (!hit.nx && !hit.ny) continue;
      }
      if (c.source === 'cliff' || c.source === 'nest') {
        const px = entity.x + dx * hit.time + f.offsetX,
          py = entity.y + dy * hit.time + f.offsetY;
        const covered = (x: number, y: number) =>
          nearby.some(
            (other) =>
              other !== c &&
              other.source === c.source &&
              (c.source !== 'nest' || other.ownerId.slice(0, other.ownerId.lastIndexOf(':')) === c.ownerId.slice(0, c.ownerId.lastIndexOf(':'))) &&
              x > other.minX + CONTACT_EPSILON &&
              x < other.maxX - CONTACT_EPSILON &&
              y > other.minY + CONTACT_EPSILON &&
              y < other.maxY - CONTACT_EPSILON,
          );
        if (
          hit.nx &&
          covered(
            dx > 0 ? c.minX - 1e-7 : c.maxX + 1e-7,
            Math.max(c.minY + 1e-7, Math.min(c.maxY - 1e-7, py)),
          )
        )
          hit.nx = false;
        if (
          hit.ny &&
          covered(
            Math.max(c.minX + 1e-7, Math.min(c.maxX - 1e-7, px)),
            dy > 0 ? c.minY - 1e-7 : c.maxY + 1e-7,
          )
        )
          hit.ny = false;
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
