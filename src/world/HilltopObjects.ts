import type { Entity } from '../types/entities';
import type { Bounds } from '../types/gameplay';
import { Tile } from '../types/tiles';
import type { TilePoint, WorldData, WorldProp } from '../types/world';
import { canOccupy, hasClearPath } from '../systems/CollisionSystem';
import { entityFootprint, PLAYER_FOOTPRINT, resolveFootprint } from '../systems/EntityFootprint';
import { LandscapePlan, landscapeFor } from './LandscapePlan';
import { attachLandscapeTrace, createLandscapeTrace, type LandscapeTrace } from './LandscapeTrace';
import { plateauDecoration } from './HilltopDecoration';
import { propFootprint } from './ObjectSemantics';

const VERSION = 1;
const RELOCATION_RADIUS = 4;
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
export function hasHilltopClearance(
  world: WorldData,
  prop: WorldProp,
  landscape = landscapeFor(world),
): boolean {
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
          if (!landscape.isRaisedAt(Math.floor(x + dx), Math.floor(y + dy))) return false;
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
  landscape: LandscapePlan,
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
    const label = landscape.plateauAt(
      Math.floor(actor.x + f.offsetX),
      Math.floor(actor.y + f.offsetY),
    )?.id;
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
        if (landscape.plateauAt(Math.floor(x + f.offsetX), Math.floor(y + f.offsetY))?.id !== label)
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
export function prepareHilltopObjects(
  world: WorldData,
  actors: readonly Entity[] = [],
  trace: LandscapeTrace | undefined = createLandscapeTrace(),
): WorldData {
  if (world.meta.hilltopObjectsVersion === VERSION) return world;
  const { width: w, height: h } = world.meta;
  const landscape = new LandscapePlan(world, 'objects');
  let current = world;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      if (
        plateauDecoration(world.tiles[y * w + x] ?? 0, x, y, landscape.elevationMaskAt(x, y))
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
      const region = landscape.plateauAt(x, y);
      if (!region) continue;
      const reasons = new Set<string>();
      let accepted: TilePoint | null = null;
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
          landscape.plateauAt(at.x, at.y)?.id !== region.id
        ) {
          reasons.add('outside-source-plateau');
          continue;
        }
        if (
          landscape.tileAt(at.x, at.y) === Tile.STAIRS ||
          landscape.elevationMaskAt(at.x, at.y) !== 255
        ) {
          reasons.add('plateau-interior');
          continue;
        }
        if (current.props.some((p) => p.tileX === at.x && p.tileY === at.y)) {
          reasons.add('occupied-tile');
          continue;
        }
        const prop: WorldProp = {
          id,
          kind: 'rock_boulder',
          tileX: at.x,
          tileY: at.y,
          solid: true,
          hilltop: { sourceX: x, sourceY: y },
        };
        const reason = landscape.hilltopRejection(at, bounds(prop), region.id, actors);
        if (reason) {
          reasons.add(reason);
          continue;
        }
        if (!hasHilltopClearance(current, prop, landscape)) {
          reasons.add('swept-player-bypass');
          continue;
        }
        const after = { ...current, props: [...current.props, prop] };
        const moves = localActorMoves(current, after, actors, landscape);
        if (!moves) {
          reasons.add('local-actor-recovery');
          continue;
        } // Try moving the rock instead of moving an actor off its plateau.
        for (const move of moves) {
          move.actor.x = move.actor.prevX = move.x;
          move.actor.y = move.actor.prevY = move.y;
        }
        current = after;
        accepted = at;
        break;
      }
      trace?.record({
        consumer: 'hilltop',
        source: { x, y },
        at: accepted,
        outcome: !accepted
          ? 'rejected'
          : accepted.x === x && accepted.y === y
            ? 'accepted'
            : 'relocated',
        reasons: [...reasons],
      });
    }
  return attachLandscapeTrace(
    { ...current, meta: { ...current.meta, hilltopObjectsVersion: VERSION } },
    trace,
  );
}
