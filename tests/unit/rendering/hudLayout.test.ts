import { expect, it } from 'vitest';
import { hudLayout } from '../../../src/rendering/hudLayout';
it('anchors the status strip at the bottom centre at every supported UI scale', () => {
  for (const [width, height] of [
    [320, 568],
    [1280, 720],
    [1920, 1080],
    [3440, 1440],
  ])
    for (const scale of [0.8, 1, 1.2]) {
      const l = hudLayout(width!, height!, scale);
      expect(l.x).toBeGreaterThanOrEqual(15);
      expect(l.x + l.width * l.scale).toBeLessThanOrEqual(width! - 15);
      expect(l.y + l.height * l.scale).toBeCloseTo(height! - 16, 0);
      expect(l.x + (l.width * l.scale) / 2).toBeCloseTo(width! / 2, 0);
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.leftWidth).toBeLessThan(l.rightX);
    }
});
it('respects asymmetric safe areas and keeps twenty hearts in their own block', () => {
  const l = hudLayout(844, 390, 1.2, { top: 0, left: 44, right: 20, bottom: 21 });
  expect(l.x).toBeGreaterThan(44);
  expect(l.y + l.height * l.scale).toBeCloseTo(390 - 21 - 16, 0);
  expect(9 * l.heartStep + l.heartSize).toBeLessThanOrEqual(l.leftWidth);
});
