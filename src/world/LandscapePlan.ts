import type { Entity } from '../types/entities';
import type { Bounds, CollisionFootprint, TraversalProfile } from '../types/gameplay';
import { Tile } from '../types/tiles';
import type { TilePoint, WorldData, WorldPosition } from '../types/world';
import { canOccupy, hasClearPath, type CollisionWorld } from '../systems/CollisionSystem';
import { surfaceAt } from '../systems/SurfaceState';
import { boundsOverlap, bridgeAtTile, bridgeGeometry, bridgeReservations } from './BridgeGeometry';
import { siteBounds } from './EncounterPlacement';
import { elevationMask, isRaisedSurface, stairsDirection } from './ElevationTopology';
import { cachedHillBounds } from './HillCollisionGeometry';
import { LandscapeRegions } from './LandscapeRegions';
import { channelTerrain } from './RiverTopology';

/** Borrowed authoritative state, including only facts available at this stage. */
export type LandscapeSource = CollisionWorld &
  Partial<Pick<WorldData, 'spawn' | 'portal' | 'enemySpawns' | 'pickupSpawns'>>;
export type LandscapeStage = 'woodland' | 'access' | 'objects' | 'final';
export interface LandscapeReservation {
  readonly id: string;
  readonly kind:
    | 'stair'
    | 'bridge'
    | 'encounter'
    | 'spawn'
    | 'portal'
    | 'enemy-spawn'
    | 'pickup-spawn'
    | 'summit';
  readonly bounds: Bounds;
}

const around = (p: TilePoint, radius: number): Bounds => ({
  minX: p.x - radius,
  minY: p.y - radius,
  maxX: p.x + radius + 1,
  maxY: p.y + radius + 1,
});

/** Read-only derived queries, not a second terrain model. Discard at generation mutation boundaries. */
export class LandscapePlan {
  private plateauRegions?: LandscapeRegions;
  private waterRegions?: LandscapeRegions;
  private summitPoints?: ReadonlyMap<string, TilePoint>;
  private readonly protections: readonly LandscapeReservation[];
  private readonly stairs: readonly TilePoint[];
  private readonly points: readonly WorldPosition[];

