import { it, expect } from 'vitest';
import { Simulation } from '../../../src/simulation/Simulation';
import { IDLE_INTENT } from '../../../src/types/entities';
import { Tile } from '../../../src/types/tiles';
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

it('maggots fire acid and the projectile can hurt the player', async () => {
  const { makeWorld } = await import('../game/fakes');
  const s = new Simulation(); s.loadWorld(makeWorld());
  s.spawnEnemy('maggot', 6.5, 4.5);
  for (let i = 0; i < 30; i++) s.step(1 / 60, { ...IDLE_INTENT });
  expect(s.player.stats.health).toBeLessThan(7);
});

it('does not spawn a random ghost ring when night begins', async () => {
  const { makeWorld } = await import('../game/fakes');
  const s = new Simulation(); s.loadWorld(makeWorld());
  s.setTimeOfDay(0.95); s.step(1 / 60, { ...IDLE_INTENT });
  expect(s.getEntities().filter(e => e.kind === 'enemy' && e.enemyType === 'ghost' && e.alive)).toHaveLength(0);
  s.setTimeOfDay(0.3); s.step(1 / 60, { ...IDLE_INTENT });
  expect(s.getEntities().filter(e => e.kind === 'enemy' && e.enemyType === 'ghost' && e.alive)).toHaveLength(0);
});

it('spends stat points and respects the health cap', () => {
  const s = new Simulation(); s.player.stats.statPoints = 3;
  expect(s.allocateStat('mana')).toBe(true); expect(s.player.stats.maxMana).toBe(125);
  s.player.stats.maxHealth = 20; expect(s.allocateStat('health')).toBe(false);
  expect(s.player.stats.statPoints).toBe(2);
  expect(s.allocateStat('damage')).toBe(true); expect(s.player.stats.baseDamage).toBe(2);
});

it('cuts a flower tile and a flower prop in the facing cone, but leaves flowers behind the player', async () => {
  const { makeWorld } = await import('../game/fakes');
  const world = makeWorld();
  world.tiles[4 * 8 + 5] = Tile.FLOWERS;
  world.tiles[4 * 8 + 3] = Tile.FLOWERS;
  (world.props as import('../../../src/types/world').WorldProp[]).push({ id: 1, kind: 'flower_pink', tileX: 5, tileY: 4, solid: false });
  const s = new Simulation(); s.loadWorld(world); s.player.facing = 'E';
  const changes: Array<number | undefined> = [];
  s.onCut = (_x, _y, id) => changes.push(id);
  s.step(1 / 60, { ...IDLE_INTENT, attack: true });
  for (let i = 0; i < 10; i++) s.step(1 / 60, { ...IDLE_INTENT });
  expect(world.tiles[4 * 8 + 5]).toBe(Tile.GRASS);
  expect(world.tiles[4 * 8 + 3]).toBe(Tile.FLOWERS);
  expect(world.props).toHaveLength(0);
  expect(changes).toEqual([undefined, 1]);
});
