import { describe, it, expect } from 'vitest';
import { ForestGenerator } from '../../../../src/world/infinite/ForestGenerator';
import { splitCoordinate, valueNoise } from '../../../../src/world/infinite/coordinates';
import type { InfiniteDescriptor } from '../../../../src/world/infinite/types';
const descriptor: InfiniteDescriptor = {
  id: 'test',
  seed: 42,
  generatorVersion: 13,
  biomeVersion: 1,
  chunkSize: 32,
  level: 1,
  difficulty: 'normal',
};
describe('infinite forest foundations', () => {
  it('uses floor division across negative boundaries', () => {
    for (const n of [-2147483647, -65, -64, -33, -32, -1, 0, 31, 32, 2147483647]) {
      const p = splitCoordinate(n);
      expect(p.chunk * 32 + p.local).toBe(n);
      expect(p.local).toBeGreaterThanOrEqual(0);
      expect(p.local).toBeLessThan(32);
    }
    expect(splitCoordinate(-1)).toEqual({ chunk: -1, local: 31 });
    expect(() => splitCoordinate(2147483648)).toThrow();
  });
  it('does not mirror negative terrain noise', () => {
    expect(valueNoise(42, -0.3, 0.6, 'test')).not.toBe(valueNoise(42, 0.3, 0.6, 'test'));
  });
  it('reproduces chunks independently of load order and chunk size', () => {
    const g = new ForestGenerator(descriptor),
      a = g.generate({ x: -1, y: 0 });
    g.generate({ x: 0, y: -1 });
    g.generate({ x: 0, y: 0 });
    expect(g.generate({ x: -1, y: 0 })).toEqual(a);
    const large = new ForestGenerator({ ...descriptor, chunkSize: 64 }).generate({ x: -1, y: 0 });
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) expect(a.tiles[y * 32 + x]).toBe(large.tiles[y * 64 + 32 + x]);
    expect(a.props.every((p) => p.tileX < 0 && p.tileX >= -32)).toBe(true);
  });
  it('keeps the starting population bounded and clear', () => {
    const g = new ForestGenerator(descriptor);
    expect(g.starting.coins).toHaveLength(20);
    expect(g.starting.enemies).toHaveLength(12);
    expect(g.tileAt(0, 0)).toBe(1);
  });
});
