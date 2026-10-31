import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { bridgeFixture } from '../fixtures/bridge-world';
import type { Entity, PickupEntity } from '../../src/types/entities';
import type { WorldData } from '../../src/types/world';

async function capture(page: Page, info: TestInfo, name: string) {
  await page.screenshot({
    path: info.outputPath(`${info.project.name}-${name}.png`),
  });
}
async function saved(page: Page) {
  return page.evaluate(() => {
    window.__GAME__!.saveGame('art-qa');
    return JSON.parse(localStorage.getItem('forestrpg.v2.save.art-qa')!);
  });
}
async function move(page: Page, x: number, y: number) {
  await page.evaluate(({ x, y }) => window.__GAME__!.setPlayerPosition(x, y), { x, y });
  await page.clock.runFor(800);
}
async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.text().includes('missing texture')) errors.push(m.text());
  });
  await page.addInitScript(() =>
    localStorage.setItem('forestrpg.v2.settings', JSON.stringify({ clouds: false })),
  );
  await page.clock.install();
  await page.goto('/?debug=1&autostart=1&seed=42');
  await page.waitForFunction(() => window.__GAME__?.getState().ui.currentMenu === null);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60000));
  await page.evaluate(() => window.__GAME__!.setDaylightRatio(0.5));
  return errors;
}
test('seed 42 forest, chest opening, rewards and reload', async ({ page }, info) => {
  test.setTimeout(90000);
  const errors = await boot(page);
  const initial = await saved(page);
  const trees = (initial.world.props as WorldData['props']).filter((p) => p.kind === 'tree');
  const forest = trees.find((p) => p.tileX > 25 && p.tileY > 25)!;
  await move(page, forest.tileX + 2, forest.tileY + 1);
  await capture(page, info, 'forest');
  const chest = (initial.entities as Entity[]).find(
    (e): e is PickupEntity => e.kind === 'pickup' && e.pickupType === 'chest',
  )!;
  expect(chest).toBeTruthy();
  await move(page, chest.x, chest.y + 0.95);
  await capture(page, info, 'chest-closed');
  const before = (await saved(page)).entities.find((e: Entity) => e.kind === 'player').stats.coins;
  await page.keyboard.press('KeyG');
  await page.clock.runFor(200);
  await capture(page, info, 'chest-opening');
  await saved(page);
  expect(await page.evaluate(() => window.__GAME__!.loadGame('art-qa'))).toBe(true);
  await page.clock.runFor(450);
  await capture(page, info, 'chest-reward');
  const opened = await saved(page);
  expect(opened.entities.find((e: Entity) => e.id === chest.id).chest.state).toBe('opened');
  expect(opened.entities.find((e: Entity) => e.kind === 'player').stats.coins).toBe(before + 5);
  await page.keyboard.press('KeyG');
  await page.clock.runFor(800);
  expect((await saved(page)).entities.find((e: Entity) => e.kind === 'player').stats.coins).toBe(
    before + 5,
  );
  await page.reload();
  await page.waitForFunction(() => window.__GAME__?.getState().ui.currentMenu === null);
  expect(await page.evaluate(() => window.__GAME__!.loadGame('art-qa'))).toBe(true);
  await page.clock.runFor(200);
  expect((await saved(page)).entities.find((e: Entity) => e.id === chest.id).chest.state).toBe(
    'opened',
  );
  const coin = (initial.entities as Entity[]).find(
    (e): e is PickupEntity => e.kind === 'pickup' && e.pickupType === 'coin',
  )!;
  await move(page, coin.x + 1, coin.y);
  await capture(page, info, 'coin-world');
  const balance = (await saved(page)).entities.find((e: Entity) => e.kind === 'player').stats.coins;
  await move(page, coin.x, coin.y);
  await capture(page, info, 'coin-collected');
  expect((await saved(page)).entities.find((e: Entity) => e.kind === 'player').stats.coins).toBe(
    balance + 1,
  );
  const hillBoulder = (initial.world.props as WorldData['props']).find(
    (p) => p.kind === 'rock_boulder' && p.hilltop,
  )!;
  expect(hillBoulder).toBeTruthy();
  await move(page, hillBoulder.tileX + 1.5, hillBoulder.tileY + 1.5);
  await capture(page, info, 'hilltop-boulder-flowers');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await move(page, forest.tileX + 2, forest.tileY + 1);
  await capture(page, info, 'forest-desktop');
  expect(errors).toEqual([]);
});
test('bridge and boulder benchmark, tree occlusion and trunk clearance', async ({ page }, info) => {
  const errors = await boot(page);
  const { world } = bridgeFixture();
  const props: WorldData['props'] = [
    { id: 10, kind: 'tree', tileX: 16, tileY: 14, solid: true },
    { id: 11, kind: 'tree', tileX: 13, tileY: 19, solid: true },
    { id: 12, kind: 'tree', tileX: 17, tileY: 23, solid: true },
    { id: 13, kind: 'rock_boulder', tileX: 18, tileY: 16, solid: true },
    { id: 14, kind: 'flower_clump', tileX: 14, tileY: 18, solid: false },
    { id: 15, kind: 'flower_clump', tileX: 17, tileY: 18, solid: false },
    { id: 16, kind: 'log_horizontal', tileX: 15, tileY: 21, solid: true },
    { id: 17, kind: 'log_stump', tileX: 14, tileY: 22, solid: true },
    { id: 18, kind: 'bush_obstacle', tileX: 18, tileY: 22, solid: true },
    { id: 19, kind: 'flower_pink', tileX: 15, tileY: 18, solid: false },
    { id: 20, kind: 'flower_yellow', tileX: 16, tileY: 18, solid: false },
    { id: 21, kind: 'log_vertical', tileX: 13, tileY: 22, solid: true },
  ];
  await page.evaluate(
    (w) => {
      window.__GAME__!.saveGame('art-fixture');
      const p = JSON.parse(localStorage.getItem('forestrpg.v2.save.art-fixture')!);
      p.world = w;
      delete p.runtime.encounters;
      delete p.runtime.moisture;
      p.entities = p.entities.filter((e: Entity) => e.kind === 'player' || e.kind === 'portal');
      for (const e of p.entities) {
        e.x = e.prevX = e.kind === 'player' ? 16.5 : 35.5;
        e.y = e.prevY = e.kind === 'player' ? 14.3 : 35.5;
      }
      localStorage.setItem('forestrpg.v2.save.art-fixture', JSON.stringify(p));
      window.__GAME__!.loadGame('art-fixture');
    },
    { ...world, props, tiles: Array.from(world.tiles) },
  );
  await page.clock.runFor(300);
  await capture(page, info, 'tree-behind');
  await page.keyboard.down('KeyS');
  await page.clock.runFor(500);
  await page.keyboard.up('KeyS');
  const blocked = await page.evaluate(() => window.__GAME__!.getState().player);
  expect(blocked.y).toBeLessThan(14.4);
  await page.keyboard.down('KeyD');
  await page.clock.runFor(250);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyS');
  await page.clock.runFor(300);
  await page.keyboard.up('KeyS');
  expect((await page.evaluate(() => window.__GAME__!.getState().player)).y).toBeGreaterThan(15);
  await move(page, 16.5, 15.2);
  await capture(page, info, 'tree-front');
  await move(page, 15.5, 21.2);
  await page.keyboard.down('KeyS');
  await page.clock.runFor(400);
  await page.keyboard.up('KeyS');
  expect((await page.evaluate(() => window.__GAME__!.getState().player)).y).toBeLessThan(21.4);
  await capture(page, info, 'log-behind');
  await move(page, 15.5, 22.1);
  await capture(page, info, 'log-front');
  await move(page, 19.5, 18.7);
  await capture(page, info, 'bridge-boulder-vegetation');
  await page.keyboard.down('KeyD');
  await page.clock.runFor(1100);
  await page.keyboard.up('KeyD');
  expect((await page.evaluate(() => window.__GAME__!.getState().player)).x).toBeGreaterThan(25);
  const legacy = await saved(page);
  const propsBefore = legacy.world.props;
  legacy.world.meta.generatorVersion = 11;
  await page.evaluate((payload) => {
    localStorage.setItem('forestrpg.v2.save.art-qa', JSON.stringify(payload));
    window.__GAME__!.loadGame('art-qa');
  }, legacy);
  await move(page, 19.5, 18.7);
  expect((await saved(page)).world.props).toEqual(propsBefore);
  await capture(page, info, 'legacy-compact-trees');
  expect(errors).toEqual([]);
});
