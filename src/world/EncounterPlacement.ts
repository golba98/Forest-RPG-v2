import { ENCOUNTER_CONFIG as C } from '../config/EncounterConfig';
import type { EncounterSite } from '../types/encounters';
import type { Bounds } from '../types/gameplay';
import { Tile } from '../types/tiles';
import type { Entity } from '../types/entities';
import type { TilePoint, WorldData } from '../types/world';
import { boundsOverlap, bridgeReservations } from './BridgeGeometry';
import { canOccupy } from '../systems/CollisionSystem';
import { floodFill } from './pathfinding';
import { Rng } from './Rng';
import type { GenGrid } from './generation/GenGrid';

export function siteBounds(site: Pick<EncounterSite, 'x' | 'y'>, radius = 5): Bounds {
  return {
    minX: Math.floor(site.x) - radius,
    minY: Math.floor(site.y) - radius,
    maxX: Math.floor(site.x) + radius + 1,
    maxY: Math.floor(site.y) + radius + 1,
  };
}
export function intersectsReservations(area: Bounds, reservations: readonly Bounds[]): boolean {
  return reservations.some((r) => boundsOverlap(area, r));
}
export function siteId(
  seed: number,
  level: number,
  kind: EncounterSite['kind'],
  index: number,
): string {
  return `encounter:${seed}:${level}:${kind}:${index}`;
}
export function clearNestReservation(grid: GenGrid, site: EncounterSite): void {
  const b = siteBounds(site);
  for (let y = b.minY; y < b.maxY; y++)
    for (let x = b.minX; x < b.maxX; x++) grid.set(x, y, Tile.GRASS);
}

/** Integral obstacle mask makes a whole clearing check constant-time per candidate. */
function clearSquares(
  width: number,
  height: number,
  radius: number,
  clear: (x: number, y: number) => boolean,
): TilePoint[] {
  const stride = width + 1,
    sums = new Int32Array(stride * (height + 1));
  const sum = (x: number, y: number) => sums[y * stride + x] ?? 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y + 1) * stride + x + 1;
      sums[i] = (clear(x, y) ? 0 : 1) + sum(x, y + 1) + sum(x + 1, y) - sum(x, y);
    }
  const candidates: TilePoint[] = [];
  for (let y = radius + 1; y < height - radius - 1; y++)
    for (let x = radius + 1; x < width - radius - 1; x++) {
      const x0 = x - radius,
        y0 = y - radius,
        x1 = x + radius + 1,
        y1 = y + radius + 1;
      if (sum(x1, y1) - sum(x1, y0) - sum(x0, y1) + sum(x0, y0) === 0) candidates.push({ x, y });
    }
  return candidates;
}

/** Reserve low ground before hills/props, without cutting or filling any river. */
export function reserveNest(
  grid: GenGrid,
  spawn: TilePoint,
  seed: number,
  level: number,
  rng: Rng,
): EncounterSite | null {
  const distance = Math.min(24, Math.max(12, Math.floor(Math.min(grid.width, grid.height) * 0.3)));
  const dry = new Set<number>([Tile.GRASS, Tile.FOREST, Tile.FLOWERS, Tile.MUD]);
  const candidates = clearSquares(grid.width, grid.height, 5, (x, y) => dry.has(grid.get(x, y)));
  const chosen = rng
    .shuffle(candidates)
    .find((p) => Math.hypot(p.x - spawn.x, p.y - spawn.y) >= distance);
  return chosen
    ? { id: siteId(seed, level, 'nest', 0), kind: 'nest', x: chosen.x + 0.5, y: chosen.y + 0.5 }
    : null;
}

export function isManifestationGround(world: WorldData, x: number, y: number): boolean {
  const tx = Math.floor(x),
    ty = Math.floor(y);
  if (tx < 1 || ty < 1 || tx >= world.meta.width - 1 || ty >= world.meta.height - 1) return false;
  const tile = world.tiles[ty * world.meta.width + tx];
  if (tile !== Tile.GRASS && tile !== Tile.MUD && tile !== Tile.FLOWERS) return false;
  const area = { minX: x - 1, minY: y - 1, maxX: x + 1, maxY: y + 1 };
  if (world.bridges?.some((b) => bridgeReservations(b).some((r) => boundsOverlap(area, r))))
    return false;
  return canOccupy(world, x, y, 0.3, 'groundEnemy');
}

