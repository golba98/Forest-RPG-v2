import { describe, it, expect } from 'vitest';
import { AABB } from '@/core/math/AABB';
import { Vector2 } from '@/core/math/Vector2';

describe('AABB Core Unit Tests', () => {
  it('correctly constructs and normalizes inverted min/max coordinates', () => {
    const box = new AABB(100, 200, 50, 80);
    expect(box.minX).toBe(50);
    expect(box.maxX).toBe(100);
    expect(box.minY).toBe(80);
    expect(box.maxY).toBe(200);
    expect(box.width).toBe(50);
    expect(box.height).toBe(120);
    expect(box.halfWidth).toBe(25);
    expect(box.halfHeight).toBe(60);
    expect(box.center).toEqual(new Vector2(75, 140));
    expect(box.min).toEqual(new Vector2(50, 80));
    expect(box.max).toEqual(new Vector2(100, 200));
  });

  it('creates AABB via factory methods', () => {
    const fromMinMax = AABB.fromMinMax(10, 20, 30, 40);
    expect(fromMinMax.width).toBe(20);
    expect(fromMinMax.height).toBe(20);

    const fromBounds = AABB.fromBounds(10, 20, 50, 60);
    expect(fromBounds.minX).toBe(10);
    expect(fromBounds.minY).toBe(20);
    expect(fromBounds.maxX).toBe(60);
    expect(fromBounds.maxY).toBe(80);

    const fromCenter = AABB.fromCenterSize(100, 100, 40, 20);
    expect(fromCenter.minX).toBe(80);
    expect(fromCenter.maxX).toBe(120);
    expect(fromCenter.minY).toBe(90);
    expect(fromCenter.maxY).toBe(110);

    const fromPoints = AABB.fromPoints([
      new Vector2(10, 50),
      new Vector2(30, 20),
      new Vector2(5, 40),
      new Vector2(25, 60),
    ]);
    expect(fromPoints.minX).toBe(5);
    expect(fromPoints.maxX).toBe(30);
    expect(fromPoints.minY).toBe(20);
    expect(fromPoints.maxY).toBe(60);

    const emptyPoints = AABB.fromPoints([]);
    expect(emptyPoints.width).toBe(0);
    expect(emptyPoints.height).toBe(0);
  });

  it('computes AABB vs AABB intersection correctly', () => {
    const a = AABB.fromBounds(0, 0, 50, 50);
    const b = AABB.fromBounds(25, 25, 50, 50);
    const c = AABB.fromBounds(60, 60, 20, 20);

    expect(a.intersects(b)).toBe(true);
    expect(b.intersects(a)).toBe(true);
    expect(a.intersects(c)).toBe(false);
  });

  it('computes point containment correctly', () => {
    const box = AABB.fromBounds(10, 10, 80, 80);
    expect(box.containsPoint(new Vector2(50, 50))).toBe(true);
    expect(box.containsPoint(new Vector2(10, 10))).toBe(true); // boundary edge
    expect(box.containsPoint(new Vector2(90, 90))).toBe(true); // boundary corner
    expect(box.containsPoint(new Vector2(5, 50))).toBe(false);
    expect(box.containsPoint({ x: 50, y: 50 })).toBe(true);
  });

  it('computes AABB containment correctly', () => {
    const outer = AABB.fromBounds(0, 0, 100, 100);
    const inner = AABB.fromBounds(20, 20, 40, 40);
    const overlapping = AABB.fromBounds(50, 50, 100, 100);

    expect(outer.containsAABB(inner)).toBe(true);
    expect(inner.containsAABB(outer)).toBe(false);
    expect(outer.containsAABB(overlapping)).toBe(false);
  });

  it('computes circle vs AABB intersection correctly', () => {
    const box = AABB.fromBounds(10, 10, 20, 20); // [10..30, 10..30]
    expect(box.intersectsCircle(new Vector2(20, 20), 5)).toBe(true); // circle completely inside
    expect(box.intersectsCircle(new Vector2(5, 20), 6)).toBe(true); // overlaps left edge (dist 5 <= 6)
    expect(box.intersectsCircle(new Vector2(5, 20), 4)).toBe(false); // misses left edge (dist 5 > 4)
    expect(box.intersectsCircle(new Vector2(5, 5), 7.1)).toBe(true); // overlaps corner (dist ≈ 7.07 <= 7.1)
    expect(box.intersectsCircle(new Vector2(5, 5), 6.0)).toBe(false); // misses corner (dist ≈ 7.07 > 6.0)
  });

  it('rejects negative circle radii', () => {
    const box = AABB.fromBounds(10, 10, 20, 20);
    expect(box.intersectsCircle(new Vector2(20, 20), -5)).toBe(false); // center inside, but invalid radius
    expect(box.intersectsCircle(new Vector2(5, 20), -6)).toBe(false);
  });

  it('expands bounds symmetrically with new instance and in place', () => {
    const box = AABB.fromBounds(10, 10, 20, 20);
    const expanded = box.expand(5);
    expect(expanded.minX).toBe(5);
    expect(expanded.maxX).toBe(35);
    expect(expanded.width).toBe(30);

    box.expandInPlace(5);
    expect(box.minX).toBe(5);
    expect(box.maxX).toBe(35);
  });

  it('computes union, intersection, clone, and set', () => {
    const b1 = AABB.fromBounds(0, 0, 20, 20);
    const b2 = AABB.fromBounds(10, 10, 30, 30);

    const u = b1.union(b2);
    expect(u.minX).toBe(0);
    expect(u.minY).toBe(0);
    expect(u.maxX).toBe(40);
    expect(u.maxY).toBe(40);

    const inter = b1.intersection(b2);
    expect(inter).not.toBeNull();
    expect(inter?.minX).toBe(10);
    expect(inter?.minY).toBe(10);
    expect(inter?.maxX).toBe(20);
    expect(inter?.maxY).toBe(20);

    const b3 = AABB.fromBounds(100, 100, 10, 10);
    expect(b1.intersection(b3)).toBeNull();

    const cloned = b1.clone();
    expect(cloned).toEqual(b1);
    expect(cloned).not.toBe(b1);

    b1.set(1, 2, 3, 4);
    expect(b1.minX).toBe(1);
    expect(b1.maxY).toBe(4);
  });
});
