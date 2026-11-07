import { BIOME_IDS, type BiomeId } from '../Biomes';
import type { WorldData } from '../../types/world';
import { Tile, isHillTile } from '../../types/tiles';
import { elevationAt, isRaisedSurface } from '../ElevationTopology';
import { canOccupy, hasClearPath } from '../../systems/CollisionSystem';
import { PLAYER_FOOTPRINT } from '../../systems/EntityFootprint';
import type { InfiniteSession } from './InfiniteSession';

/** Search generated, edited terrain with the same footprint and swept movement as play. */
export async function findBiomeLanding(
  session: InfiniteSession,
  biome: BiomeId,
  current?: WorldData,
) {
  const index = BIOME_IDS.indexOf(biome),
    geography = session.generator.geography;
  if (index < 0 || !geography) throw new Error('This world does not support biome travel');
  const center = session.landings[biome] ?? geography.anchors.find((a) => a.biome === index)!;
  for (const [dx, dy] of [
    [0, 0],
    [96, 0],
    [-96, 0],
    [0, 96],
    [0, -96],
  ]) {
    await session.prepareAt(center.x + dx!, center.y + dy!);
    const world = await session.stageWindow(current, () => true),
      origin = world.window!;
    const nearbySlope = new Uint8Array(world.tiles.length);
    if (session.descriptor.generatorVersion >= 15)
      for (let y = 8; y < world.meta.height - 8; y++)
        for (let x = 8; x < world.meta.width - 8; x++) {
          if (world.tiles[y * world.meta.width + x] !== Tile.STAIRS) continue;
          for (let oy = -7; oy <= 7; oy++)
            for (let ox = -7; ox <= 7; ox++)
              if (ox * ox + oy * oy <= 49) {
                const i = (y + oy) * world.meta.width + x + ox;
                const southFacing = elevationAt(world, x, y+1) < elevationAt(world, x, y);
                nearbySlope[i] = Math.max(nearbySlope[i]!, (southFacing && oy >= 1 ? 2 : 1) + (elevationAt(world,x,y) > 1 ? 2 : 0));
              }
        }
    const candidates: { x: number; y: number; distance: number }[] = [];
    for (let y = 24; y < world.meta.height - 24; y += 2)
      for (let x = 24; x < world.meta.width - 24; x += 2) {
        const i = y * world.meta.width + x;
        if (world.environment?.biome[i] !== index || world.environment.blend[i]! > 45) continue;
        if (world.tiles[i] === Tile.RIVER || world.tiles[i] === Tile.SHALLOW_WATER) continue;
        const p = { x: x + 0.5, y: y + 0.5 };
        if (canOccupy(world, p.x, p.y, PLAYER_FOOTPRINT)) {
          let scenery = false;
          if (index === 2 || index === 3)
            for (let oy = -7; oy <= 7; oy++)
              for (let ox = -7; ox <= 7; ox++) {
                const t = world.tiles[(y + oy) * world.meta.width + x + ox];
                if (
                  (index === 2 &&
                    t !== undefined &&
                    isHillTile(t as import('../../types/tiles').TileId)) ||
                  (index === 3 && (t === Tile.RIVER || t === Tile.SHALLOW_WATER))
                )
                  scenery = true;
              }
          candidates.push({
            ...p,
            distance:
              (p.x + origin.originX - center.x) ** 2 +
              (p.y + origin.originY - center.y) ** 2 +
              ((index === 2 || index === 3) && !scenery ? 18000 : 0) +
              (session.descriptor.generatorVersion >= 15
                ? ((nearbySlope[i] ?? 0) >= 3 ? -22000 : nearbySlope[i] === 2 ? 0 : nearbySlope[i] ? 5000 : 25000) +
                  (isRaisedSurface(world.tiles[i]!) ? 10000 : 0)
                : 0),
          });
        }
      }
    candidates.sort((a, b) => a.distance - b.distance);
    for (const p of candidates.slice(0, 48)) {
      const queue: { x: number; y: number }[] = [p],
        visited = new Set([`${p.x},${p.y}`]);
      for (let i = 0; i < queue.length && queue.length < 100; i++) {
        const at = queue[i]!;
        for (const [sx, sy] of [
          [0, 1],
          [1, 0],
          [0, -1],
          [-1, 0],
        ]) {
          const next = { x: at.x + sx!, y: at.y + sy! },
            key = `${next.x},${next.y}`;
          if (visited.has(key) || Math.abs(next.x - p.x) > 14 || Math.abs(next.y - p.y) > 14)
            continue;
          visited.add(key);
          if (
            canOccupy(world, next.x, next.y, PLAYER_FOOTPRINT) &&
            hasClearPath(world, at.x, at.y, next.x, next.y, PLAYER_FOOTPRINT, 'player')
          )
            queue.push(next);
        }
      }
      if (queue.length < 80) continue;
      const position = { x: p.x + origin.originX, y: p.y + origin.originY };
      session.landings[biome] = position;
      return { position, world: { ...world, spawn: { x: Math.floor(p.x), y: Math.floor(p.y) } } };
    }
  }
  throw new Error(`No accessible ${biome} landing could be prepared`);
}
