import { describe, expect, it } from 'vitest';
import { directionFromVector, DIRECTION_VECTORS } from '../../../src/core/math/Direction';

describe('screen-coordinate compass directions', () => {
  it.each([
    ['N', 0, -1], ['NE', 1, -1], ['E', 1, 0], ['SE', 1, 1],
    ['S', 0, 1], ['SW', -1, 1], ['W', -1, 0], ['NW', -1, -1],
  ] as const)('resolves %s and provides a unit vector with matching signs', (direction, dx, dy) => {
    for (const scale of [0.001, 1, 10]) expect(directionFromVector(dx * scale, dy * scale)).toBe(direction);
    const [x, y] = DIRECTION_VECTORS[direction];
    expect(Math.hypot(x, y)).toBeCloseTo(1);
    expect(Math.sign(x)).toBe(dx);
    expect(Math.sign(y)).toBe(dy);
  });

  it('keeps stopped facing and quantizes arbitrary aim vectors consistently', () => {
    expect(directionFromVector(0, 0, 'NW')).toBe('NW');
    expect(directionFromVector(NaN, 1, 'W')).toBe('W');
    expect(directionFromVector(1, Infinity, 'S')).toBe('S');
    expect(directionFromVector(0.2, -1)).toBe('N');
    expect(directionFromVector(1, -0.5)).toBe('NE');
  });
});
