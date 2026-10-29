import type { WorldData, TilePoint } from '../types/world';
import type { Entity } from '../types/entities';
import { Tile } from '../types/tiles';
import { boundsOverlap, bridgeReservations } from './BridgeGeometry';
import { propFootprint } from './ObjectSemantics';
import { siteBounds } from './EncounterPlacement';
import { canOccupy } from '../systems/CollisionSystem';
import { entityFootprint, resolveFootprint } from '../systems/EntityFootprint';
import { floodFill } from './pathfinding';
import { channelTerrain, riverDefects } from './RiverTopology';

/** Conservative one-time correction for the known v7/v8 carver. Never regenerate a save. */
export function repairSavedRivers(world: WorldData, entities: readonly Entity[]): WorldData {
  if (
    world.meta.isTutorial ||
    ![7, 8].includes(world.meta.generatorVersion) ||
    world.meta.riverRepairVersion === 1
  )
    return world;
  const { width: w, height: h } = world.meta,
    tiles = world.tiles.slice();
  const dry = new Set<number>([Tile.GRASS, Tile.MUD, Tile.FLOWERS]);
  const protectedAreas = [
    ...(world.bridges?.flatMap((b) => [...bridgeReservations(b)]) ?? []),
    ...(world.encounterSites ?? []).map((s) => siteBounds(s)),
    {
      minX: world.spawn.x - 3,
      minY: world.spawn.y - 3,
      maxX: world.spawn.x + 4,
      maxY: world.spawn.y + 4,
    },
    {
      minX: world.portal.x - 1,
      minY: world.portal.y - 1,
      maxX: world.portal.x + 2,
      maxY: world.portal.y + 2,
    },
    ...world.props.map((p) => {
      const b = propFootprint(p) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
      return {
        minX: p.tileX + b.minX,
        minY: p.tileY + b.minY,
        maxX: p.tileX + b.maxX,
        maxY: p.tileY + b.maxY,
      };
    }),
    ...entities
      .filter((e) => e.alive)
      .map((e) => {
        const f = resolveFootprint(entityFootprint(e));
        return {
          minX: e.x + f.offsetX - f.halfWidth,
          minY: e.y + f.offsetY - f.halfHeight,
          maxX: e.x + f.offsetX + f.halfWidth,
          maxY: e.y + f.offsetY + f.halfHeight,
        };
      }),
    ...[...world.enemySpawns, ...world.pickupSpawns].map((p) => ({
      minX: p.x,
      minY: p.y,
      maxX: p.x + 1,
      maxY: p.y + 1,
    })),
  ];
  const safe = (p: TilePoint) =>
    dry.has(tiles[p.y * w + p.x] ?? Tile.BORDER) &&
    !protectedAreas.some((b) =>
      boundsOverlap(b, { minX: p.x, minY: p.y, maxX: p.x + 1, maxY: p.y + 1 }),
    );
  const skipped: TilePoint[] = [],
    applied: Array<{ at: TilePoint; cells: Array<{ index: number; old: number }> }> = [];
  const candidates = riverDefects(world).map((at) => {
    const a = channelTerrain(world.tiles[at.y * w + at.x] ?? Tile.BORDER);
    return {
      at,
      cells: a
        ? [
            { x: at.x + 1, y: at.y },
            { x: at.x, y: at.y + 1 },
          ]
        : [at, { x: at.x + 1, y: at.y + 1 }],
    };
  });
  // Exactly two opposing water neighbours: a missing channel cell, not an enclosed island.
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x,
        wet = (d: number) => channelTerrain(world.tiles[i + d] ?? Tile.BORDER);
      if (
        dry.has(world.tiles[i] ?? Tile.BORDER) &&
        ((wet(-1) && wet(1) && !wet(-w) && !wet(w)) || (wet(-w) && wet(w) && !wet(-1) && !wet(1)))
      )
        candidates.push({ at: { x, y }, cells: [{ x, y }] });
    }
  const before = floodFill(world.meta, world.spawn, (x, y) =>
    canOccupy(world, x + 0.5, y + 0.5, 0.3, 'groundEnemy'),
  );
  for (const candidate of candidates) {
    const cells = candidate.cells.filter((p) => tiles[p.y * w + p.x] !== Tile.RIVER);
    if (!cells.length) continue;
    if (!cells.every(safe)) {
      skipped.push(candidate.at);
      continue;
    }
    const changed = cells.map((p) => ({
      index: p.y * w + p.x,
      old: tiles[p.y * w + p.x] ?? Tile.BORDER,
    }));
    for (const c of changed) tiles[c.index] = Tile.RIVER;
    applied.push({ at: candidate.at, cells: changed });
  }
  const proposed = { ...world, tiles };
  // Preserve every existing reachable dry cell, a stronger condition than checking actors alone.
  const after = floodFill(world.meta, world.spawn, (x, y) =>
    canOccupy(proposed, x + 0.5, y + 0.5, 0.3, 'groundEnemy'),
  );
  if (before.some((v, i) => v && tiles[i] !== Tile.RIVER && !after[i])) {
    for (const patch of applied) {
      for (const c of patch.cells) tiles[c.index] = c.old;
      skipped.push(patch.at);
    }
  }
  return {
    ...world,
    tiles,
    meta: { ...world.meta, riverRepairVersion: 1, riverRepairSkipped: skipped },
  };
}
