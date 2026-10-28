import { describe, it, expect } from 'vitest';
import { Vector2 } from '@/core/math/Vector2';

describe('Smoke Unit Test Suite', () => {
  it('instantiates and computes Vector2 distance and addition', () => {
    const v1 = new Vector2(0, 0);
    const v2 = new Vector2(3, 4);
    expect(v1.distanceTo(v2)).toBe(5);
    expect(v1.add(v2)).toEqual(new Vector2(3, 4));
  });
});