  constructor(
    readonly source: LandscapeSource,
    readonly stage: LandscapeStage,
  ) {
    const { width } = source.meta;
    const stairs: TilePoint[] = [],
      protections: LandscapeReservation[] = [];
    for (let i = 0; i < source.tiles.length; i++)
      if (source.tiles[i] === Tile.STAIRS) {
        const at = { x: i % width, y: Math.floor(i / width) };
        stairs.push(at);
        protections.push({ id: `stair:${at.x},${at.y}`, kind: 'stair', bounds: around(at, 2) });
      }
    for (const b of source.bridges ?? [])
      bridgeReservations(b).forEach((bounds, i) =>
        protections.push({
          id: `bridge:${b.id}:${i === 0 ? 'footprint' : `approach-${i}`}`,
          kind: 'bridge',
          bounds,
        }),
      );
    for (const s of source.encounterSites ?? [])
      protections.push({ id: s.id, kind: 'encounter', bounds: siteBounds(s) });
    const pointGroups = [
      ['spawn', source.spawn ? [source.spawn] : []],
      ['portal', source.portal ? [source.portal] : []],
      ['enemy-spawn', source.enemySpawns ?? []],
      ['pickup-spawn', source.pickupSpawns ?? []],
    ] as const;
    const points: WorldPosition[] = [];
    for (const [kind, group] of pointGroups)
      for (const p of group) {
        points.push(p);
        protections.push({
          id: `${kind}:${p.x},${p.y}`,
          kind,
          bounds: { minX: p.x - 1.5, minY: p.y - 1.5, maxX: p.x + 1.5, maxY: p.y + 1.5 },
        });
      }
    this.stairs = stairs;
    this.points = points;
    // Legacy spawn descriptors may share a coordinate; they protect one logical area.
    this.protections = [...new Map(protections.map((r) => [r.id, r])).values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
  }

  tileAt(x: number, y: number): number {
    const { width, height } = this.source.meta;
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height
      ? (this.source.tiles[y * width + x] ?? Tile.BORDER)
      : Tile.BORDER;
  }
  isRaisedAt(x: number, y: number): boolean {
    return isRaisedSurface(this.tileAt(x, y));
  }
  elevationMaskAt(x: number, y: number): number {
    return elevationMask(this.source.tiles, this.source.meta.width, this.source.meta.height, x, y);
  }
  plateauAt(x: number, y: number) {
    this.plateauRegions ??= new LandscapeRegions(this.source, 'plateau', isRaisedSurface);
    return this.plateauRegions.at(x, y);
  }
  waterAt(x: number, y: number) {
    this.waterRegions ??= new LandscapeRegions(this.source, 'water', channelTerrain);
    return this.waterRegions.at(x, y);
  }
  summits(): ReadonlyMap<string, TilePoint> {
    this.plateauAt(0, 0);
    this.summitPoints ??= this.plateauRegions!.summits();
    return this.summitPoints;
  }
  /** Continuous ground-contact position in tiles; bridge support overrides underlying water. */
  surfaceAt(x: number, y: number) {
    const tx = Math.floor(x),
      ty = Math.floor(y),
      tile = this.tileAt(tx, ty);
    const mask = this.elevationMaskAt(tx, ty);
    const support = surfaceAt(this.source, x, y);
    const bridge = support.kind === 'deck' ? bridgeAtTile(this.source, tx, ty) : undefined;
    return {
      ...support,
      tile,
      elevation: Number(isRaisedSurface(tile)),
      plateau: this.plateauAt(tx, ty),
      water: this.waterAt(tx, ty),
      cliffBounds: isRaisedSurface(tile)
        ? cachedHillBounds(tile, mask).map((b) => ({
            minX: tx + b.minX,
            maxX: tx + b.maxX,
            minY: ty + b.minY,
            maxY: ty + b.maxY,
          }))
        : [],
      stairDirection: tile === Tile.STAIRS ? stairsDirection(mask) : null,
      bridgeDecks: bridge ? [{ id: bridge.id, bounds: bridgeGeometry(bridge).deck }] : [],
    };
  }
  reservations(): readonly LandscapeReservation[] {
    return [
      ...this.protections,
      ...[...this.summits()].map(([id, at]) => ({
        id: `summit:${id}`,
        kind: 'summit' as const,
        bounds: around(at, 1),
      })),
    ];
  }
  conflicts(
    area: Bounds,
    kinds: readonly LandscapeReservation['kind'][],
  ): readonly LandscapeReservation[] {
    return this.protections.filter((r) => kinds.includes(r.kind) && boundsOverlap(area, r.bounds));
  }
  protectedStairAt(at: TilePoint): boolean {
    return this.stairs.some((p) => Math.abs(p.x - at.x) <= 2 && Math.abs(p.y - at.y) <= 2);
  }
  /** Legacy woodland protection only; random density/spacing remains owned by woodland. */
  woodlandRejection(at: TilePoint): string | null {
    const area = { minX: at.x - 1, minY: at.y - 1, maxX: at.x + 2, maxY: at.y + 1 };
    const conflict = this.conflicts(area, ['encounter', 'bridge'])[0];
    if (conflict) return conflict.id;
    if (this.protectedStairAt(at)) return 'stair-approach';
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const t = this.tileAt(at.x + dx, at.y + dy);
        if (t === Tile.RAMP || t === Tile.LOG) return 'legacy-crossing';
      }
    return null;
  }
  hilltopRejection(
    at: TilePoint,
    footprint: Bounds,
    regionId: string,
    actors: readonly Entity[] = [],
  ): string | null {
    const conflict = this.conflicts(footprint, ['bridge', 'encounter'])[0];
    if (conflict) return conflict.id;
    if (this.protectedStairAt(at)) return 'stair-approach';
    const summit = this.summits().get(regionId);
    if (summit && Math.abs(summit.x - at.x) <= 1 && Math.abs(summit.y - at.y) <= 1) return 'summit';
    if (
      [...this.points, ...actors.filter((a) => a.kind === 'pickup' || a.kind === 'portal')].some(
        (p) => Math.abs(p.x - at.x) < 1.5 && Math.abs(p.y - at.y) < 1.5,
      )
    )
      return 'gameplay-position';
    return null;
  }
  /** Continuous actor anchor in tiles; shape supplies the physical ground-contact offset. */
  canOccupy(
    x: number,
    y: number,
    shape: number | CollisionFootprint,
    profile: TraversalProfile = 'player',
  ): boolean {
    return canOccupy(this.source, x, y, shape, profile);
  }
  canTraverse(
    from: WorldPosition,
    to: WorldPosition,
    shape: number | CollisionFootprint,
    profile: TraversalProfile = 'player',
  ): boolean {
    return hasClearPath(this.source, from.x, from.y, to.x, to.y, shape, profile);
  }
}

const plans = new WeakMap<WorldData, LandscapePlan>();
/** Final worlds retain a derived view; constructing it does not eagerly build region maps. */
export function landscapeFor(world: WorldData): LandscapePlan {
  let plan = plans.get(world);
  if (!plan) {
    plan = new LandscapePlan(world, 'final');
    plans.set(world, plan);
  }
  return plan;
}
/** Call after in-place terrain, reservation, bridge, or object changes. Never reruns placement. */
export function invalidateLandscape(world: WorldData): void {
  plans.delete(world);
}
