import { expect, it } from 'vitest';
import { Simulation } from '../../../src/simulation/Simulation';
import { EnemyAISystem } from '../../../src/systems/EnemyAISystem';
import { IDLE_INTENT, type EnemyEntity } from '../../../src/types/entities';
import { Tile } from '../../../src/types/tiles';
import { canOccupy } from '../../../src/systems/CollisionSystem';
import { makeWorld } from '../game/fakes';
const idle = { ...IDLE_INTENT };
function setup() {
  const w = {
    ...makeWorld(),
    meta: { ...makeWorld().meta, width: 20, height: 20 },
    tiles: new Uint8Array(400).fill(Tile.GRASS),
    spawn: { x: 2, y: 4 },
    portal: { x: 18, y: 18 },
  };
  const s = new Simulation();
  s.loadWorld(w);
  return s;
}
function enemy(
  s: Simulation,
  type: 'mantis' | 'maggot' | 'beetle' | 'ghost',
  x: number,
  y: number,
) {
  const id = s.spawnEnemy(type, x, y);
  return s.getEntities().find((e) => e.id === id) as EnemyEntity;
}
function step(s: Simulation, frames: number) {
  for (let i = 0; i < frames; i++) s.step(1 / 60, idle);
}
it('detects only visible ground targets and chases them', () => {
  const s = setup(),
    e = enemy(s, 'mantis', 6.5, 4.5);
  s.world.tiles[4 * 20 + 4] = Tile.CLIFF;
  step(s, 20);
  expect(e.aiState).toBe('idle');
  s.setPlayerPosition(2.5, 6.5);
  step(s, 60);
  expect(e.aiState).not.toBe('idle');
  expect(e.x).toBeLessThan(6.5);
});
it('routes around a cliff edge after losing sight and never enters it', () => {
  const s = setup(),
    e = enemy(s, 'mantis', 5.5, 4.5);
  step(s, 1);
  s.world.tiles[4 * 20 + 4] = Tile.HILL_N;
  s.setPlayerPosition(3.5, 4.5);
  let detoured = false;
  for (let i = 0; i < 120; i++) {
    s.step(1 / 60, idle);
    expect(canOccupy(s.world, e.x, e.y, e.halfSize, 'groundEnemy')).toBe(true);
    if (Math.abs(e.y - 4.5) > 0.5) detoured = true;
  }
  expect(detoured).toBe(true);
  expect(e.x).toBeLessThan(4.5);
});
it('telegraphs attacks, consumes a single strike and observes cooldown', () => {
  const s = setup();
  s.setPlayerPosition(3.5, 4.5);
  const e = enemy(s, 'mantis', 4.2, 4.5);
  step(s, 1);
  expect(e.attackPhase).toBe('windup');
  expect(s.player.stats.health).toBe(7);
  step(s, 16);
  expect(s.player.stats.health).toBe(6);
  s.player.hurtTimerMs = 0;
  step(s, 20);
  expect(s.player.stats.health).toBe(6);
  expect(e.attackCooldownMs).toBeGreaterThan(0);
});
it('cancels a windup when stunned and cannot hit through a new obstacle', () => {
  const s = setup();
  s.setPlayerPosition(3.5, 4.5);
  const e = enemy(s, 'mantis', 4.2, 4.5);
  step(s, 1);
  e.hurtTimerMs = 500;
  step(s, 20);
  expect(e.aiState).toBe('stunned');
  expect(s.player.stats.health).toBe(7);
  const r = setup();
  const m = enemy(r, 'maggot', 6.5, 4.5);
  step(r, 1);
  r.world.tiles[4 * 20 + 4] = Tile.CLIFF;
  step(r, 30);
  expect(r.getEntities().some((e) => e.kind === 'projectile')).toBe(false);
  expect(m.alive).toBe(true);
});
it('loses targets, returns, and does not teleport toward unreachable targets', () => {
  const s = setup(),
    e = enemy(s, 'beetle', 6.5, 4.5);
  step(s, 30);
  s.setPlayerPosition(18.5, 18.5);
  step(s, 300);
  expect(['return', 'idle']).toContain(e.aiState);
  expect(Math.hypot(e.x - 6.5, e.y - 4.5)).toBeLessThan(0.5);
  const r = setup(),
    b = enemy(r, 'beetle', 7.5, 4.5);
  step(r, 1);
  for (let y = 0; y < 20; y++) r.world.tiles[y * 20 + 5] = Tile.CLIFF;
  step(r, 400);
  expect(b.x).toBeGreaterThanOrEqual(6.3);
  expect(canOccupy(r.world, b.x, b.y, 0.3, 'groundEnemy')).toBe(true);
});
it('separates overlapping enemies and drops navigation on death/world replacement', () => {
  const s = setup(),
    a = enemy(s, 'mantis', 6.5, 4.5),
    b = enemy(s, 'mantis', 6.5, 4.5);
  step(s, 40);
  expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.1);
  const ai = new EnemyAISystem(),
    actions = { hurt: () => {}, shoot: () => {} };
  ai.step(s.world, s.player, [a, b], 1 / 60, actions);
  a.alive = false;
  ai.step(s.world, s.player, [a, b], 1 / 60, actions);
  expect(ai.debug().map((e) => e.id)).not.toContain(a.id);
  ai.step({ ...s.world }, s.player, [], 1 / 60, actions);
  expect(ai.debug()).toHaveLength(0);
});

it('connects an enemy standing beside a trunk to a clear navigation node', () => {
  const s = setup();
  s.loadWorld({ ...s.world, props: [{ id: 1, kind: 'tree', tileX: 6, tileY: 4, solid: true }] });
  s.setPlayerPosition(2.5, 4.1);
  const e = enemy(s, 'mantis', 6.9, 4.1);
  step(s, 1);
  expect(canOccupy(s.world, 6.5, 4.5, 0.3, 'groundEnemy')).toBe(false);
  s.world.tiles[4 * 20 + 4] = Tile.CLIFF;
  step(s, 120);
  expect(canOccupy(s.world, e.x, e.y, 0.3, 'groundEnemy')).toBe(true);
  expect(e.x).toBeLessThan(5);
});
