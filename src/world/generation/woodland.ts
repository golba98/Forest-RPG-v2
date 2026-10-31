import { Tile } from '../../types/tiles';
import type { TilePoint, WorldProp } from '../../types/world';
import { LandscapePlan } from '../LandscapePlan';
import type { LandscapeTrace } from '../LandscapeTrace';
import type { GenGrid } from './GenGrid';
import type { Rng } from '../Rng';

/** Forest regions become discrete trunks with traversable space between them. */
export function placeWoodland(grid: GenGrid, rng: Rng, spawn: TilePoint,
  landscape = new LandscapePlan({ meta: grid, tiles: grid.tiles, props: [], spawn }, 'woodland'),
  trace?: LandscapeTrace): WorldProp[] {
  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = 1; y < grid.height - 1; y++)
    for (let x = 1; x < grid.width - 1; x++) {
      const tile = grid.get(x, y);
      if (tile === Tile.FOREST) {
        candidates.push({ x, y });
        grid.set(x, y, Tile.GRASS);
      } else if (
        tile === Tile.GRASS &&
        Math.hypot(x - spawn.x, y - spawn.y) > 5 &&
        rng.chance(0.018)
      )
        candidates.push({ x, y });
    }
  const trees: WorldProp[] = [];
  const occupied = new Set<number>();
  for (const p of rng.shuffle(candidates)) {
    const reason = landscape.woodlandRejection(p);
    if (reason) { trace?.record({ consumer: 'woodland', source: p, at: null, outcome: 'rejected', reasons: [reason] }); continue; }
    let near = false;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy < 5 && occupied.has((p.y + dy) * grid.width + p.x + dx)) near = true;
      }
    if (near) { trace?.record({ consumer: 'woodland', source: p, at: null, outcome: 'rejected', reasons: ['tree-spacing'] }); continue; }
    occupied.add(p.y * grid.width + p.x);
    trees.push({ id: trees.length, kind: 'tree', tileX: p.x, tileY: p.y, solid: true });
    trace?.record({ consumer: 'woodland', source: p, at: p, outcome: 'accepted', reasons: [] });
  }
  return trees;
}
