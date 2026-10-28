import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../../src/world/WorldGenerator';
import { Tile } from '../../../src/types/tiles';
import { canOccupy } from '../../../src/systems/CollisionSystem';
import { isHillTerrain } from '../../../src/world/TerrainTopology';
import { hillStairsFrame, elevationMask } from '../../../src/rendering/hillAutotile';

const CARDINAL = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

describe('hill stairs', () => {
  for (const seed of [1, 42, 123, 1337, 9001]) {
    it(`gives every walkable hill top a staircase (seed ${seed})`, () => {
      const w = generateWorld({ seed, level: 1, difficulty: 'normal' });
      const { width, height } = w.meta;
      const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? Tile.BORDER : w.tiles[y * width + x] ?? Tile.BORDER);
      // Each stair links a plateau cell to open ground on the opposite side.
      let stairs = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (at(x, y) !== Tile.STAIRS) continue;
        stairs++;
        const linked = CARDINAL.some(([dx, dy]) => at(x - dx, y - dy) === Tile.PLATEAU && !isHillTerrain(at(x + dx, y + dy)) && canOccupy(w, x + dx + 0.5, y + dy + 0.5, 0.3));
        expect(linked, `stair ${x},${y}`).toBe(true);
        expect(() => hillStairsFrame(elevationMask(w.tiles, width, height, x, y))).not.toThrow();
      }
      expect(stairs).toBeGreaterThan(0);
      // Every hill region with a top contains a stair (BFS over hill terrain).
      const seen = new Uint8Array(width * height);
      for (let i = 0; i < w.tiles.length; i++) {
        if (seen[i] || !isHillTerrain(w.tiles[i] ?? 0)) continue;
        let hasTop = false, hasStair = false;
        const queue = [i];
        seen[i] = 1;
        while (queue.length) {
          const j = queue.pop() ?? 0;
          if (w.tiles[j] === Tile.PLATEAU) hasTop = true;
          if (w.tiles[j] === Tile.STAIRS) hasStair = true;
          const x = j % width, y = Math.floor(j / width);
          for (const [dx, dy] of CARDINAL) {
            const nx = x + dx, ny = y + dy, k = ny * width + nx;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height && !seen[k] && isHillTerrain(w.tiles[k] ?? 0)) { seen[k] = 1; queue.push(k); }
          }
        }
        if (hasTop) expect(hasStair, `hill region at ${i % width},${Math.floor(i / width)}`).toBe(true);
      }
    });
  }
});
