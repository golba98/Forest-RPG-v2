import { expect, it } from 'vitest';
import { Texture, TextureSource } from 'pixi.js';
import { SkyLayer } from '../../../src/rendering/effects/SkyLayer';
import { AmbientLayer } from '../../../src/rendering/effects/AmbientLayer';
import { intersects } from '../../../src/rendering/WorldVisibility';

it('creates runtime clouds beyond both silhouettes and keeps their projection aligned', () => {
  const sky = new SkyLayer();
  const texture = new Texture({ source: new TextureSource({ width: 128, height: 64 }) });
  sky.setWorld(150, 150, 42, [texture], 75, 75);
  const guard = { x: 1700, y: 1800, width: 1500, height: 1000 };
  // Advance beyond lifetimes and through cover changes, while the camera travels.
  for (let i = 0; i < 1200; i++) sky.update(500, 2400 + (i % 100), 2400, false, true, true, guard);
  expect(sky.info.births.length).toBeGreaterThan(0);
  for (const birth of sky.info.births) {
    expect(intersects(birth.cloud, birth.guard)).toBe(false);
    expect(intersects(birth.shadow, birth.guard)).toBe(false);
  }
  for (const f of sky.info.formations) {
    expect(f.shadowX - f.x).toBeCloseTo(70);
    expect(f.shadowY - f.y).toBeCloseTo(160);
  }
  expect(sky.cloudCount).toBeLessThanOrEqual(64);
  const positions = sky.info.formations;
  sky.update(1000, 2400 + (1199 % 100), 2400, true, true, true, guard);
  expect(sky.info.formations).toEqual(positions);
  sky.clear();
  texture.destroy(true);
});

it('keeps visible ambient positions anchored through camera movement and resize', () => {
  const layer = new AmbientLayer({
    bolt: Texture.EMPTY,
    glow: Texture.EMPTY,
    spark: Texture.EMPTY,
    ring: Texture.EMPTY,
    leaf: Texture.EMPTY,
    clouds: [],
  });
  const opts = {
    paused: true,
    leaves: true,
    fireflies: true,
    darkness: 1,
    worldWidth: 4800,
    worldHeight: 4800,
  };
  layer.update(16, { x: 1000, y: 1000, width: 640, height: 480 }, opts);
  const leaves = layer.leaves.children.map((s) => ({ x: s.x, y: s.y }));
  const flies = layer.fireflies.children.map((s) => ({ x: s.x, y: s.y }));
  layer.update(16, { x: 1010, y: 1010, width: 800, height: 600 }, opts);
  expect(layer.leaves.children.map((s) => ({ x: s.x, y: s.y }))).toEqual(leaves);
  expect(layer.fireflies.children.map((s) => ({ x: s.x, y: s.y }))).toEqual(flies);
  expect(layer.leaves.children).toHaveLength(26);
  expect(layer.fireflies.children).toHaveLength(14);
  layer.leaves.destroy({ children: true });
  layer.fireflies.destroy({ children: true });
  layer.stars.destroy();
});
