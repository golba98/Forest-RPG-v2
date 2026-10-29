import { expect, test, type Page } from '@playwright/test';
import { bridgeFixture } from '../fixtures/bridge-world';
import { PLAYER_FOOTPRINT } from '../../src/systems/EntityFootprint';

test.setTimeout(90000);
async function load(page: Page) {
  await page.clock.install();
  await page.goto('/?debug=1&autostart=1&tutorial=0&seed=123');
  await page.waitForFunction(
    () => !!window.__RENDER_DEBUG__ && window.__GAME__?.getState().ui.currentMenu === null,
  );
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
  const { world } = bridgeFixture();
  expect(
    await page.evaluate(
      (w) => {
        const game = window.__GAME__!;
        game.saveGame('weather-fixture');
        const save = JSON.parse(localStorage.getItem('forestrpg.v2.save.weather-fixture')!);
        delete save.runtime.moisture;
        delete save.runtime.encounters;
        save.world = w;
        save.entities = save.entities.filter(
          (e: { kind: string }) => e.kind === 'player' || e.kind === 'portal',
        );
        for (const e of save.entities) {
          const p = e.kind === 'player' ? w.spawn : w.portal;
          Object.assign(e, { x: p.x + 0.5, y: p.y + 0.5, prevX: p.x + 0.5, prevY: p.y + 0.5 });
        }
        localStorage.setItem('forestrpg.v2.save.weather-fixture', JSON.stringify(save));
        return game.loadGame('weather-fixture');
      },
      { ...world, tiles: Array.from(world.tiles) },
    ),
  ).toBe(true);
  await page.evaluate(() => {
    window.__GAME__!.setDaylightRatio(0.5);
    window.__RENDER_DEBUG__!.setWeatherPreview('rain');
  });
  await page.clock.runFor(22000);
}
async function moisture(page: Page) {
  return page.evaluate(() => {
    window.__GAME__!.saveGame('weather-check');
    return JSON.parse(localStorage.getItem('forestrpg.v2.save.weather-check')!).runtime
      .moisture as { wetness: number[]; puddles: number[] };
  });
}

test('rain wets offscreen terrain, pools survive camera movement and reload, then dry', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await load(page);
  const before = await moisture(page);
  const pool = await page.evaluate(() =>
    window
      .__RENDER_DEBUG__!.getInfo()
      .puddles!.find((p) => p.x > 350 && p.x < 650 && p.y > 350 && p.y < 850)!,
  );
  expect(pool.amount).toBeGreaterThan(0.3);
  await page.evaluate((p) => window.__GAME__!.setPlayerPosition(p.x / 32, p.y / 32 - 0.2), pool);
  await page.clock.runFor(300);
  await page.screenshot({ path: info.outputPath('sustained-rain.png') });
  expect(
    await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().weather!.impacts),
  ).toBeGreaterThan(0);
  await page.evaluate(() => window.__GAME__!.setPlayerPosition(40, 40));
  await page.clock.runFor(500);
  await page.evaluate((p) => window.__GAME__!.setPlayerPosition(p.x / 32, p.y / 32 - 0.2), pool);
  await page.clock.runFor(500);
  expect(
    await page.evaluate(
      (p) => window.__RENDER_DEBUG__!.getInfo().puddles!.some((q) => q.x === p.x && q.y === p.y),
      pool,
    ),
  ).toBe(true);
  const saved = await moisture(page);
  expect(await page.evaluate(() => window.__GAME__!.loadGame('weather-check'))).toBe(true);
  await page.clock.runFor(16);
  expect((await moisture(page)).puddles).toEqual(saved.puddles);
  await page.evaluate(() => window.__RENDER_DEBUG__!.setWeatherPreview('clear'));
  await page.clock.runFor(5000);
  expect((await moisture(page)).puddles.some((v) => v > 0)).toBe(true);
  await page.screenshot({ path: info.outputPath('rain-stopped.png') });
  // Exercise accelerated simulation time through the existing debug gateway.
  await page.evaluate(() => {
    window.__GAME__!.setTimeScale(8);
    for (let i = 0; i < 400; i++) window.__GAME__!.stepSimulation(0.05);
    window.__GAME__!.setTimeScale(1);
  });
  await page.clock.runFor(32);
  const dry = await moisture(page);
  expect(Math.max(...dry.wetness)).toBe(0);
  expect(Math.max(...dry.puddles)).toBe(0);
  expect(before.puddles.some((v) => v > 0)).toBe(true);
  expect(errors).toEqual([]);
});

test('actual puddle footsteps stay shallow and bridge decks stay dry', async ({ page }) => {
  await load(page);
  const pool = await page.evaluate(() =>
    window.__RENDER_DEBUG__!.getInfo().puddles!.find((p) => p.x < 600 && p.x > 100 && p.y > 100)!,
  );
  await page.evaluate(
    ({ pool, offset }) =>
      window.__GAME__!.setPlayerPosition((pool.x - 9) / 32, pool.y / 32 - offset),
    { pool, offset: PLAYER_FOOTPRINT.offsetY },
  );
  await page.clock.runFor(250);
  expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().weather!.footsteps)).toBe(0);
  await page.keyboard.down('KeyD');
  await page.clock.runFor(100);
  await page.keyboard.up('KeyD');
  expect(
    await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().weather!.footsteps),
  ).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().wading)).toBeNull();
  await page.evaluate(
    (offset) => window.__GAME__!.setPlayerPosition(22.5, 19 - offset),
    PLAYER_FOOTPRINT.offsetY,
  );
  await page.clock.runFor(650);
  expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().wading)).toBeNull();
  await page.keyboard.down('KeyA');
  await page.clock.runFor(800);
  await page.keyboard.up('KeyA');
  expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().wading)).toBeNull();
});
