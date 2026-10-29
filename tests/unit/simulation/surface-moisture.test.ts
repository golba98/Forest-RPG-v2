import { expect, it } from 'vitest';
import { SurfaceMoisture, surfaceSites } from '../../../src/systems/SurfaceMoisture';
import { surfaceAt } from '../../../src/systems/SurfaceState';
import { bridgeFixture } from '../../fixtures/bridge-world';
import { Simulation } from '../../../src/simulation/Simulation';

it('accumulates stable offscreen pools, preserves shallow gameplay and dries gradually', () => {
  const { world, bridge } = bridgeFixture(),
    sites = surfaceSites(world),
    state = new SurfaceMoisture(sites);
  state.step(5000, true);
  expect(Math.max(...state.puddles)).toBe(0);
  state.step(20000, true);
  const [i, site] = [...sites.pools][0]!;
  expect(state.wetness[i]).toBeCloseTo(1);
  expect(state.puddles[i]).toBeGreaterThan(0.5);
  expect(sites.puddleAt(site.x, site.y, state)).toBe(true);
  expect(surfaceAt(world, site.x / 32, site.y / 32).kind).toBe('ground');
  expect(surfaceAt(world, bridge.x + 2, bridge.y + 1).kind).toBe('deck');
  expect(sites.puddleAt(site.x, site.y, state)).toBe(true);
  state.step(10000, false);
  expect(sites.puddleAt(site.x, site.y, state)).toBe(true);
  const saved = state.save(),
    restored = new SurfaceMoisture(surfaceSites(world));
  restored.restore(saved);
  expect(restored.save()).toEqual(saved);
  restored.step(130000, false);
  expect(Math.max(...restored.wetness)).toBe(0);
  expect(Math.max(...restored.puddles)).toBe(0);
});
it('restores moisture through simulation runtime without changing terrain or player support', () => {
  const { world } = bridgeFixture(),
    sim = new Simulation();
  sim.loadWorld(world);
  sim.moisture.step(30000, true);
  const snapshot = sim.getRuntimeState(),
    tiles = world.tiles.slice(),
    state = sim.getEntities().map((e) => structuredClone(e));
  sim.loadWorld(world);
  sim.restoreEntities(state, 0.5, 30000, 0, snapshot);
  expect(sim.moisture.save()).toEqual(snapshot.moisture);
  expect(sim.world.tiles).toEqual(tiles);
});
