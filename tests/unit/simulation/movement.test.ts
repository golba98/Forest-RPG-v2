import { entityFootprint } from '../../../src/systems/EntityFootprint';
import { canOccupy } from '../../../src/systems/CollisionSystem';
import { describe, it, expect } from 'vitest';
import { Simulation } from '../../../src/simulation/Simulation';
import { IDLE_INTENT } from '../../../src/types/entities';
import { moveWithCollision } from '../../../src/systems/CollisionSystem';

it('normalizes diagonals and retains previous positions', () => {
  const s = new Simulation();
  s.setPlayerPosition(3.5, 15.5);
  s.step(1 / 60, { ...IDLE_INTENT, moveX: 1, moveY: 1 });
  expect(Math.hypot(s.player.x - 3.5, s.player.y - 15.5)).toBeCloseTo(6.25 / 60);
  expect(s.player.prevX).toBe(3.5);
});
it('prevents tunnelling through a wall and slides along it', () => {
  const s = new Simulation();
  s.setPlayerPosition(3.5, 11.5);
  moveWithCollision(s.world, s.player, 1, -5);
  expect(canOccupy(s.world, s.player.x, s.player.y, entityFootprint(s.player))).toBe(true);
  expect(s.player.y).toBeCloseTo(10.8875);
  expect(s.player.x).toBeCloseTo(4.5);
});
it('exhausts stamina and enforces the sprint lockout', () => {
  const s = new Simulation();
  for (let n = 0; n < 181; n++) s.step(1 / 60, { ...IDLE_INTENT, sprint: true, moveX: 1 });
  expect(s.player.sprintLockoutMs).toBeGreaterThan(3900);
  s.step(1 / 60, { ...IDLE_INTENT, sprint: true, moveX: 1 });
  expect(s.player.isSprinting).toBe(false);
});

it('cannot start a dash while sprint is locked out', () => {
  const s = new Simulation();
  s.player.stats.stamina = 0;
  s.player.sprintLockoutMs = 4000;
  s.step(1 / 60, { ...IDLE_INTENT, sprint: true, moveX: 1 });
  expect(s.player.isSprinting).toBe(false);
  expect(s.player.isDashing).toBe(false);
});

it('keeps the jump arc in simulation time and climbs a cliff edge by jumping', async () => {
  const { makeWorld } = await import('../game/fakes');
  const { Tile } = await import('../../../src/types/tiles');
  const world = makeWorld();
  for (let y = 3; y <= 5; y++) {
    world.tiles[y * 8 + 5] = Tile.HILL_W;
    world.tiles[y * 8 + 6] = Tile.PLATEAU;
  }
  const s = new Simulation();
  s.loadWorld(world);
  s.setPlayerPosition(4.5, 4.5);
  for (let i = 0; i < 10; i++) s.step(1 / 60, { ...IDLE_INTENT, moveX: 1 });
  expect(s.player.x).toBeLessThan(5);
  s.step(1 / 60, { ...IDLE_INTENT, jump: true, moveX: 1 });
  expect(s.player.isJumping).toBe(true);
  expect(s.buildRenderSnapshot().entities.find((e) => e.id === s.player.id)?.lift).toBeGreaterThan(
    0,
  );
  for (let i = 0; i < 29; i++) s.step(1 / 60, { ...IDLE_INTENT, moveX: 1 });
  // Walking stopped at the edge; the jump cleared it and landed on the hill top.
  expect(s.player.x).toBeGreaterThan(6.2);
  expect(s.player.isJumping).toBe(false);
});

it('submerges only on grounded river tiles and slows movement in mud', async () => {
  const { makeWorld } = await import('../game/fakes');
  const { Tile } = await import('../../../src/types/tiles');
  const world = makeWorld();
  world.tiles[4 * 8 + 4] = Tile.RIVER;
  const s = new Simulation();
  s.loadWorld(world);
  s.setPlayerPosition(4.5, 4.5);
  expect(s.buildRenderSnapshot().entities.find((e) => e.id === s.player.id)?.submerged).toBe(true);
  s.step(1 / 60, { ...IDLE_INTENT, jump: true });
  expect(s.buildRenderSnapshot().entities.find((e) => e.id === s.player.id)?.submerged).toBe(false);
  world.tiles[4 * 8 + 4] = Tile.RAMP;
  s.player.isJumping = false;
  expect(s.buildRenderSnapshot().entities.find((e) => e.id === s.player.id)?.submerged).toBe(false);
  world.tiles[4 * 8 + 4] = Tile.MUD;
  s.setPlayerPosition(4.5, 4.5);
  s.step(1 / 60, { ...IDLE_INTENT, moveX: 1 });
  expect(s.player.x - 4.5).toBeCloseTo((6.25 * 0.72) / 60);
});

