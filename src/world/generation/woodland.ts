import { Tile } from '../../types/tiles';
import type { TilePoint, WorldBridge, WorldProp } from '../../types/world';
import { intersectsBridgeReservation } from '../BridgeGeometry';
import type { GenGrid } from './GenGrid';
import type { Rng } from '../Rng';

/** Forest regions become discrete trunks with traversable space between them. */
export function placeWoodland(grid: GenGrid, rng: Rng, spawn: TilePoint, bridges: readonly WorldBridge[] = []): WorldProp[] {
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
    if (intersectsBridgeReservation(bridges, { minX: p.x - 1, minY: p.y - 1, maxX: p.x + 2, maxY: p.y + 1 })) continue;
    let near = grid
      .neighbors8(p.x, p.y)
      .some((n) => grid.get(n.x, n.y) === Tile.RAMP || grid.get(n.x, n.y) === Tile.LOG);
    // A tree's body covers its trunk tile and the canopy row above, so keep
    // trees two tiles clear of stairs or they block the landing.
    for (let dy = -2; dy <= 2 && !near; dy++)
      for (let dx = -2; dx <= 2; dx++)
        if (grid.inBounds(p.x + dx, p.y + dy) && grid.get(p.x + dx, p.y + dy) === Tile.STAIRS) near = true;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy < 5 && occupied.has((p.y + dy) * grid.width + p.x + dx)) near = true;
      }
    if (near) continue;
    occupied.add(p.y * grid.width + p.x);
    trees.push({ id: trees.length, kind: 'tree', tileX: p.x, tileY: p.y, solid: true });
  }
  return trees;
}
