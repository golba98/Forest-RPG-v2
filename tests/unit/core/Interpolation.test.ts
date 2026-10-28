import { describe, it, expect } from 'vitest';
import { Interpolation } from '@/core/loop/Interpolation';
import { Vector2 } from '@/core/math/Vector2';

describe('Interpolation Unit Test Suite', () => {
  it('correctly calculates scalar lerp', () => {
    expect(Interpolation.lerp(10, 20, 0.0)).toBe(10);
    expect(Interpolation.lerp(10, 20, 0.5)).toBe(15);
    expect(Interpolation.lerp(10, 20, 1.0)).toBe(20);
  });

  it('interpolates Vector2 in-place without garbage allocation', () => {
    const prev = new Vector2(100, 200);
    const curr = new Vector2(200, 400);
    const out = new Vector2();

    const res = Interpolation.lerpVector2(prev, curr, 0.25, out);
    expect(res).toBe(out);
    expect(out.x).toBe(125);
    expect(out.y).toBe(250);
  });

  it('interpolates entities implementing IInterpolatable', () => {
    const entity = {
      prevX: 50,
      prevY: 50,
      x: 100,
      y: 100,
      renderX: 0,
      renderY: 0,
    };

    Interpolation.interpolateEntity(entity, 0.5);
    expect(entity.renderX).toBe(75);
    expect(entity.renderY).toBe(75);
  });

  it('snaps entity coordinates on teleport', () => {
    const entity = {
      prevX: 50,
      prevY: 50,
      x: 500,
      y: 500,
      renderX: 0,
      renderY: 0,
    };

    Interpolation.snapEntity(entity);
    expect(entity.prevX).toBe(500);
    expect(entity.prevY).toBe(500);
    expect(entity.renderX).toBe(500);
    expect(entity.renderY).toBe(500);
  });

  it('computes shortest path angular interpolation across 0/2pi boundary', () => {
    // Going from 350 degrees to 10 degrees (wrapping across 0)
    const rad350 = (350 * Math.PI) / 180;
    const rad10 = (10 * Math.PI) / 180;

    const midRad = Interpolation.lerpAngle(rad350, rad10, 0.5);
    let midDeg = (midRad * 180) / Math.PI;
    if (midDeg < 0) midDeg += 360;

    expect(midDeg).toBeCloseTo(0, 1);
  });
});
