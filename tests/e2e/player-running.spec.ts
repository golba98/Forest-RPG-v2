import { expect, test } from '@playwright/test';
import type { Entity } from '../../src/types/entities';
import { bridgeFixture } from '../fixtures/bridge-world';

test('keyboard sprint artwork follows all diagonal directions', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem('forestrpg.v2.settings', JSON.stringify({ clouds: false })),
  );
  await page.clock.install();
  await page.goto('/?debug=1&autostart=1&seed=42');
  await page.waitForFunction(() => window.__GAME__?.getState().ui.currentMenu === null);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60000));
  const { world } = bridgeFixture();
  await page.evaluate(
    (fixture) => {
      window.__GAME__!.saveGame('running-qa');
      const save = JSON.parse(localStorage.getItem('forestrpg.v2.save.running-qa')!);
      save.world = fixture;
      delete save.runtime.encounters;
      delete save.runtime.moisture;
      save.entities = save.entities.filter(
        (e: Entity) => e.kind === 'player' || e.kind === 'portal',
      );
      for (const e of save.entities) {
        e.x = e.prevX = e.kind === 'player' ? 24.5 : 40.5;
        e.y = e.prevY = e.kind === 'player' ? 24.5 : 40.5;
      }
      localStorage.setItem('forestrpg.v2.save.running-qa', JSON.stringify(save));
      window.__GAME__!.loadGame('running-qa');
      window.__GAME__!.setDaylightRatio(0.5);
    },
    { ...world, bridges: [], tiles: Array.from(world.tiles, () => 1) },
  );
  await page.clock.runFor(300);
  for (const [direction, horizontal, vertical, dx, dy] of [
    ['SW', 'KeyA', 'KeyS', -1, 1],
    ['SE', 'KeyD', 'KeyS', 1, 1],
    ['NW', 'KeyA', 'KeyW', -1, -1],
    ['NE', 'KeyD', 'KeyW', 1, -1],
  ] as const) {
    await page.evaluate(() => window.__GAME__!.setPlayerPosition(24.5, 24.5));
    await page.keyboard.down(horizontal);
    await page.keyboard.down(vertical);
    await page.keyboard.down('ShiftLeft');
    await page.clock.runFor(350);
    const running = await page.evaluate(() => window.__GAME__!.getState().player);
    expect(running.direction).toBe(direction);
    expect(running.isSprinting).toBe(true);
    expect(Math.sign(running.x - 24.5)).toBe(dx);
    expect(Math.sign(running.y - 24.5)).toBe(dy);
    await page.screenshot({
      path: `docs/qa/evidence/player-running/${info.project.name}-${direction}.png`,
    });
    await page.keyboard.up('ShiftLeft');
    await page.clock.runFor(100);
    expect((await page.evaluate(() => window.__GAME__!.getState().player)).isSprinting).toBe(false);
    await page.keyboard.up(horizontal);
    await page.keyboard.up(vertical);
    await page.clock.runFor(100);
  }
  expect(errors).toEqual([]);
});
