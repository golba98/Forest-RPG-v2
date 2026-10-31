import { expect, it } from 'vitest';
import { generateWorld } from '../../../src/world/WorldGenerator';
import { Simulation } from '../../../src/simulation/Simulation';
import { canOccupy, hasClearPath } from '../../../src/systems/CollisionSystem';
import { PLAYER_FOOTPRINT } from '../../../src/systems/EntityFootprint';
import { intersectsBridgeReservation } from '../../../src/world/BridgeGeometry';
for (const seed of [42, 1, 123, 456])
  it(`seed ${seed}: deterministic reachable treasure and clear bypasses`, () => {
    const world = generateWorld({ seed, level: 1, difficulty: 'normal' });
    const again = generateWorld({ seed, level: 1, difficulty: 'normal' });
    expect(again).toEqual(world);
    const chests = world.pickupSpawns.filter((p) => p.type === 'chest');
    expect(chests.length).toBeGreaterThan(0);
    expect(chests.length).toBeLessThanOrEqual(4);
    expect(new Set(chests.map((c) => c.id)).size).toBe(chests.length);
    const sim = new Simulation();
    sim.loadWorld(world);
    for (const c of chests) {
      expect(canOccupy(sim.world, c.x + 0.5, c.y + 1.5, PLAYER_FOOTPRINT)).toBe(true);
      expect(
        hasClearPath(sim.world, c.x - 1, c.y + 1.5, c.x + 2, c.y + 1.5, PLAYER_FOOTPRINT),
      ).toBe(true);
      expect(
        intersectsBridgeReservation(world.bridges ?? [], {
          minX: c.x - 2,
          minY: c.y - 2,
          maxX: c.x + 3,
          maxY: c.y + 3,
        }),
      ).toBe(false);
    }
  }, 30000);
