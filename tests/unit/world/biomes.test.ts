import { describe, expect, it } from 'vitest';
import { generateEnvironment, Geography } from '../../../src/world/Geography';
import { validEnvironment } from '../../../src/world/Biomes';
import { generateWorld } from '../../../src/world/WorldGenerator';
import { Tile, TILE_PROPERTIES } from '../../../src/types/tiles';
import { landscapeFixture } from '../../fixtures/landscape-world';
import { Simulation } from '../../../src/simulation/Simulation';
import { canOccupy, moveWithCollision } from '../../../src/systems/CollisionSystem';
import { PLAYER_FOOTPRINT as F } from '../../../src/systems/EntityFootprint';
import { propFootprint } from '../../../src/world/ObjectSemantics';
import { LandscapePlan } from '../../../src/world/LandscapePlan';
import { requiredBridgeAccess } from '../../../src/world/LandscapeAccess';
import { validBridgeTerrain } from '../../../src/world/generation/bridges';
import { GenGrid } from '../../../src/world/generation/GenGrid';

describe('coordinate geography', () => {
  it('preserves seed-111 bridge landings through final reachability pruning', () => {
    const world = generateWorld({ seed: 111, level: 1, difficulty: 'normal' });
    const grid = new GenGrid(world.meta.width, world.meta.height, Tile.GRASS);
    grid.tiles.set(world.tiles);
    const plan = new LandscapePlan(world, 'access');
    expect(world.bridges!.length).toBeGreaterThan(0);
    for (const bridge of world.bridges!) {
      expect(validBridgeTerrain(grid, bridge)).toBe(true);
      expect(requiredBridgeAccess(plan, bridge).ok).toBe(true);
    }
  });
  it('agrees across positive and negative windows regardless of query order', () => {
    for (const seed of [1, 42, 123, 1337]) {
      const full = generateEnvironment(seed, -20, -17, 40, 34);
      for (const [ox, oy] of [
        [0, 0],
        [-20, 0],
        [0, -17],
        [-20, -17],
      ]) {
        const part = generateEnvironment(seed, ox!, oy!, 20, 17);
        for (const key of [
          'biome',
          'secondary',
          'blend',
          'relief',
          'cover',
          'moisture',
          'material',
        ] as const)
          for (let y = 0; y < 17; y++)
            for (let x = 0; x < 20; x++)
              expect(part[key][y * 20 + x]).toBe(full[key][(oy! + 17 + y) * 40 + ox! + 20 + x]);
      }
      const geo = new Geography(seed);
      expect(geo.sample(-19, 27)).not.toEqual(geo.sample(19, 27));
      const sample = geo.sample(-19, 27);
      geo.sample(15000, -9000);
      expect(geo.sample(-19, 27)).toEqual(sample);
    }
  });
  it('contains substantial cores of all five biomes in each standard map', () => {
    for (const seed of [1, 42, 123, 1337, 999]) {
      const env = generateEnvironment(seed, 0, 0, 150, 150);
      expect(validEnvironment(env, 22500)).toBe(true);
      for (let b = 0; b < 5; b++)
        expect(env.biome.filter((n, i) => n === b && env.blend[i] === 0).length).toBeGreaterThan(
          500,
        );
      expect(validEnvironment({ ...env, biome: [9] }, 22500)).toBe(false);
    }
  });
  it('keeps shallow marsh water walkable for both actors and old saves authoritative', () => {
    expect(TILE_PROPERTIES[Tile.SHALLOW_WATER]).toMatchObject({
      solid: false,
      blocksMobs: false,
      speedMultiplier: 0.72,
    });
    const old = landscapeFixture(),
      sim = new Simulation();
    sim.loadWorld(old);
    expect(sim.world).toEqual(old);
    expect(sim.world.environment).toBeUndefined();
  });
  it('persists independently reproducible environment and tree identities in generated output', () => {
    const a = generateWorld({ seed: 42, level: 1, difficulty: 'normal' }),
      b = generateWorld({ seed: 42, level: 1, difficulty: 'normal' });
    expect(a).toEqual(b);
    expect(a.meta.generatorVersion).toBe(13);
    const trees = a.props.filter((p) => p.kind === 'tree');
    expect(new Set(trees.map((p) => p.featureKey)).size).toBe(trees.length);
    expect(trees.every((p) => p.variant !== undefined && p.variant < 14)).toBe(true);
    expect(new Set(a.environment!.biome).size).toBe(5);
  });
  it('stops the player at new large tree trunks from every approach', () => {
    const world = generateWorld({ seed: 42, level: 1, difficulty: 'normal' });
    const sim = new Simulation();
    sim.loadWorld(world);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      let checked = false;
      for (const p of world.props.filter((p) => p.kind === 'tree' && p.variant! < 12)) {
        const b = propFootprint(p)!;
        const x =
          p.tileX +
          (dx === 1
            ? b.minX - F.halfWidth - 0.1
            : dx === -1
              ? b.maxX + F.halfWidth + 0.1
              : (b.minX + b.maxX) / 2);
        const y =
          p.tileY -
          F.offsetY +
          (dy === 1
            ? b.minY - F.halfHeight - 0.1
            : dy === -1
              ? b.maxY + F.halfHeight + 0.1
              : (b.minY + b.maxY) / 2);
        if (!canOccupy(sim.world, x, y, F)) continue;
        sim.setPlayerPosition(x, y);
        moveWithCollision(sim.world, sim.player, dx!, dy!);
        expect(Math.hypot(sim.player.x - x, sim.player.y - y)).toBeCloseTo(0.1, 5);
        expect(canOccupy(sim.world, sim.player.x, sim.player.y, F)).toBe(true);
        checked = true;
        break;
      }
      expect(checked).toBe(true);
    }
  });
});