function existingCandidates(world: WorldData, radius: number): TilePoint[] {
  const { width, height } = world.meta;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      mask[y * width + x] = isManifestationGround(world, x + 0.5, y + 0.5) ? 1 : 0;
  const reachable = floodFill(
    world.meta,
    { x: Math.floor(world.spawn.x), y: Math.floor(world.spawn.y) },
    (x, y) => canOccupy(world, x + 0.5, y + 0.5, 0.3, 'groundEnemy'),
  );
  return clearSquares(width, height, radius, (x, y) => mask[y * width + x] === 1).filter(
    (p) =>
      reachable[p.y * width + p.x] &&
      Math.hypot(p.x - world.spawn.x, p.y - world.spawn.y) >= 12 &&
      Math.hypot(p.x - world.portal.x, p.y - world.portal.y) >= radius + 4,
  );
}

export function placeGroves(world: WorldData, nests: readonly EncounterSite[]): EncounterSite[] {
  const target = Math.min(
    C.ghosts.maxGroves,
    Math.max(1, Math.floor(world.tiles.length / C.ghosts.tilesPerGrove)),
  );
  const candidates = Rng.derive(world.meta.seed, `groves:${world.meta.level}`).shuffle(
    existingCandidates(world, 3),
  );
  const sites: EncounterSite[] = [];
  for (const p of candidates) {
    if (
      [...nests, ...sites].some(
        (s) => Math.hypot(s.x - p.x - 0.5, s.y - p.y - 0.5) < C.ghosts.siteSpacing,
      )
    )
      continue;
    // Existing trees nearby give the grove a woodland setting without introducing obstacles.
    if (
      !world.props.some(
        (prop) => prop.kind === 'tree' && Math.hypot(prop.tileX - p.x, prop.tileY - p.y) <= 9,
      )
    )
      continue;
    sites.push({
      id: siteId(world.meta.seed, world.meta.level, 'grove', sites.length),
      kind: 'grove',
      x: p.x + 0.5,
      y: p.y + 0.5,
    });
    if (sites.length >= target) break;
  }
  return sites;
}

/** Missing definitions are derived once on existing terrain; never regenerate a loaded map. */
// Encounter compatibility stays fixed when unrelated terrain generation advances.
const ENCOUNTER_GENERATOR_VERSION = 8;

export function prepareEncounterWorld(
  world: WorldData,
  entities: readonly Entity[] = [],
): WorldData {
  if (world.encounterSites !== undefined || world.meta.isTutorial) return world;
  const oldBoss =
    entities.find((e) => e.kind === 'enemy' && e.enemyType === 'beetle') ??
    world.enemySpawns.find((e) => e.type === 'beetle');
  if (!oldBoss && (world.meta.width < 32 || world.meta.generatorVersion >= ENCOUNTER_GENERATOR_VERSION))
    return { ...world, encounterSites: [] };
  const candidates = existingCandidates(world, 4);
  const oldPoint = oldBoss
    ? { x: oldBoss.x + ('type' in oldBoss ? 0.5 : 0), y: oldBoss.y + ('type' in oldBoss ? 0.5 : 0) }
    : null;
  const fallback =
    oldPoint && canOccupy(world, oldPoint.x, oldPoint.y, 0.3, 'groundEnemy') ? oldPoint : null;
  if (oldPoint)
    candidates.sort(
      (a, b) =>
        Math.hypot(a.x + 0.5 - oldPoint.x, a.y + 0.5 - oldPoint.y) -
        Math.hypot(b.x + 0.5 - oldPoint.x, b.y + 0.5 - oldPoint.y),
    );
  else Rng.derive(world.meta.seed, 'legacy-nest').shuffle(candidates);
  const chosen = candidates[0];
  // An existing fight must not acquire a distant home and immediately leash/reset.
  const near =
    chosen &&
    (!fallback ||
      Math.hypot(chosen.x + 0.5 - fallback.x, chosen.y + 0.5 - fallback.y) <=
        C.boss.discoveryRadius);
  const point = chosen && near ? { x: chosen.x + 0.5, y: chosen.y + 0.5 } : fallback;
  const nests: EncounterSite[] = point
    ? [
        {
          id: siteId(world.meta.seed, world.meta.level, 'nest', 0),
          kind: 'nest',
          x: point.x,
          y: point.y,
          legacy: true,
        },
      ]
    : [];
  return {
    ...world,
    encounterSites: [...nests, ...(world.meta.width >= 32 ? placeGroves(world, nests) : [])],
  };
}
