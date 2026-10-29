import type { Entity } from '../types/entities';
import type { Bounds } from '../types/gameplay';
import { Tile } from '../types/tiles';
import type { TilePoint, WorldData, WorldProp } from '../types/world';
import { canOccupy, hasClearPath } from '../systems/CollisionSystem';
import { entityFootprint, PLAYER_FOOTPRINT, resolveFootprint } from '../systems/EntityFootprint';
import { boundsOverlap, intersectsBridgeReservation } from './BridgeGeometry';
import { elevationMask, isRaisedSurface } from './ElevationTopology';
import { siteBounds } from './EncounterPlacement';
import { plateauDecoration } from './HilltopDecoration';
import { propFootprint } from './ObjectSemantics';

const VERSION = 1;
const RELOCATION_RADIUS = 4;
const CARDINALS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

/** Stable plateau components and a small useful summit clearing in each. */
function plateaus(world: WorldData) {
  const { width: w, height: h } = world.meta;
  const labels = new Int32Array(w * h).fill(-1),
    summits: TilePoint[] = [];
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== -1 || !isRaisedSurface(world.tiles[i] ?? 0)) continue;
    const id = summits.length,
      cells = [i];
    labels[i] = id;
    let sx = 0,
      sy = 0;
    for (let q = 0; q < cells.length; q++) {
      const at = cells[q] ?? i,
        x = at % w,
        y = Math.floor(at / w);
      sx += x;
      sy += y;
      for (const [dx, dy] of CARDINALS) {
        const nx = x + dx,
          ny = y + dy,
          ni = ny * w + nx;
        if (
          nx < 0 ||
          ny < 0 ||
          nx >= w ||
          ny >= h ||
          labels[ni] !== -1 ||
          !isRaisedSurface(world.tiles[ni] ?? 0)
        )
          continue;
        labels[ni] = id;
        cells.push(ni);
      }
    }
    const cx = sx / cells.length,
      cy = sy / cells.length;
    const interior = cells.filter(
      (at) => elevationMask(world.tiles, w, h, at % w, Math.floor(at / w)) === 255,
    );
    interior.sort(
      (a, b) =>
        ((a % w) - cx) ** 2 +
          (Math.floor(a / w) - cy) ** 2 -
          (((b % w) - cx) ** 2 + (Math.floor(b / w) - cy) ** 2) || a - b,
    );
    // Prefer an already empty clearing so reserving useful space does not
    // gratuitously displace a safe legacy decoration.
    const summit =
      interior.find((at) => {
        const x = at % w,
          y = Math.floor(at / w);
        if (world.props.some((p) => Math.abs(p.tileX - x) <= 1 && Math.abs(p.tileY - y) <= 1))
          return false;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (
              plateauDecoration(
                world.tiles[(y + dy) * w + x + dx] ?? 0,
                x + dx,
                y + dy,
                elevationMask(world.tiles, w, h, x + dx, y + dy),
              )?.kind === 'rock_boulder'
            )
              return false;
        return canOccupy(world, x + 0.5, y + 0.5, PLAYER_FOOTPRINT);
      }) ??
      interior[0] ??
      i;
    summits.push({ x: summit % w, y: Math.floor(summit / w) });
  }
  return { labels, summits };
}

function bounds(prop: WorldProp): Bounds {
  const b = propFootprint(prop);
  if (!b) throw new Error(`Hilltop object ${prop.id} has no footprint`);
  return {
    minX: prop.tileX + b.minX,
    maxX: prop.tileX + b.maxX,
    minY: prop.tileY + b.minY,
    maxY: prop.tileY + b.maxY,
  };
}

/**
 * A free closed bypass around the player's configuration-space obstacle is a
 * conservative local connectivity proof: any route crossing the removed area
 * can detour around it. Check continuous sweeps, including diagonal corners,
 * rather than a flood fill of tile centres. This deliberately rejects cramped
 * sites even when a more elaborate global planner could find a route.
 */
