import { BIOMES, type WorldEnvironment } from '../Biomes';
import { coordinateRandom } from '../Geography';
import { Tile } from '../../types/tiles';
import type { TilePoint, WorldProp } from '../../types/world';
import { LandscapePlan } from '../LandscapePlan';
import type { LandscapeTrace } from '../LandscapeTrace';
import type { GenGrid } from './GenGrid';
import type { Rng } from '../Rng';

/** Forest regions become discrete trunks with traversable space between them. */
export function placeWoodland(
  grid: GenGrid,
  rng: Rng,
  spawn: TilePoint,
  landscape = new LandscapePlan({ meta: grid, tiles: grid.tiles, props: [], spawn }, 'woodland'),
  trace?: LandscapeTrace,
  environment?: WorldEnvironment,
  seed = 0,
): WorldProp[] {
  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = 1; y < grid.height - 1; y++)
    for (let x = 1; x < grid.width - 1; x++) {
      const tile = grid.get(x, y);
      if (tile === Tile.FOREST) {
        candidates.push({ x, y });
        grid.set(x, y, Tile.GRASS);
      } else if (
        (tile === Tile.GRASS || (environment && tile === Tile.PLATEAU)) &&
        Math.hypot(x - spawn.x, y - spawn.y) > 5 &&
        (environment
          ? coordinateRandom(seed, x, y, 91) < environment.cover[y * grid.width + x]! / 255
          : rng.chance(0.018))
      )
        candidates.push({ x, y });
    }
  const trees: WorldProp[] = [];
  const occupied = new Set<number>();
  for (const p of environment
    ? candidates.sort(
        (a, b) => coordinateRandom(seed, a.x, a.y, 92) - coordinateRandom(seed, b.x, b.y, 92),
      )
    : rng.shuffle(candidates)) {
    const reason = landscape.woodlandRejection(p, {
      minX: p.x - 1,
      minY: p.y - 3,
      maxX: p.x + 2,
      maxY: p.y + 1.5,
    });
    if (reason) {
      trace?.record({
        consumer: 'woodland',
        source: p,
        at: null,
        outcome: 'rejected',
        reasons: [reason],
      });
      continue;
    }
    let near = false;
    // Native LPC crowns reach three tiles above their roots. Keep the entire
    // canopy clear of stairs and landings; roots retain the existing footprint.
    for (let dy = -3; dy <= 2 && !near; dy++)
      for (let dx = -2; dx <= 2; dx++)
        if (grid.inBounds(p.x + dx, p.y + dy) && grid.get(p.x + dx, p.y + dy) === Tile.STAIRS)
          near = true;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy < 5 && occupied.has((p.y + dy) * grid.width + p.x + dx)) near = true;
      }
    if (near) {
      trace?.record({
        consumer: 'woodland',
        source: p,
        at: null,
        outcome: 'rejected',
        reasons: ['tree-spacing'],
      });
      continue;
    }
    occupied.add(p.y * grid.width + p.x);
    trees.push({
      id: trees.length,
      kind: 'tree',
      tileX: p.x,
      tileY: p.y,
      solid: true,
      ...(environment
        ? {
            variant: treeVariant(environment, grid.width, p.x, p.y, seed),
            featureKey: `tree:${p.x},${p.y}`,
          }
        : {}),
    });
    trace?.record({ consumer: 'woodland', source: p, at: p, outcome: 'accepted', reasons: [] });
  }
  return trees;
}

function treeVariant(
  env: WorldEnvironment,
  width: number,
  x: number,
  y: number,
  seed: number,
): number {
  const i = y * width + x;
  const biome =
    coordinateRandom(seed, x, y, 94) < (env.blend[i] ?? 0) / 255
      ? (env.secondary[i] ?? 0)
      : (env.biome[i] ?? 0);
  const species = BIOMES[biome]?.trees ?? [12];
  // Old growth occupies moist, sheltered groves; saplings form the open edge.
  if (
    biome === 0 &&
    (env.cover[i] ?? 0) > 85 &&
    (env.moisture[i] ?? 0) > 130 &&
    coordinateRandom(seed, x, y, 96) < 0.75
  )
    return coordinateRandom(seed, x, y, 95) > 0.5 ? 11 : 0;
  if (biome === 0 && (env.cover[i] ?? 0) < 40)
    return coordinateRandom(seed, x, y, 95) > 0.5 ? 12 : 13;
  return species[Math.floor(coordinateRandom(seed, x, y, 93) * species.length)] ?? 12;
}
