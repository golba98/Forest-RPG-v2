import { expect, type Page } from '@playwright/test';
import { encounterFixture } from '../../fixtures/encounter-world';
import { EncounterDirector } from '../../../src/systems/EncounterDirector';

export async function loadEncounterWorld(page: Page) {
  const world = encounterFixture();
  const state = new EncounterDirector(world, () => { throw new Error('Unexpected initial spawn'); }).state;
  expect(await page.evaluate(({ world, state }) => {
    const g = window.__GAME__!; g.saveGame('contract');
    const data = JSON.parse(localStorage.getItem('forestrpg.v2.save.contract')!);
    data.world = world; data.runtime = { encounters: state, rngState: 123 };
    data.entities = data.entities.filter((e: { kind: string }) => e.kind === 'player' || e.kind === 'portal');
    for (const e of data.entities) {
      const p = e.kind === 'player' ? world.spawn : world.portal;
      Object.assign(e, { x: p.x + .5, y: p.y + .5, prevX: p.x + .5, prevY: p.y + .5 });
      if (e.kind === 'player') e.hauntedIntroComplete = false;
    }
    localStorage.setItem('forestrpg.v2.save.contract', JSON.stringify(data));
    return g.loadGame('contract');
  }, { world: { ...world, tiles: Array.from(world.tiles) }, state })).toBe(true);
}

export async function readyBoss(page: Page) {
  await loadEncounterWorld(page);
  await page.evaluate(() => window.__GAME__!.setPlayerPosition(15.8, 12.2875));
  await page.clock.runFor(300);
  await page.keyboard.press('KeyG'); await page.clock.runFor(900);
  expect(await page.evaluate(() => window.__GAME__!.getGameplayDebug()!.encounters!.bosses[0]!.phase)).toBe('warning');
  await page.clock.runFor(1450);
  expect(await page.evaluate(() => window.__GAME__!.getGameplayDebug()!.encounters!.bosses[0]!.phase)).toBe('emerging');
  await page.keyboard.press('KeyQ'); await page.clock.runFor(17);
  expect(await page.evaluate(() => window.__GAME__!.getGameplayDebug()!.encounters!.bosses[0]!.health)).toBe(15);
  await page.clock.runFor(600);
  expect(await page.evaluate(() => window.__GAME__!.getGameplayDebug()!.encounters!.bosses[0]!.phase)).toBe('fighting');
}

/** Validated combat-ready boss fixture beside a solid wall; passive AI isolates hit displacement. */
export async function bossAtWall(page: Page) {
  await readyBoss(page);
  expect(await page.evaluate(() => {
    const g = window.__GAME__!; g.saveGame('boss-wall');
    const data = JSON.parse(localStorage.getItem('forestrpg.v2.save.boss-wall')!);
    const boss = data.entities.find((e: { kind: string; enemyType?: string }) => e.kind === 'enemy' && e.enemyType === 'beetle');
    const player = data.entities.find((e: { kind: string }) => e.kind === 'player');
    Object.assign(boss, { x: 20.65, y: 20.5, prevX: 20.65, prevY: 20.5, aggressive: false, hurtTimerMs: 0 });
    Object.assign(player, { x: 19.3, y: 20.5, prevX: 19.3, prevY: 20.5, facing: 'E' });
    data.world.tiles[20 * 64 + 21] = 12;
    localStorage.setItem('forestrpg.v2.save.boss-wall', JSON.stringify(data));
    return g.loadGame('boss-wall');
  })).toBe(true);
  const before = await page.evaluate(() => window.__GAME__!.getState().enemies.find(e => e.type === 'beetle')!);
  expect(before.health).toBe(15);
  expect(before.immuneToCrush).toBe(true); expect(before.resistsKnockback).toBe(true);
  await page.keyboard.press('KeyE'); await page.clock.runFor(150);
  const after = await page.evaluate(id => window.__GAME__!.getState().enemies.find(e => e.id === id)!, before.id);
  expect(after.health).toBe(14);
  expect(after.x).toBe(before.x); expect(after.y).toBe(before.y);
}