export function hasHilltopClearance(world: WorldData, prop: WorldProp): boolean {
  const b = bounds(prop),
    f = PLAYER_FOOTPRINT,
    gap = 0.125;
  const left = b.minX - f.halfWidth - f.offsetX - gap;
  const right = b.maxX + f.halfWidth - f.offsetX + gap;
  const top = b.minY - f.halfHeight - f.offsetY - gap;
  const bottom = b.maxY + f.halfHeight - f.offsetY + gap;
  const cx = (left + right) / 2,
    cy = (top + bottom) / 2;
  const ring = [
    [left, top],
    [cx, top],
    [right, top],
    [right, cy],
    [right, bottom],
    [cx, bottom],
    [left, bottom],
    [left, cy],
  ] as const;
  const proposed = { ...world, props: [...world.props, prop] };
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      next = ring[(i + 1) % ring.length];
    if (!a || !next) return false;
    if (!hasClearPath(proposed, a[0], a[1], next[0], next[1], f)) return false;
    // Both ground contact and its footprint stay on this plateau. No projection
    // offset is used for physics; raised and low ground occupy disjoint cells.
    for (let t = 0; t <= 8; t++) {
      const x = a[0] + ((next[0] - a[0]) * t) / 8 + f.offsetX;
      const y = a[1] + ((next[1] - a[1]) * t) / 8 + f.offsetY;
      for (const dx of [-f.halfWidth, f.halfWidth])
        for (const dy of [-f.halfHeight, f.halfHeight])
          if (
            !isRaisedSurface(
              world.tiles[Math.floor(y + dy) * world.meta.width + Math.floor(x + dx)] ?? 0,
            )
          )
            return false;
    }
  }
  // Diagonal approaches around the outside of each corner use the same sweep
  // as movement, so accepting a site never relies on diagonal corner cutting.
  for (const [x, y, dx, dy] of [
    [left, top, -gap, -gap],
    [right, top, gap, -gap],
    [right, bottom, gap, gap],
    [left, bottom, -gap, gap],
  ] as const)
    if (!hasClearPath(proposed, x, y, x + dx, y + dy, f)) return false;
  return true;
}

function localActorMoves(
  before: WorldData,
  after: WorldData,
  actors: readonly Entity[],
  labels: Int32Array,
) {
  const moves: { actor: Entity; x: number; y: number }[] = [];
  for (const actor of actors) {
    if (!actor.alive || (actor.kind !== 'player' && actor.kind !== 'enemy')) continue;
    const profile =
      actor.kind === 'player' ? 'player' : actor.enemyType === 'ghost' ? 'ghost' : 'groundEnemy';
    const shape = entityFootprint(actor),
      f = resolveFootprint(shape);
    if (canOccupy(after, actor.x, actor.y, shape, profile)) continue;
    // Do not take responsibility for unrelated pre-existing invalid positions.
    if (!canOccupy(before, actor.x, actor.y, shape, profile)) continue;
    const label =
      labels[Math.floor(actor.y + f.offsetY) * before.meta.width + Math.floor(actor.x + f.offsetX)];
    let found = false;
    for (let r = 1; r <= 16 && !found; r++) {
      const offsets: TilePoint[] = [];
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && dx * dx + dy * dy <= 16 * 16)
            offsets.push({ x: dx / 8, y: dy / 8 });
      offsets.sort((a, b) => a.x ** 2 + a.y ** 2 - b.x ** 2 - b.y ** 2 || a.y - b.y || a.x - b.x);
      for (const offset of offsets) {
        const x = actor.x + offset.x,
          y = actor.y + offset.y;
        if (
          labels[Math.floor(y + f.offsetY) * before.meta.width + Math.floor(x + f.offsetX)] !==
          label
        )
          continue;
        if (
          !canOccupy(after, x, y, shape, profile) ||
          !hasClearPath(before, actor.x, actor.y, x, y, shape, profile)
        )
          continue;
        moves.push({ actor, x, y });
        found = true;
        break;
      }
    }
    if (!found) return null;
  }
  return moves;
}

