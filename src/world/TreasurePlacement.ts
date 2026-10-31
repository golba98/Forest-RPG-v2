import type { PickupSpawn, WorldData } from '../types/world';
import { Tile } from '../types/tiles';
import { canOccupy, hasClearPath } from '../systems/CollisionSystem';
import { PLAYER_FOOTPRINT } from '../systems/EntityFootprint';
import { intersectsBridgeReservation } from './BridgeGeometry';
import { floodFill } from './pathfinding';
import { Rng } from './Rng';

/** A final independent stream: never moves existing scenery or consumes combat RNG. */
export function placeTreasure(world: WorldData): WorldData {
  if (world.meta.isTutorial) return world;
  const { width, height } = world.meta;
  const open = new Uint8Array(width * height);
  const prefix = new Int32Array((width + 1) * (height + 1));
  const pitch = width + 1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      open[i] = canOccupy(world, x + 0.5, y + 0.5, PLAYER_FOOTPRINT) ? 1 : 0;
      const blocked = world.tiles[i] !== Tile.GRASS || !open[i] ? 1 : 0;
      const j = (y + 1) * pitch + x + 1;
      prefix[j] =
        blocked + (prefix[j - 1] ?? 0) + (prefix[j - pitch] ?? 0) - (prefix[j - pitch - 1] ?? 0);
    }
  const reachable = floodFill(world.meta, world.spawn, (x, y) => open[y * width + x] === 1);
  const candidates: number[] = [];
  const spawns = [...world.enemySpawns, ...world.pickupSpawns];
  for (let y = 3; y < height - 3; y++)
    for (let x = 3; x < width - 3; x++) {
      if (
        !reachable[y * width + x] ||
        Math.hypot(x - world.spawn.x, y - world.spawn.y) < 9 ||
        Math.hypot(x - world.portal.x, y - world.portal.y) < 5
      )
        continue;
      if (
        intersectsBridgeReservation(world.bridges ?? [], {
          minX: x - 2,
          minY: y - 2,
          maxX: x + 3,
          maxY: y + 3,
        })
      )
        continue;
      if ((world.encounterSites ?? []).some((s) => Math.hypot(s.x - x, s.y - y) < 9)) continue;
      if (spawns.some((s) => Math.hypot(s.x - x, s.y - y) < 3)) continue;
      const clear =
        (prefix[(y + 3) * pitch + x + 3] ?? 0) -
          (prefix[(y - 2) * pitch + x + 3] ?? 0) -
          (prefix[(y + 3) * pitch + x - 2] ?? 0) +
          (prefix[(y - 2) * pitch + x - 2] ?? 0) ===
        0;
      if (clear && hasClearPath(world, x - 1, y + 1.5, x + 2, y + 1.5, PLAYER_FOOTPRINT))
        candidates.push(y * width + x);
    }
  const chosen: PickupSpawn[] = [];
  for (const i of new Rng(world.meta.seed ^ 0x74726561).shuffle(candidates)) {
    const x = i % width,
      y = Math.floor(i / width);
    if (chosen.some((c) => Math.hypot(c.x - x, c.y - y) < 20)) continue;
    const ring = [
      [x - 0.5, y - 0.5],
      [x + 1.5, y - 0.5],
      [x + 1.5, y + 1.5],
      [x - 0.5, y + 1.5],
    ] as const;
    if (
      !ring.every(([ax, ay], i) => {
        const next = ring[(i + 1) % ring.length];
        return next && hasClearPath(world, ax, ay, next[0], next[1], PLAYER_FOOTPRINT);
      })
    )
      continue;
    chosen.push({
      type: 'chest',
      id: `chest:${x}:${y}`,
      x,
      y,
      chestVariant: chosen.length === 3 ? 'reinforced' : 'wooden',
    });
    if (chosen.length === 4) break;
  }
  return { ...world, pickupSpawns: [...world.pickupSpawns, ...chosen] };
}
