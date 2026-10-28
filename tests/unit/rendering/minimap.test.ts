import { describe, expect, it } from 'vitest';
import { radarPoint, rimPoint } from '../../../src/rendering/Minimap';
import { hurtBlinkAlpha } from '../../../src/rendering/PixiRenderer';

describe('minimap radar', () => {
  it('keeps the player at the centre and scales by 4 px per tile', () => {
    expect(radarPoint(50, 50, 50, 50)).toEqual({ x: 100, y: 100 });
    expect(radarPoint(55, 47, 50, 50)).toEqual({ x: 120, y: 88 });
  });

  it('puts the off-map arrow on the square rim in the target direction', () => {
    const east = rimPoint(30, 0, 100, 9);
    expect(east).toEqual({ x: 91, y: 0 });
    const corner = rimPoint(-40, -40, 100, 9);
    expect(corner.x).toBeCloseTo(-91);
    expect(corner.y).toBeCloseTo(-91);
    const steep = rimPoint(10, 40, 100, 9);
    expect(steep.y).toBeCloseTo(91);
    expect(Math.abs(steep.x)).toBeLessThan(91);
  });
});

describe('hurt blink', () => {
  it('alternates between dim and full at about 12 Hz', () => {
    const samples = Array.from({ length: 8 }, (_, i) => hurtBlinkAlpha(i * 42));
    expect(new Set(samples)).toEqual(new Set([0.35, 1]));
    expect(samples[0]).not.toBe(samples[1]);
  });
});