/** Pure placement with respect to terrain; optional saved actors are repaired locally. */
export function prepareHilltopObjects(world: WorldData, actors: readonly Entity[] = []): WorldData {
  if (world.meta.hilltopObjectsVersion === VERSION) return world;
  const { width: w, height: h } = world.meta;
  const { labels, summits } = plateaus(world);
  const stairs: TilePoint[] = [];
  for (let i = 0; i < world.tiles.length; i++)
    if (world.tiles[i] === Tile.STAIRS) stairs.push({ x: i % w, y: Math.floor(i / w) });
  const protectedPoints = [
    world.spawn,
    world.portal,
    ...world.enemySpawns,
    ...world.pickupSpawns,
    ...actors.filter((a) => a.kind === 'pickup' || a.kind === 'portal'),
  ];
  const reservations = (world.encounterSites ?? []).map((s) => siteBounds(s));
  let current = world;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      if (
        plateauDecoration(world.tiles[y * w + x] ?? 0, x, y, elevationMask(world.tiles, w, h, x, y))
          ?.kind !== 'rock_boulder'
      )
        continue;
      const id = 1_000_000 + y * w + x;
      if (
        current.props.some(
          (p) => p.id === id || (p.hilltop?.sourceX === x && p.hilltop.sourceY === y),
        )
      )
        continue;
      const label = labels[y * w + x] ?? -1,
        summit = summits[label];
      if (!summit) continue;
      const candidates: TilePoint[] = [];
      for (let dy = -RELOCATION_RADIUS; dy <= RELOCATION_RADIUS; dy++)
        for (let dx = -RELOCATION_RADIUS; dx <= RELOCATION_RADIUS; dx++)
          if (dx * dx + dy * dy <= RELOCATION_RADIUS ** 2)
            candidates.push({ x: x + dx, y: y + dy });
      candidates.sort(
        (a, b) =>
          (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2) ||
          a.y - b.y ||
          a.x - b.x,
      );
      for (const at of candidates) {
        if (
          at.x < 1 ||
          at.y < 1 ||
          at.x >= w - 1 ||
          at.y >= h - 1 ||
          labels[at.y * w + at.x] !== label
        )
          continue;
        if (
          world.tiles[at.y * w + at.x] === Tile.STAIRS ||
          elevationMask(world.tiles, w, h, at.x, at.y) !== 255
        )
          continue;
        if (current.props.some((p) => p.tileX === at.x && p.tileY === at.y)) continue;
        const prop: WorldProp = {
          id,
          kind: 'rock_boulder',
          tileX: at.x,
          tileY: at.y,
          solid: true,
          hilltop: { sourceX: x, sourceY: y },
        };
        const b = bounds(prop);
        if (
          intersectsBridgeReservation(world.bridges ?? [], b) ||
          reservations.some((r) => boundsOverlap(b, r))
        )
          continue;
        if (stairs.some((p) => Math.abs(p.x - at.x) <= 2 && Math.abs(p.y - at.y) <= 2)) continue;
        if (Math.abs(summit.x - at.x) <= 1 && Math.abs(summit.y - at.y) <= 1) continue;
        if (protectedPoints.some((p) => Math.abs(p.x - at.x) < 1.5 && Math.abs(p.y - at.y) < 1.5))
          continue;
        if (!hasHilltopClearance(current, prop)) continue;
        const after = { ...current, props: [...current.props, prop] };
        const moves = localActorMoves(current, after, actors, labels);
        if (!moves) continue; // Try moving the rock instead of moving an actor off its plateau.
        for (const move of moves) {
          move.actor.x = move.actor.prevX = move.x;
          move.actor.y = move.actor.prevY = move.y;
        }
        current = after;
        break;
      }
    }
  return { ...current, meta: { ...current.meta, hilltopObjectsVersion: VERSION } };
}
