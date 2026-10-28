import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialHashGrid } from '@/core/spatial/SpatialHashGrid';
import { ISpatialEntity } from '@/core/spatial/types';
import { AABB } from '@/core/math/AABB';
import { Vector2 } from '@/core/math/Vector2';

class TestEntity implements ISpatialEntity {
  constructor(
    public id: string,
    public x: number,
    public y: number,
    public size: number
  ) {}

  getAABB(): AABB {
    return AABB.fromBounds(this.x, this.y, this.size, this.size);
  }
}

describe('SpatialHashGrid Unit Tests', () => {
  let grid: SpatialHashGrid<TestEntity>;

  beforeEach(() => {
    grid = new SpatialHashGrid<TestEntity>(64);
  });

  it('throws on non-positive cell size', () => {
    expect(() => new SpatialHashGrid(0)).toThrow();
    expect(() => new SpatialHashGrid(-10)).toThrow();
  });

  it('inserts and queries entities in cell bounds', () => {
    const e1 = new TestEntity('e1', 10, 10, 20);
    const e2 = new TestEntity('e2', 200, 200, 20);
    grid.insert(e1);
    grid.insert(e2);

    expect(grid.has(e1)).toBe(true);
    expect(grid.has(e2)).toBe(true);

    const hits = grid.queryAABB(AABB.fromBounds(0, 0, 50, 50));
    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe('e1');
  });

  it('deduplicates entities spanning multiple cells', () => {
    // Entity spanning cells (0,0), (1,0), (0,1), (1,1)
    const largeEntity = new TestEntity('boss', 50, 50, 50);
    grid.insert(largeEntity);

    // Query covering all 4 cells
    const hits = grid.queryAABB(AABB.fromBounds(0, 0, 128, 128));
    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe('boss');
  });

  it('updates entity location when moving across cells', () => {
    const e = new TestEntity('e1', 10, 10, 20);
    grid.insert(e);

    // Fast-path update within same cell
    e.x = 12;
    e.y = 12;
    grid.update(e);
    expect(grid.queryAABB(AABB.fromBounds(0, 0, 50, 50))).toHaveLength(1);

    // Move to far-away cell
    e.x = 500;
    e.y = 500;
    grid.update(e);

    expect(grid.queryAABB(AABB.fromBounds(0, 0, 50, 50))).toHaveLength(0);
    expect(grid.queryAABB(AABB.fromBounds(480, 480, 50, 50))).toHaveLength(1);
  });

  it('replaces a stale reference when the same id is updated with a new object in the same cell', () => {
    const original = new TestEntity('e1', 10, 10, 20);
    grid.insert(original);

    const replacement = new TestEntity('e1', 12, 12, 20);
    grid.update(replacement);

    const hits = grid.queryAABB(AABB.fromBounds(0, 0, 50, 50));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toBe(replacement);
    expect(grid.getStats().entityCount).toBe(1);
  });

  it('removes the old reference from previous cells when the same id moves with a new object', () => {
    const original = new TestEntity('e1', 10, 10, 20);
    grid.insert(original);

    // [450..470] lies entirely within cell (7,7) for cellSize 64
    const replacement = new TestEntity('e1', 450, 450, 20);
    grid.update(replacement);

    expect(grid.queryAABB(AABB.fromBounds(0, 0, 50, 50))).toHaveLength(0);
    const hits = grid.queryAABB(AABB.fromBounds(440, 440, 50, 50));
    expect(hits).toEqual([replacement]);

    const stats = grid.getStats();
    expect(stats.entityCount).toBe(1);
    expect(stats.occupiedCellCount).toBe(1);
  });

  it('removes by id even when given a different object reference', () => {
    grid.insert(new TestEntity('e1', 50, 50, 50));

    expect(grid.remove(new TestEntity('e1', 50, 50, 50))).toBe(true);
    expect(grid.queryAABB(AABB.fromBounds(0, 0, 200, 200))).toHaveLength(0);
    expect(grid.getStats().occupiedCellCount).toBe(0);
  });

  it('removes entities cleanly from all cells', () => {
    const e = new TestEntity('e1', 50, 50, 50);
    grid.insert(e);
    expect(grid.remove(e)).toBe(true);
    expect(grid.has(e)).toBe(false);
    expect(grid.remove(e)).toBe(false);
    expect(grid.queryAABB(AABB.fromBounds(0, 0, 200, 200))).toHaveLength(0);
  });

  it('performs radius proximity queries with circle filtering', () => {
    const e1 = new TestEntity('center', 100, 100, 10);
    const e2 = new TestEntity('edge', 130, 100, 10);
    const e3 = new TestEntity('far', 300, 300, 10);

    grid.insert(e1);
    grid.insert(e2);
    grid.insert(e3);

    const radiusHits = grid.queryRadius(new Vector2(100, 100), 40);
    expect(radiusHits.map((e) => e.id)).toContain('center');
    expect(radiusHits.map((e) => e.id)).toContain('edge');
    expect(radiusHits.map((e) => e.id)).not.toContain('far');

    // Zero radius returns empty array
    expect(grid.queryRadius(new Vector2(100, 100), 0)).toEqual([]);
  });

  it('queries point containment', () => {
    const e1 = new TestEntity('e1', 10, 10, 30);
    grid.insert(e1);

    const hit = grid.queryPoint(new Vector2(20, 20));
    expect(hit).toHaveLength(1);
    expect(hit[0]?.id).toBe('e1');

    const miss = grid.queryPoint(new Vector2(90, 90));
    expect(miss).toHaveLength(0);
  });

  it('clears all entities and reports stats', () => {
    const e1 = new TestEntity('e1', 10, 10, 20);
    const e2 = new TestEntity('e2', 200, 200, 20);
    grid.insert(e1);
    grid.insert(e2);

    const statsBefore = grid.getStats();
    expect(statsBefore.entityCount).toBe(2);
    expect(statsBefore.occupiedCellCount).toBeGreaterThanOrEqual(2);

    grid.clear();
    const statsAfter = grid.getStats();
    expect(statsAfter.entityCount).toBe(0);
    expect(statsAfter.occupiedCellCount).toBe(0);
  });
});
