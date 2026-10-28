import { it, expect } from 'vitest';
import { Camera } from '../../../src/rendering/Camera';

it('round-trips snapped screen coordinates at high DPR', () => {
  const camera = new Camera();
  camera.setViewport(1920, 1080, 2);
  camera.setWorldSize(4800, 4800);
  camera.snapTo(1000.3, 1500.2);
  const screen = camera.worldToScreen(1020, 1520);
  expect(camera.screenToWorld(screen.x, screen.y)).toEqual({ x: 1020, y: 1520 });
  expect(Camera.computeAutoZoom(1080, 1)).toBe(2);
  expect(Camera.computeAutoZoom(1440, 1)).toBe(3);
  expect(Camera.computeAutoZoom(2160, 1)).toBe(4);
});
it('centers worlds smaller than the viewport and clamps large worlds', () => {
  const camera = new Camera(); camera.setViewport(1920, 1080, 1);
  camera.setWorldSize(640, 640); camera.snapTo(10, 10);
  expect(camera.getView().x).toBe(320);
  camera.setWorldSize(4800, 4800); camera.snapTo(-100, -100);
  expect(camera.getView().x).toBe(480);
  expect(camera.getView().y).toBe(270);
});
