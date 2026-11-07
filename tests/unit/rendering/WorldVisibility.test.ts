import { expect, it } from 'vitest';
import { Camera } from '../../../src/rendering/Camera';
import {
  intersects,
  MAX_WORLD_SPEED,
  WorldBoundsIndex,
  WorldVisibility,
} from '../../../src/rendering/WorldVisibility';

it('keeps partial large sprites visible at all four edges, including an outside anchor', () => {
  const tree = { x: 100, y: 100, width: 96, height: 128 };
  for (const view of [
    { x: 195, y: 90, width: 50, height: 150 },
    { x: 50, y: 90, width: 51, height: 150 },
    { x: 90, y: 227, width: 150, height: 50 },
    { x: 90, y: 50, width: 150, height: 51 },
  ])
    expect(intersects(tree, view)).toBe(true);
  expect(intersects(tree, { x: 90, y: 228, width: 150, height: 50 })).toBe(false);
});

it('indexes overhangs across chunk boundaries, deduplicates and removes nonresident records', () => {
  const index = new WorldBoundsIndex<{
    key: string;
    bounds: { x: number; y: number; width: number; height: number };
  }>();
  const tree = { key: 'tree:stable', bounds: { x: 490, y: 490, width: 96, height: 128 } };
  index.add(tree);
  const found = new Set<typeof tree>();
  expect([...index.query({ x: 550, y: 550, width: 10, height: 10 }, found)]).toEqual([tree]);
  expect(index.query({ x: 480, y: 480, width: 200, height: 200 }, found).size).toBe(1);
  index.remove(tree.key);
  expect(index.query(tree.bounds, found).size).toBe(0);
});

it('prepares motion and burst reserves, retains a larger ring, and resets on discontinuities', () => {
  const planner = new WorldVisibility();
  const rect = { x: 500, y: 500, width: 640, height: 480 };
  expect(planner.update(rect, 16).discontinuity).toBe(true);
  const p = planner.update({ ...rect, x: 510, y: 510 }, 16);
  expect(p.discontinuity).toBe(false);
  expect(p.preparation.x).toBeLessThan(p.visible.x - MAX_WORLD_SPEED * 0.05);
  expect(p.preparation.x + p.preparation.width - (p.visible.x + p.visible.width)).toBeGreaterThan(
    300,
  );
  expect(p.retention.width).toBe(p.preparation.width + 1024);
  expect(planner.update({ ...rect, x: 3000 }, 16).discontinuity).toBe(true);
  expect(planner.update({ ...rect, width: 1000 }, 16).discontinuity).toBe(true);
  planner.reset();
  expect(planner.update(rect, 0).discontinuity).toBe(true);
});

it('uses the exact inverse camera transform under DPR, zoom, shake and small-world clamping', () => {
  const camera = new Camera({ zoom: 1.5 });
  camera.setViewport(390, 844, 2);
  camera.setWorldSize(3200, 3200);
  camera.snapTo(1000.3, 1200.7);
  camera.shake(12, 200);
  camera.update(33);
  const rect = camera.getVisibleRect();
  expect(camera.worldToScreen(rect.x, rect.y)).toEqual({ x: 0, y: 0 });
  expect(rect.width).toBe(260);
  camera.setWorldSize(100, 100);
  expect(intersects(camera.getVisibleRect(), { x: 0, y: 0, width: 100, height: 100 })).toBe(true);
});
