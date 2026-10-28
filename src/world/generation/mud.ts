import { Tile } from '../../types/tiles';
import type { GenGrid } from './GenGrid';
import type { TilePoint, WorldBridge } from '../../types/world';
import { intersectsBridgeReservation } from '../BridgeGeometry';
import type { Rng } from '../Rng';
/** Seeded damp patches on grass near river banks, with spawn left clear. */
export function placeMud(grid: GenGrid, spawn: TilePoint, rng: Rng, bridges: readonly WorldBridge[] = []): void {
  const patches: TilePoint[] = [];
  for (let y = 2; y < grid.height - 2; y++) for (let x = 2; x < grid.width - 2; x++) {
    if (grid.get(x, y) !== Tile.GRASS || Math.hypot(x - spawn.x, y - spawn.y) < 6) continue;
    const nearWater = grid.neighbors8(x, y).some(n => grid.get(n.x, n.y) === Tile.RIVER);
    if (nearWater && rng.chance(0.11)) patches.push({ x, y });
  }
  for (const p of patches) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = p.x + dx, y = p.y + dy;
    if (grid.inBounds(x, y) && grid.get(x, y) === Tile.GRASS && !intersectsBridgeReservation(bridges, { minX: x, minY: y, maxX: x + 1, maxY: y + 1 }) && Math.hypot(x - spawn.x, y - spawn.y) >= 6 && rng.chance(dx === 0 && dy === 0 ? 1 : 0.55)) grid.set(x, y, Tile.MUD);
  }
}
