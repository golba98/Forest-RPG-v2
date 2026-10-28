import { describe, it, expect } from 'vitest';
import { generateWorld } from '../../../src/world/WorldGenerator';
import { generateTutorialWorld } from '../../../src/world/TutorialMap';
import { floodFill } from '../../../src/world/pathfinding';
import { canOccupy } from '../../../src/systems/CollisionSystem';
import { Tile } from '../../../src/types/tiles';

describe('world generation', () => {
  it('is deterministic with a solid border and difficulty counts', () => {
    const options = { seed: 123, level: 1, difficulty: 'normal' as const };
    const start = performance.now();
    const a = generateWorld(options);
    console.info('150x150 generation ms:', performance.now() - start);
    expect(a).toEqual(generateWorld(options));
    expect(a.tiles).not.toEqual(generateWorld({ ...options, seed: 456 }).tiles);
    expect(a.enemySpawns.filter(e => e.type !== 'beetle')).toHaveLength(12);
    expect(a.enemySpawns.filter(e => e.type === 'beetle')).toHaveLength(1);
    for (let n = 0; n < 150; n++) {
      expect(a.tiles[n]).toBe(Tile.BORDER);
      expect(a.tiles[149 * 150 + n]).toBe(Tile.BORDER);
      expect(a.tiles[n * 150]).toBe(Tile.BORDER);
      expect(a.tiles[n * 150 + 149]).toBe(Tile.BORDER);
    }
  });
  it('keeps every traversable tile and objective connected after props', () => {
    for (const seed of [1, 123, 456]) {
      const w = generateWorld({ seed, level: 1, difficulty: 'hard' });
      const open = (x: number, y: number) => canOccupy(w, x + 0.5, y + 0.5, 0.3);
      const reached = floodFill(w.meta, w.spawn, open);
      for (let y = 0; y < w.meta.height; y++) for (let x = 0; x < w.meta.width; x++) {
        if (open(x, y)) expect(reached[y * w.meta.width + x], `seed ${seed}: ${x},${y}`).toBe(1);
      }
      for (const point of [w.portal, ...w.pickupSpawns, ...w.enemySpawns]) expect(reached[point.y * w.meta.width + point.x]).toBe(1);
    }
  });
  it('preserves the tutorial objectives', () => {
    const w = generateTutorialWorld();
    expect(w.spawn).toEqual({ x: 3, y: 15 });
    expect(w.portal).toEqual({ x: 17, y: 3 });
    expect(w.enemySpawns[0]).toMatchObject({ x: 5, y: 5, maxHealth: 5, aggressive: false });
    expect(w.pickupSpawns).toHaveLength(3);
  });
});
