import { it, expect } from 'vitest';
import { Simulation } from '../../../src/simulation/Simulation';
import { IDLE_INTENT } from '../../../src/types/entities';
import { moveWithCollision } from '../../../src/systems/CollisionSystem';

it('normalizes diagonals and retains previous positions', () => {
  const s = new Simulation(); s.setPlayerPosition(3.5, 15.5);
  s.step(1 / 60, { ...IDLE_INTENT, moveX: 1, moveY: 1 });
  expect(Math.hypot(s.player.x - 3.5, s.player.y - 15.5)).toBeCloseTo(6.25 / 60);
  expect(s.player.prevX).toBe(3.5);
});
it('prevents tunnelling through a wall and slides along it', () => {
  const s = new Simulation(); s.setPlayerPosition(3.5, 11.5);
  moveWithCollision(s.world, s.player, 1, -5);
  expect(s.player.y).toBeGreaterThan(11);
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
  const s = new Simulation(); s.player.stats.stamina = 0; s.player.sprintLockoutMs = 4000;
  s.step(1 / 60, { ...IDLE_INTENT, sprint: true, moveX: 1 });
  expect(s.player.isSprinting).toBe(false); expect(s.player.isDashing).toBe(false);
});

it('jumps onto hills and keeps the jump arc in simulation time', async () => {
  const { makeWorld } = await import('../game/fakes');
  const { Tile } = await import('../../../src/types/tiles');
  const world = makeWorld(); world.tiles[4 * 8 + 5] = Tile.HILL_W; world.tiles[4 * 8 + 6] = Tile.PLATEAU;
  const s = new Simulation(); s.loadWorld(world); s.setPlayerPosition(4.5, 4.5);
  for (let i = 0; i < 10; i++) s.step(1 / 60, { ...IDLE_INTENT, moveX: 1 });
  expect(s.player.x).toBeLessThan(5);
  s.step(1 / 60, { ...IDLE_INTENT, jump: true, moveX: 1 });
  expect(s.player.isJumping).toBe(true);
  expect(s.buildRenderSnapshot().entities.find(e => e.id === s.player.id)?.lift).toBeGreaterThan(0);
  for (let i = 0; i < 29; i++) s.step(1 / 60, { ...IDLE_INTENT, moveX: 1 });
  expect(s.player.x).toBeGreaterThan(5);
  expect(s.player.isJumping).toBe(false);
});

it('submerges only on grounded river tiles and slows movement in mud', async () => {
  const { makeWorld } = await import('../game/fakes');
  const { Tile } = await import('../../../src/types/tiles');
  const world = makeWorld(); world.tiles[4 * 8 + 4] = Tile.RIVER;
  const s = new Simulation(); s.loadWorld(world); s.setPlayerPosition(4.5, 4.5);
  expect(s.buildRenderSnapshot().entities.find(e => e.id === s.player.id)?.submerged).toBe(true);
  s.step(1 / 60, { ...IDLE_INTENT, jump: true });
  expect(s.buildRenderSnapshot().entities.find(e => e.id === s.player.id)?.submerged).toBe(false);
  world.tiles[4 * 8 + 4] = Tile.RAMP; s.player.isJumping = false;
  expect(s.buildRenderSnapshot().entities.find(e => e.id === s.player.id)?.submerged).toBe(false);
  world.tiles[4 * 8 + 4] = Tile.MUD; s.setPlayerPosition(4.5, 4.5); s.step(1 / 60, { ...IDLE_INTENT, moveX: 1 });
  expect(s.player.x - 4.5).toBeCloseTo(6.25 * 0.72 / 60);
});

it('returns to safe ground if a jump ends on a solid prop', async () => {
  const { makeWorld } = await import('../game/fakes');
  const world = { ...makeWorld(), props: [{ id: 1, kind: 'log_stump' as const, tileX: 5, tileY: 4, solid: true }] };
  const s = new Simulation(); s.loadWorld(world); s.setPlayerPosition(4.5, 4.5);
  s.step(1 / 60, { ...IDLE_INTENT, jump: true, moveX: 1 });
  for (let i = 0; i < 9; i++) s.step(1 / 60, { ...IDLE_INTENT, moveX: 1 });
  for (let i = 0; i < 20; i++) s.step(1 / 60, { ...IDLE_INTENT });
  expect(s.player.isJumping).toBe(false);
  expect(s.player.x).toBeCloseTo(4.5);
});
