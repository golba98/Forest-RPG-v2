import { expect, it } from 'vitest';
import { WeatherLayer, type WeatherOptions } from '../../../src/rendering/effects/WeatherLayer';
import { SurfaceMoisture, surfaceSites } from '../../../src/systems/SurfaceMoisture';
import { bridgeFixture } from '../../fixtures/bridge-world';

it('retains impact coordinates during a paused camera move, ages them out and bounds pools', () => {
  const { world } = bridgeFixture(),
    layer = new WeatherLayer();
  const options: WeatherOptions = {
    world,
    view: { x: 150, y: 150, width: 640, height: 480 },
    worldToScreen: (x, y) => ({ x, y }),
    paused: false,
    enabled: true,
    screenWidth: 640,
    screenHeight: 480,
  };
  for (let i = 0; i < 200; i++) layer.update(16, true, options);
  const before = layer.info.positions;
  expect(before.length).toBeGreaterThan(0);
  layer.update(16, true, {
    ...options,
    paused: true,
    view: { ...options.view, x: 400 },
    worldToScreen: (x, y) => ({ x: x - 250, y }),
  });
  expect(layer.info.positions).toEqual(before);
  expect(layer.info.drops).toBeLessThanOrEqual(256);
  expect(layer.info.impacts).toBeLessThanOrEqual(96);
  for (let i = 0; i < 200; i++) layer.update(16, false, options);
  expect(layer.info.impacts).toBe(0);
  expect(layer.info.drops).toBe(0);
  layer.reset();
  expect(layer.info.positions).toEqual([]);
  layer.sky.destroy({ children: true });
  layer.ground.destroy();
  layer.deck.destroy();
});
it('samples a deck above water and rejects obstacles rather than floating on their faces', () => {
  const { world, bridge } = bridgeFixture();
  const sites = surfaceSites(world),
    moisture = new SurfaceMoisture(sites);
  moisture.step(30000, true);
  expect(sites.sample((bridge.x + 2) * 32, (bridge.y + 1) * 32, moisture)?.material).toBe('deck');
  const blocked = {
    ...world,
    props: [{ id: 0, kind: 'tree' as const, tileX: 10, tileY: 10, solid: true }],
  };
  expect(surfaceSites(blocked).sample(10.5 * 32, 10.8 * 32)).toBeNull();
});
