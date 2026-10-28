import { expect, test, type Page } from '@playwright/test';
import { shorelineFixture } from '../fixtures/shoreline-world';
import { bridgeFixture } from '../fixtures/bridge-world';
import { PLAYER_FOOTPRINT as F } from '../../src/systems/EntityFootprint';
import { Tile } from '../../src/types/tiles';
import type { WorldData } from '../../src/types/world';

async function load(page: Page, world: WorldData) {
  await page.clock.install();
  await page.goto('/?debug=1&autostart=1&tutorial=0&seed=123');
  await page.waitForFunction(
    () => !!window.__RENDER_DEBUG__ && window.__GAME__?.getState().ui.currentMenu === null,
  );
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  expect(
    await page.evaluate(
      (w) => {
        const g = window.__GAME__!;
        g.saveGame('shoreline-fixture');
        const save = JSON.parse(localStorage.getItem('forestrpg.v2.save.shoreline-fixture')!);
        delete save.runtime.encounters;
    save.world = w;
        save.entities = save.entities.filter(
          (e: { kind: string }) => e.kind === 'player' || e.kind === 'portal',
        );
        for (const e of save.entities) {
          const p = e.kind === 'player' ? w.spawn : w.portal;
          Object.assign(e, { x: p.x + 0.5, y: p.y + 0.5, prevX: p.x + 0.5, prevY: p.y + 0.5 });
        }
        localStorage.setItem('forestrpg.v2.save.shoreline-fixture', JSON.stringify(save));
        return g.loadGame('shoreline-fixture');
      },
      { ...world, tiles: Array.from(world.tiles) },
    ),
  ).toBe(true);
  await page.evaluate(() => window.__GAME__!.setDaylightRatio(0.5));
  await page.locator('canvas').evaluate((canvas) => {
    canvas.tabIndex = 0;
    canvas.focus();
  });
  await page.clock.runFor(300);
}

async function hold(page: Page, keys: string[], duration = 1000) {
  for (const key of keys) await page.keyboard.down(key);
  await page.clock.runFor(duration);
  for (const key of keys) await page.keyboard.up(key);
  await page.clock.runFor(100);
}

test('reported plateau bank: dry and swimming contact, diagonal sliding, shore transitions and reload', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await load(page, shorelineFixture());
  await page.evaluate(() => window.__GAME__!.setPlayerPosition(12.5, 16.6));
  await hold(page, ['KeyS']);
  let feet = await page.evaluate(() => window.__GAME__!.getGameplayDebug()!.playerFootprint);
  expect(feet.maxY).toBeCloseTo(17.375);
  expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().wading)).toBeNull();
  await hold(page, ['KeyS', 'KeyD'], 250);
  feet = await page.evaluate(() => window.__GAME__!.getGameplayDebug()!.playerFootprint);
  expect(feet.maxY).toBeCloseTo(17.375);
  await page.screenshot({ path: info.outputPath('bank-dry.png') });

  await page.evaluate(() => window.__GAME__!.setPlayerPosition(12.5, 19));
  await hold(page, ['KeyW']);
  feet = await page.evaluate(() => window.__GAME__!.getGameplayDebug()!.playerFootprint);
  expect(feet.minY).toBeCloseTo(18);
  let wading = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().wading);
  expect(wading).not.toBeNull();
  expect(wading!.waterlineY / 32).toBeCloseTo((feet.minY + feet.maxY) / 2);
  await page.screenshot({ path: info.outputPath('bank-swimming.png') });
  await page.evaluate(() =>
    window.__RENDER_DEBUG__!.setFlags({ enabled: true, colliders: true, labels: false }),
  );
  await page.clock.runFor(100);
  await page.screenshot({ path: info.outputPath('bank-swimming-feet.png') });
  await page.evaluate(() => window.__RENDER_DEBUG__!.setFlags({ enabled: false }));
  await hold(page, ['KeyW', 'KeyD'], 250);
  feet = await page.evaluate(() => window.__GAME__!.getGameplayDebug()!.playerFootprint);
  expect(feet.minY).toBeCloseTo(18);
  expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().wading)).not.toBeNull();

  expect(await page.evaluate(() => window.__GAME__!.saveGame('shore-contact'))).toBe(true);
  expect(await page.evaluate(() => window.__GAME__!.loadGame('shore-contact'))).toBe(true);
  await page.clock.runFor(200);
  expect(await page.evaluate(() => window.__GAME__!.getGameplayDebug()!.playerFootprint)).toEqual(
    feet,
  );
  expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().wading)).not.toBeNull();

  // The grass shore to the west of the plateau is a legitimate entry/exit.
  await page.evaluate(() => window.__GAME__!.setPlayerPosition(2.5, 17.2));
  await hold(page, ['KeyS'], 350);
  wading = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().wading);
  expect(wading).not.toBeNull();
  await hold(page, ['KeyW'], 500);
  expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().wading)).toBeNull();
  expect(errors).toEqual([]);
});

for (const orientation of ['horizontal', 'vertical'] as const)
  test(`${orientation} bridge crosses raised-bank landings in both directions and stays dry`, async ({
    page,
  }, info) => {
    const { world, bridge } = bridgeFixture(orientation);
    for (let y = 1; y < 47; y++)
      for (let x = 1; x < 47; x++)
        if (world.tiles[y * 48 + x] === Tile.GRASS) world.tiles[y * 48 + x] = Tile.PLATEAU;
    await load(page, world);
    const horizontal = orientation === 'horizontal';
    const start = {
      x: bridge.x + (horizontal ? -0.5 : 1),
      y: bridge.y + (horizontal ? 1 : -0.5) - F.offsetY,
    };
    await page.evaluate((p) => window.__GAME__!.setPlayerPosition(p.x, p.y), start);
    for (const direction of [1, -1]) {
      const key = horizontal
        ? direction === 1
          ? 'KeyD'
          : 'KeyA'
        : direction === 1
          ? 'KeyS'
          : 'KeyW';
      for (let i = 0; i < 12; i++) {
        await hold(page, [key], 100);
        expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().wading)).toBeNull();
      }
      const p = await page.evaluate(() => window.__GAME__!.getState().player);
      if (direction === 1) {
        expect(horizontal ? p.x : p.y + F.offsetY).toBeGreaterThan(
          (horizontal ? bridge.x : bridge.y) + bridge.span + 2,
        );
        await page.screenshot({ path: info.outputPath(`${orientation}-raised-landing.png`) });
      } else expect(horizontal ? p.x : p.y).toBeCloseTo(horizontal ? start.x : start.y, 0);
    }
  });
