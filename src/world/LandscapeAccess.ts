import type { EncounterSite } from '../types/encounters';
import type { TraversalProfile } from '../types/gameplay';
import type { TilePoint, WorldBridge } from '../types/world';
import { bridgeGeometry } from './BridgeGeometry';
import { LandscapePlan } from './LandscapePlan';
import { floodFill } from './pathfinding';

/** Preserve the generator's existing 0.3-tile actor checks; movement uses its own real footbox. */
export function reachableFrom(
  plan: LandscapePlan,
  spawn: TilePoint,
  profile: TraversalProfile = 'player',
): Uint8Array {
  return floodFill(plan.source.meta, spawn, (x, y) =>
    plan.canOccupy(x + 0.5, y + 0.5, 0.3, profile),
  );
}

export function requiredBridgeAccess(plan: LandscapePlan, bridge: WorldBridge) {
  const f = bridgeGeometry(bridge).footprint,
    horizontal = bridge.orientation === 'horizontal';
  const sweeps = [0.5, 1, 1.5].map((cross) => {
    const from = {
      x: horizontal ? f.minX - 0.5 : f.minX + cross,
      y: horizontal ? f.minY + cross : f.minY - 0.5,
    };
    const to = { x: horizontal ? f.maxX + 0.5 : from.x, y: horizontal ? from.y : f.maxY + 0.5 };
    return { from, to, clear: plan.canTraverse(from, to, 0.3, 'groundEnemy') };
  });
  return {
    id: `bridge:${bridge.id}:access`,
    required: true,
    profile: 'groundEnemy',
    ok: sweeps.every((s) => s.clear),
    sweeps,
  };
}

/** Checks access across the reserved clearing, before the nest's own solid base is installed. */
export function requiredNestAccess(plan: LandscapePlan, spawn: TilePoint, nest: EncounterSite) {
  const reached = reachableFrom(plan, spawn, 'groundEnemy'),
    { width, height } = plan.source.meta;
  const reachable = reached[Math.floor(nest.y) * width + Math.floor(nest.x)] === 1;
  const exits = (
    [
      [0, -6],
      [6, 0],
      [0, 6],
      [-6, 0],
    ] as const
  ).filter(([dx, dy]) => {
    const x = Math.floor(nest.x) + dx,
      y = Math.floor(nest.y) + dy;
    return (
      x >= 0 &&
      y >= 0 &&
      x < width &&
      y < height &&
      reached[y * width + x] &&
      plan.canTraverse(nest, { x: x + 0.5, y: y + 0.5 }, 0.3, 'groundEnemy')
    );
  }).length;
  return {
    id: `${nest.id}:access`,
    required: true,
    profile: 'groundEnemy',
    reachable,
    exits,
    minimumExits: 2,
    ok: reachable && exits >= 2,
  };
}

/** Diagnostic replay of existing generation requirements, not a new placement rejection policy. */
export function inspectRequiredAccess(world: import('../types/world').WorldData) {
  const plan = new LandscapePlan({ ...world, encounterSites: [] }, 'access');
  const reached = reachableFrom(plan, world.spawn);
  return {
    objectives: [world.portal, ...world.enemySpawns, ...world.pickupSpawns].map((p) => ({
      x: p.x,
      y: p.y,
      required: true,
      reachable: reached[Math.floor(p.y) * world.meta.width + Math.floor(p.x)] === 1,
    })),
    bridges: (world.bridges ?? []).map((b) => requiredBridgeAccess(plan, b)),
    nests: (world.encounterSites ?? [])
      .filter((s) => s.kind === 'nest')
      .map((s) => requiredNestAccess(plan, world.spawn, s)),
  };
}
