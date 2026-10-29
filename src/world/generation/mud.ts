import { Tile } from '../../types/tiles';
import type { GenGrid } from './GenGrid';
import type { TilePoint, WorldBridge } from '../../types/world';
import { intersectsBridgeReservation } from '../BridgeGeometry';
import { PerlinNoise } from '../Noise';
import type { Rng } from '../Rng';

/** Coherent damp soil follows the channel; never scatter square patches inland. */
export function placeMud(
  grid: GenGrid,
  spawn: TilePoint,
  rng: Rng,
  bridges: readonly WorldBridge[] = [],
): void {
  const noise = new PerlinNoise(rng);
  for (let y = 2; y < grid.height - 2; y++)
    for (let x = 2; x < grid.width - 2; x++) {
      if (grid.get(x, y) !== Tile.GRASS || Math.hypot(x - spawn.x, y - spawn.y) < 6) continue;
      if (!grid.neighbors8(x, y).some((n) => grid.get(n.x, n.y) === Tile.RIVER)) continue;
      if (intersectsBridgeReservation(bridges, { minX: x, minY: y, maxX: x + 1, maxY: y + 1 }))
        continue;
      if (noise.noise2(x * 0.18, y * 0.18) > 0.48) grid.set(x, y, Tile.MUD);
    }
}
