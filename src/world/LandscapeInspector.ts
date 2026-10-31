import { PLAYER_FOOTPRINT } from '../systems/EntityFootprint';
import { Tile } from '../types/tiles';
import type { WorldData, WorldProp } from '../types/world';
import { hasHilltopClearance } from './HilltopObjects';
import { inspectRequiredAccess } from './LandscapeAccess';
import { landscapeFor } from './LandscapePlan';
import { landscapeTrace } from './LandscapeTrace';
import { propFootprint } from './ObjectSemantics';
import { appliedMigrations } from './WorldCompatibility';

/** On-demand debug query. Coordinates are continuous ground contact in tile units. */
export function inspectLandscape(world: WorldData, x: number, y: number, includeAccess = false) {
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new Error('Landscape coordinates must be finite tile units');
  const plan = landscapeFor(world),
    at = { x: Math.floor(x), y: Math.floor(y) };
  const surface = plan.surfaceAt(x, y);
  const existing = world.props.find((p) => p.hilltop && p.tileX === at.x && p.tileY === at.y);
  const prop: WorldProp = existing ?? {
    id: 1_000_000 + at.y * world.meta.width + at.x,
    kind: 'rock_boulder',
    solid: true,
    tileX: at.x,
    tileY: at.y,
    hilltop: { sourceX: at.x, sourceY: at.y },
  };
  const footprint = propFootprint(prop)!;
  const bounds = {
    minX: at.x + footprint.minX,
    minY: at.y + footprint.minY,
    maxX: at.x + footprint.maxX,
    maxY: at.y + footprint.maxY,
  };
  const baseline = existing
    ? { ...world, props: world.props.filter((p) => p !== existing) }
    : world;
  let reason =
    !surface.plateau ||
    plan.tileAt(at.x, at.y) === Tile.STAIRS ||
    plan.elevationMaskAt(at.x, at.y) !== 255
      ? 'plateau-interior'
      : null;
  reason ??= baseline.props.some((p) => p.tileX === at.x && p.tileY === at.y)
    ? 'occupied-tile'
    : null;
  reason ??= surface.plateau ? plan.hilltopRejection(at, bounds, surface.plateau.id) : null;
  reason ??= !reason && !hasHilltopClearance(baseline, prop, plan) ? 'swept-player-bypass' : null;
  const trace = landscapeTrace(world);
  return {
    units: 'tiles',
    stage: plan.stage,
    generatorVersion: world.meta.generatorVersion,
    appliedMigrations: appliedMigrations(world.meta),
    at,
    surface,
    reservations: plan
      .reservations()
      .filter(
        (r) => x >= r.bounds.minX && x < r.bounds.maxX && y >= r.bounds.minY && y < r.bounds.maxY,
      ),
    playerFits: plan.canOccupy(
      x - PLAYER_FOOTPRINT.offsetX,
      y - PLAYER_FOOTPRINT.offsetY,
      PLAYER_FOOTPRINT,
    ),
    placement: {
      hypothetical: true,
      hilltop: {
        accepted: reason === null,
        reason,
        bounds,
        existing: existing ? { source: existing.hilltop, at } : null,
      },
      woodlandProtection: {
        accepted: plan.woodlandRejection(at) === null,
        reason: plan.woodlandRejection(at),
        includesRandomDensityOrSpacing: false,
      },
    },
    trace: trace
      ? {
          ...trace,
          entries: trace.entries.filter(
            (e) =>
              (Math.abs(e.source.x - at.x) <= 2 && Math.abs(e.source.y - at.y) <= 2) ||
              (e.at && Math.abs(e.at.x - at.x) <= 2 && Math.abs(e.at.y - at.y) <= 2),
          ),
        }
      : null,
    requiredAccess: includeAccess ? inspectRequiredAccess(world) : null,
  };
}
export type LandscapeInspection = ReturnType<typeof inspectLandscape>;

/** The terminal stays compact; the gateway exposes the complete structured result. */
export function formatLandscapeInspection(info: LandscapeInspection): string {
  const { surface, placement, trace } = info;
  const bounds = (b: import('../types/gameplay').Bounds) =>
    `[${b.minX.toFixed(3)},${b.minY.toFixed(3)} .. ${b.maxX.toFixed(3)},${b.maxY.toFixed(3)}]`;
  const lines = [
    `Landscape (${info.at.x}, ${info.at.y}) — tiles; ${info.stage}; generator ${info.generatorVersion}`,
    `Surface ${surface.kind}; elevation ${surface.elevation}; tile ${surface.tile}; player fits ${info.playerFits ? 'yes' : 'no'}`,
    `Plateau ${surface.plateau?.id ?? 'none'}; water ${surface.water?.id ?? 'none'}; decks ${surface.bridgeDecks.map((b) => b.id).join(', ') || 'none'}`,
    `Cliff rectangles ${surface.cliffBounds.length}; stair direction ${surface.stairDirection ?? 'none'}`,
    ...info.reservations.slice(0, 8).map((r) => `Protected ${r.id} ${bounds(r.bounds)}`),
    `Hilltop hypothetical: ${placement.hilltop.accepted ? 'accepted' : `rejected: ${placement.hilltop.reason}`}; footprint ${bounds(placement.hilltop.bounds)}`,
    `Woodland protection: ${placement.woodlandProtection.accepted ? 'accepted' : `rejected: ${placement.woodlandProtection.reason}`} (density/spacing not evaluated)`,
    `Applied migrations: ${info.appliedMigrations.join(', ') || 'none'}`,
  ];
  if (info.reservations.length > 8)
    lines.push(
      `Additional protections: ${info.reservations.length - 8}; inspect the query API for all bounds.`,
    );
  const existing = placement.hilltop.existing;
  if (existing?.source)
    lines.push(
      `Existing hilltop source (${existing.source.sourceX},${existing.source.sourceY}) → (${existing.at.x},${existing.at.y})`,
    );
  if (trace) {
    for (const kind of ['woodland', 'hilltop'] as const) {
      const c = trace.counts[kind];
      lines.push(
        `Recorded ${kind}: ${c.accepted} accepted, ${c.relocated} relocated, ${c.rejected} rejected`,
      );
    }
    for (const e of trace.entries.slice(0, 4))
      lines.push(
        `${e.consumer} (${e.source.x},${e.source.y}) ${e.outcome}: ${e.reasons.join(', ') || 'clear'}`,
      );
  } else lines.push('Recorded trace unavailable after reload; current checks shown above.');
  if (info.requiredAccess)
    lines.push(
      `Required access: ${info.requiredAccess.objectives.filter((p) => p.reachable).length}/${info.requiredAccess.objectives.length} objectives; ${info.requiredAccess.bridges.filter((b) => b.ok).length}/${info.requiredAccess.bridges.length} bridges; ${info.requiredAccess.nests.filter((n) => n.ok).length}/${info.requiredAccess.nests.length} nests`,
    );
  return lines.join('\n');
}
