import { describe, expect, it, vi } from 'vitest';
import { generateWorld } from '../../../src/world/WorldGenerator';
import { Tile, isTileId } from '../../../src/types/tiles';
import { describeTerrain, isHillTerrain } from '../../../src/world/TerrainTopology';
import { canOccupy } from '../../../src/systems/CollisionSystem';
import { floodFill } from '../../../src/world/pathfinding';
import { GenGrid } from '../../../src/world/generation/GenGrid';
import { generateHills, refreshHillEdges } from '../../../src/world/generation/hills';
import { Rng } from '../../../src/world/Rng';
import { PerlinNoise } from '../../../src/world/Noise';

describe('final terrain topology', () => {
  it('validates 100 deterministic seeds including lower rows and objective clearance', () => {
    const seeds = [1, 123, 456, 999, 20261028, ...Array.from({ length: 95 }, (_, i) => 1000 + i)];
    for (const [index, seed] of seeds.entries()) {
      const options = {
        seed,
        level: 1,
        difficulty: (['easy', 'normal', 'hard'] as const)[index % 3]!,
        width: index < 5 ? 150 : [32, 48, 64][index % 3]!,
        height: index < 5 ? 150 : [48, 64, 32][index % 3]!,
      };
      const w = generateWorld(options);
      expect(w).toEqual(generateWorld(options));
      expect(w.tiles.length).toBe(w.meta.width * w.meta.height);
      const open = (x: number, y: number) => canOccupy(w, x + 0.5, y + 0.5, 0.3);
      const reached = floodFill(w.meta, w.spawn, open),
        ground = floodFill(w.meta, w.spawn, (x, y) =>
          canOccupy(w, x + 0.5, y + 0.5, 0.3, 'groundEnemy'),
        );
      expect(open(w.spawn.x, w.spawn.y), `spawn seed ${seed}`).toBe(true);
      for (const point of [w.portal, ...w.enemySpawns, ...w.pickupSpawns])
        expect(reached[point.y * w.meta.width + point.x], `objective seed ${seed}`).toBe(1);
      // Enemies either have a ground route to the player, or were pushed off a
      // cramped start island and wait well away from it.
      for (const e of w.enemySpawns)
        if (!ground[e.y * w.meta.width + e.x])
          expect(
            Math.hypot(e.x - w.spawn.x, e.y - w.spawn.y),
            `ground route seed ${seed}`,
          ).toBeGreaterThanOrEqual(6);
      for (let y = 0; y < w.meta.height; y++)
        for (let x = 0; x < w.meta.width; x++) {
          const id = w.tiles[y * w.meta.width + x]!;
          if (!isTileId(id)) throw Error(`invalid tile seed ${seed}: ${x},${y}`);
          if (open(x, y) && !reached[y * w.meta.width + x])
            throw Error(`disconnected seed ${seed}: ${x},${y}`);
          const t = describeTerrain(w, x, y);
          if (isHillTerrain(id)) {
            // Raised rim cells contain a walkable surface; face geometry bounds it.
            expect(t.walkable).toBe(id !== Tile.CLIFF);
            const cardinal = [
              [0, -1],
              [1, 0],
              [0, 1],
              [-1, 0],
            ] as const;
            cardinal.forEach(([dx, dy], i) => {
              const nx = x + dx,
                ny = y + dy;
              const adjacent =
                nx >= 0 &&
                ny >= 0 &&
                nx < w.meta.width &&
                ny < w.meta.height &&
                isHillTerrain(w.tiles[ny * w.meta.width + nx]!);
              if (Boolean(t.exposedEdges & (1 << i)) === adjacent)
                throw Error(`edge seed ${seed}: ${x},${y}`);
            });
          }
        }
    }
  }, 30000);
  it('processes lower hill boundaries and preserves crossing landings', () => {
    const grid = new GenGrid(40, 40, Tile.GRASS),
      rng = new Rng(1),
      noise = new PerlinNoise(new Rng(2));
    vi.spyOn(rng, 'nextFloat').mockReturnValue(0);
    vi.spyOn(noise, 'noise2').mockImplementation((_x, y) => (y > 0.7 ? 1 : 0));
    grid.set(20, 30, Tile.RAMP);
    grid.set(20, 31, Tile.RIVER);
    generateHills(grid, rng, noise);
    expect(grid.get(20, 30)).toBe(Tile.RAMP);
    expect(grid.get(20, 31)).toBe(Tile.RIVER);
    expect(Array.from(grid.tiles.slice(32 * 40, 35 * 40)).some(isHillTerrain)).toBe(true);
    grid.set(10, 30, Tile.GRASS);
    refreshHillEdges(grid);
    const w = { meta: { width: 40, height: 40 }, tiles: grid.tiles };
    expect(describeTerrain(w, 10, 31).exposedEdges & 1).toBe(1);
  });
  it('reports concave and convex corners without inventing new tile IDs', () => {
    const grid = new GenGrid(5, 5, Tile.GRASS);
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) grid.set(x, y, Tile.PLATEAU);
    grid.set(3, 1, Tile.GRASS);
    refreshHillEdges(grid);
    const world = { meta: { width: 5, height: 5 }, tiles: grid.tiles };
    expect(describeTerrain(world, 2, 2).concaveCorners & 1).toBe(1);
    expect(describeTerrain(world, 1, 1).convexCorners & 8).toBe(8);
  });
});
