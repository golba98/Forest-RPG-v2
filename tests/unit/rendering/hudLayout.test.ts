import { expect, it } from 'vitest';
import { hudLayout, HUD_MARGIN, type HudLayout } from '../../../src/rendering/hudLayout';

const screenBox = (r: HudLayout['level'], scale: number) => ({
  left: r.x,
  top: r.y,
  right: r.x + r.width * scale,
  bottom: r.y + r.height * scale,
});

it('puts the level panel top-left and the hearts/hotbar cluster bottom-right at every UI scale', () => {
  for (const [width, height] of [
    [320, 568],
    [1280, 720],
    [1920, 1080],
    [3440, 1440],
  ])
    for (const scale of [0.8, 1, 1.2]) {
      const l = hudLayout(width!, height!, scale);
      const level = screenBox(l.level, l.scale),
        cluster = screenBox(l.cluster, l.scale);
      expect(level.left).toBe(HUD_MARGIN);
      expect(level.top).toBe(HUD_MARGIN);
      expect(cluster.right).toBeCloseTo(width! - HUD_MARGIN, 0);
      expect(cluster.bottom).toBeCloseTo(height! - HUD_MARGIN, 0);
      expect(cluster.left).toBeGreaterThanOrEqual(HUD_MARGIN - 1);
      expect(level.bottom).toBeLessThan(cluster.top);
    }
});

it('respects asymmetric safe areas and fits twenty hearts and five slots in the cluster', () => {
  const l = hudLayout(844, 390, 1.2, { top: 10, left: 44, right: 20, bottom: 21 });
  expect(l.level.x).toBe(44 + HUD_MARGIN);
  expect(l.level.y).toBe(10 + HUD_MARGIN);
  expect(l.cluster.x + l.cluster.width * l.scale).toBeCloseTo(844 - 20 - HUD_MARGIN, 0);
  expect(l.cluster.y + l.cluster.height * l.scale).toBeCloseTo(390 - 21 - HUD_MARGIN, 0);
  expect(9 * l.heartStep + l.heartSize + 12).toBeLessThanOrEqual(l.cluster.width);
  expect(l.slotCount * l.slotSize + (l.slotCount - 1) * l.slotGap).toBe(l.cluster.width);
});

it('drops the level panel below a top-right reserve it would otherwise overlap', () => {
  const minimap = { x: 100, y: 14, width: 212, height: 212 };
  const narrow = hudLayout(320, 568, 1, undefined, minimap);
  expect(narrow.level.y).toBeGreaterThanOrEqual(minimap.y + minimap.height);
  const wide = hudLayout(1920, 1080, 1, undefined, { ...minimap, x: 1700 });
  expect(wide.level.y).toBe(HUD_MARGIN);
});
