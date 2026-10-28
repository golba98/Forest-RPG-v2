import { it, expect } from 'vitest';
import { Simulation } from '../../../src/simulation/Simulation';
import { IDLE_INTENT } from '../../../src/types/entities';
it('lands melee damage on the attack tick and kills the tutorial dummy', () => {
  const s = new Simulation(); s.setPlayerPosition(5.5, 6.5); s.player.facing = 'N';
  const dummy = s.getEntities().find(e => e.kind === 'enemy');
  expect(dummy?.kind).toBe('enemy');
  for (let hit = 0; hit < 5; hit++) {
    s.step(1 / 60, { ...IDLE_INTENT, attack: true });
    for (let frame = 0; frame < 50; frame++) s.step(1 / 60, { ...IDLE_INTENT });
  }
  expect(dummy?.alive).toBe(false); expect(s.player.stats.xp).toBe(0); expect(s.player.stats.level).toBe(2);
});
it('chases and damages the player with an invulnerability window', () => {
  const s = new Simulation(); s.setPlayerPosition(3.5, 15.5);
  const id = s.spawnEnemy('mantis', 5.5, 15.5);
  for (let n = 0; n < 90; n++) s.step(1 / 60, { ...IDLE_INTENT });
  expect(s.getEntities().find(e => e.id === id)?.x).toBeLessThan(5.5);
  expect(s.player.stats.health).toBeLessThan(7);
  const health = s.player.stats.health; s.step(1 / 60, { ...IDLE_INTENT });
  expect(s.player.stats.health).toBe(health);
});
it('collects coins and spends spin mana only when available', () => {
  const s = new Simulation(); s.setPlayerPosition(15.5, 5.5); s.step(1 / 60, { ...IDLE_INTENT });
  expect(s.player.stats.coins).toBe(1);
  s.step(1 / 60, { ...IDLE_INTENT, skillQ: true }); expect(s.player.stats.mana).toBe(70);
  s.player.stats.mana = 0; s.step(1 / 60, { ...IDLE_INTENT, skillQ: true }); expect(s.player.stats.mana).toBeLessThan(1);
});

it('bolt projectiles damage targets and are removed after impact', () => {
  const s = new Simulation(); s.setPlayerPosition(5.5, 7.5); s.player.facing = 'N';
  s.step(1 / 60, { ...IDLE_INTENT, skillE: true });
  for (let i = 0; i < 30; i++) s.step(1 / 60, { ...IDLE_INTENT });
  const dummy = s.getEntities().find(e => e.kind === 'enemy');
  expect(dummy?.kind === 'enemy' && dummy.health).toBe(3);
  expect(s.getEntities().some(e => e.kind === 'projectile')).toBe(false);
});
