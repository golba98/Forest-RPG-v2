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
