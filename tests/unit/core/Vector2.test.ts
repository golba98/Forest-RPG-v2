import { describe, it, expect } from 'vitest';
import { Vector2 } from '@/core/math/Vector2';

describe('Vector2 Core Unit Tests', () => {
  it('initializes with default (0, 0) and explicit values', () => {
    const vDefault = new Vector2();
    expect(vDefault.x).toBe(0);
    expect(vDefault.y).toBe(0);

    const vExplicit = new Vector2(5, -12);
    expect(vExplicit.x).toBe(5);
    expect(vExplicit.y).toBe(-12);
  });

  it('performs vector addition and subtraction', () => {
    const a = new Vector2(3, 4);
    const b = new Vector2(1, 2);

    const sum = a.add(b);
    expect(sum).toEqual(new Vector2(4, 6));

    const diff = a.sub(b);
    expect(diff).toEqual(new Vector2(2, 2));
  });

  it('scales vectors and calculates dot products', () => {
    const v = new Vector2(2, 3);
    const scaled = v.scale(2.5);
    expect(scaled.x).toBe(5);
    expect(scaled.y).toBe(7.5);

    const v1 = new Vector2(1, 2);
    const v2 = new Vector2(3, 4);
    // 1*3 + 2*4 = 11
    expect(v1.dot(v2)).toBe(11);
  });

  it('computes Euclidean distance and squared distance', () => {
    const p1 = new Vector2(0, 0);
    const p2 = new Vector2(3, 4);

    expect(p1.distanceTo(p2)).toBe(5);
    expect(p1.distanceToSq(p2)).toBe(25);
  });

  it('computes length and squared length', () => {
    const v = new Vector2(3, 4);
    expect(v.length()).toBe(5);
    expect(v.lengthSq()).toBe(25);
  });

  it('normalizes non-zero vectors to unit length and handles zero vector safely', () => {
    const v = new Vector2(0, 10);
    const norm = v.normalize();
    expect(norm.x).toBe(0);
    expect(norm.y).toBe(1);
    expect(norm.length()).toBeCloseTo(1, 5);

    const zero = new Vector2(0, 0);
    const normZero = zero.normalize();
    expect(normZero.x).toBe(0);
    expect(normZero.y).toBe(0);
  });

  it('clones, mutates via set, and checks equality with tolerance', () => {
    const orig = new Vector2(7, 9);
    const cloned = orig.clone();
    expect(cloned).toEqual(orig);
    expect(cloned).not.toBe(orig);

    orig.set(100, 200);
    expect(orig.x).toBe(100);
    expect(orig.y).toBe(200);

    const closeV = new Vector2(100.0000001, 199.9999999);
    expect(orig.equals(closeV, 1e-5)).toBe(true);
    expect(orig.equals(new Vector2(101, 200))).toBe(false);
  });

  it('creates zero vector via static factory', () => {
    const z = Vector2.zero();
    expect(z.x).toBe(0);
    expect(z.y).toBe(0);
  });
});