it('stays dry and at full speed with feet on a hill rim below a river', async () => {
  const { makeWorld } = await import('../game/fakes');
  const { Tile } = await import('../../../src/types/tiles');
  const world = makeWorld();
  for (let x = 0; x < 8; x++) {
    world.tiles[3 * 8 + x] = Tile.RIVER;
    for (let y = 4; y < 8; y++) world.tiles[y * 8 + x] = Tile.PLATEAU;
  }
  const s = new Simulation();
  s.loadWorld(world);
  s.setPlayerPosition(4.5, 5);
  for (let i = 0; i < 120; i++) s.step(1 / 60, { ...IDLE_INTENT, moveY: -1 });
  // The anchor sits above the feet, inside the river row; the feet are on the hill.
  expect(Math.floor(s.player.y)).toBe(3);
  const player = () => s.buildRenderSnapshot().entities.find((e) => e.id === s.player.id);
  expect(player()?.submerged).toBe(false);
  expect(s.getGameplayDebug().tile).toEqual({ x: 4, y: 4 });
  s.step(1 / 60, { ...IDLE_INTENT, moveX: 1 });
  expect(s.player.x - 4.5).toBeCloseTo(6.25 / 60);
  world.tiles[4 * 8 + 4] = Tile.RIVER;
  world.tiles[4 * 8 + 5] = Tile.RIVER;
  s.setPlayerPosition(4.5, 4.5);
  expect(player()?.submerged).toBe(true);
});

it('returns to safe ground if a jump ends on a solid prop', async () => {
  const { makeWorld } = await import('../game/fakes');
  const world = {
    ...makeWorld(),
    props: [{ id: 1, kind: 'log_stump' as const, tileX: 5, tileY: 4, solid: true }],
  };
  const s = new Simulation();
  s.loadWorld(world);
  s.setPlayerPosition(4.5, 4.5);
  s.step(1 / 60, { ...IDLE_INTENT, jump: true, moveX: 1 });
  for (let i = 0; i < 9; i++) s.step(1 / 60, { ...IDLE_INTENT, moveX: 1 });
  for (let i = 0; i < 20; i++) s.step(1 / 60, { ...IDLE_INTENT });
  expect(s.player.isJumping).toBe(false);
  expect(s.player.x).toBeCloseTo(4.5);
});

describe('jump distance', () => {
  async function jumpDistance(
    intent: Partial<import('../../../src/types/entities').PlayerIntent>,
    setup?: (s: Simulation) => void,
  ) {
    const { makeWorld } = await import('../game/fakes');
    const world = {
      ...makeWorld(),
      meta: { ...makeWorld().meta, width: 20, height: 8 },
      tiles: new Uint8Array(160).fill(1),
    };
    const s = new Simulation();
    s.loadWorld(world);
    s.setPlayerPosition(2.5, 4.5);
    setup?.(s);
    s.step(1 / 60, { ...IDLE_INTENT, ...intent, moveX: 1, jump: true });
    // Airborne travel only: the landing step itself moves at ground speed.
    let landedAt = s.player.x;
    while (s.player.isJumping) {
      landedAt = s.player.x;
      s.step(1 / 60, { ...IDLE_INTENT, ...intent, moveX: 1 });
    }
    return landedAt - 2.5;
  }
  it('covers about two tiles when walking', async () => {
    const d = await jumpDistance({});
    expect(d).toBeGreaterThanOrEqual(1.7);
    expect(d).toBeLessThanOrEqual(2.1);
  });
  it('caps sprint, dash and speed-potion jumps', async () => {
    expect(await jumpDistance({ sprint: true })).toBeLessThanOrEqual(2.2);
    expect(await jumpDistance({ sprint: true, dash: true })).toBeLessThanOrEqual(2.2);
    expect(
      await jumpDistance({}, (s) => {
        s.player.speedBuffMs = 5000;
      }),
    ).toBeLessThanOrEqual(2.2);
  });
});
