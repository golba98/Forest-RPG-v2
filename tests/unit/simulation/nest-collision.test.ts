import { expect, it } from 'vitest';
import { Simulation } from '../../../src/simulation/Simulation';
import { encounterFixture } from '../../fixtures/encounter-world';
import { IDLE_INTENT } from '../../../src/types/entities';
import { canOccupy, moveWithCollision, queryColliders } from '../../../src/systems/CollisionSystem';
import { entityFootprint, PLAYER_FOOTPRINT } from '../../../src/systems/EntityFootprint';
import { nestBaseBounds, nestLayout } from '../../../src/world/NestGeometry';

for (const sprint of [false, true])
  for (const [dx, dy] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    it(`blocks held ${dx},${dy} movement at ${sprint ? 'sprint/dash' : 'walk'} speed`, () => {
      const s = new Simulation();
      s.loadWorld(encounterFixture());
      const site = s.world.encounterSites![0]!;
      const { originY } = nestLayout(s.world, site);
      const cy = (originY + 53) / 32 - PLAYER_FOOTPRINT.offsetY;
      s.setPlayerPosition(site.x - dx * 2.5, cy - dy * 2.5);
      let hit = false;
      for (let i = 0; i < 600; i++) {
        s.step(1 / 60, { ...IDLE_INTENT, moveX: dx, moveY: dy, sprint });
        expect(canOccupy(s.world, s.player.x, s.player.y, entityFootprint(s.player))).toBe(true);
        if (Math.hypot(s.player.x - site.x, s.player.y - cy) < 2) hit = true;
      }
      expect(hit).toBe(true);
      const before = { x: s.player.x, y: s.player.y };
      s.step(1 / 60, { ...IDLE_INTENT, moveX: -dx, moveY: -dy });
      expect(Math.hypot(s.player.x - before.x, s.player.y - before.y)).toBeGreaterThan(0);
    });
  }
it('stops at the entrance, stays stable, and slides along the union without seam snagging', () => {
  const s = new Simulation();
  s.loadWorld(encounterFixture());
  const site = s.world.encounterSites![0]!;
  s.setPlayerPosition(site.x, site.y + 2);
  for (let i = 0; i < 120; i++) s.step(1 / 60, { ...IDLE_INTENT, moveY: -1 });
  const y = s.player.y;
  const front = Math.max(...nestBaseBounds(s.world, site).map((b) => b.maxY));
  expect(y + PLAYER_FOOTPRINT.offsetY - PLAYER_FOOTPRINT.halfHeight).toBeCloseTo(front, 8);
  for (let i = 0; i < 600; i++) s.step(1 / 60, { ...IDLE_INTENT, moveY: -1 });
  expect(s.player.y).toBe(y);
  const x = s.player.x;
  for (let i = 0; i < 5; i++) s.step(1 / 60, { ...IDLE_INTENT, moveY: -1, moveX: 1 });
  expect(s.player.x).toBeGreaterThan(x);
  expect(canOccupy(s.world, s.player.x, s.player.y, PLAYER_FOOTPRINT)).toBe(true);
});
it('registers player and jumping geometry, excludes padding and leaves enemies unchanged', () => {
  const s = new Simulation();
  s.loadWorld(encounterFixture());
  const site = s.world.encounterSites![0]!;
  const { entrance, originY } = nestLayout(s.world, site);
  const y = (originY + 52) / 32 - PLAYER_FOOTPRINT.offsetY;
  expect(canOccupy(s.world, site.x, y, PLAYER_FOOTPRINT)).toBe(false);
  expect(canOccupy(s.world, site.x, y, PLAYER_FOOTPRINT, 'jumping')).toBe(false);
  expect(canOccupy(s.world, entrance.x, entrance.y, 0.3, 'groundEnemy')).toBe(true);
  expect(canOccupy(s.world, site.x, (originY + 10) / 32, PLAYER_FOOTPRINT)).toBe(true);
  expect(
    queryColliders(s.world, { minX: 0, minY: 0, maxX: 64, maxY: 64 }).filter(
      (c) => c.source === 'nest',
    ),
  ).toHaveLength(3);
  // A large swept step cannot tunnel through the base.
  s.setPlayerPosition(site.x, site.y + 3);
  moveWithCollision(s.world, s.player, 0, -8);
  expect(s.player.y).toBeGreaterThan(site.y - 1);
});
it('repairs a saved interior position, preserves terrain, and keeps the collider after restore', () => {
  const s = new Simulation();
  s.loadWorld(encounterFixture());
  const site = s.world.encounterSites![0]!;
  const { originY } = nestLayout(s.world, site);
  s.player.x = site.x;
  s.player.y = (originY + 52) / 32 - PLAYER_FOOTPRINT.offsetY;
  const entities = structuredClone([...s.getEntities()]);
  const state = s.getRuntimeState();
  const tiles = s.world.tiles.slice();
  s.loadWorld(s.world);
  s.restoreEntities(entities, 0.5, 0, 0, state);
  expect(canOccupy(s.world, s.player.x, s.player.y, PLAYER_FOOTPRINT)).toBe(true);
  expect(Math.hypot(s.player.x - site.x, s.player.y - site.y)).toBeLessThan(3);
  expect(s.world.tiles).toEqual(tiles);
});

it('blocks jumping through the entrance and preserves interaction from behind', () => {
  const s = new Simulation();
  s.loadWorld(encounterFixture());
  const site = s.world.encounterSites![0]!;
  s.setPlayerPosition(site.x, site.y + 2);
  for (let i = 0; i < 180; i++) {
    s.step(1 / 60, { ...IDLE_INTENT, moveY: -1, jump: true });
    expect(canOccupy(s.world, s.player.x, s.player.y, PLAYER_FOOTPRINT)).toBe(true);
  }
  s.setPlayerPosition(site.x, site.y - 4);
  s.step(1 / 60, { ...IDLE_INTENT, interact: true });
  expect(s.getEncounterDebug().bosses[0]?.phase).toBe('warning');
});
