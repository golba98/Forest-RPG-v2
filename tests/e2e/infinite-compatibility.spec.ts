import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('finite saves preserve their original terrain, landmarks and progress during expansion', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto('/?world=finite&debug=1&autostart=1&seed=42');
  await page.waitForFunction(() => !!window.__GAME__);
  const old = await page.evaluate(() => {
    window.__GAME__!.executeCommand('/give health 4');
    window.__GAME__!.saveGame('legacy-source');
    return JSON.parse(localStorage.getItem('forestrpg.v2.save.legacy-source')!);
  });
  await page.goto('/?debug=1&world=infinite');
  await page.waitForFunction(() => !!window.__GAME__);
  expect(await page.evaluate((data) => window.__GAME__!.loadLegacySave(data), old)).toBe(true);
  const pos = (await page.evaluate(() => window.__GAME__!.getStreamingDebug()))!.globalPosition;
  const player = old.entities.find((e: { kind: string }) => e.kind === 'player');
  expect(pos).toEqual({ x: player.x, y: player.y });
  await page.keyboard.press('Escape');
  const downloading = page.waitForEvent('download');
  await page.getByTestId('export-button').click();
  const download = await downloading,
    path = await download.path();
  expect(path).toBeTruthy();
  const first = JSON.parse((await readFile(path!, 'utf8')).split('\n')[0]!);
  expect(first.checkpoint.legacy.world.tiles).toEqual(old.world.tiles);
  expect(first.checkpoint.legacy.world.props).toEqual(old.world.props);
  expect(first.checkpoint.legacy.world.bridges).toEqual(old.world.bridges);
  expect(
    first.checkpoint.entities.find((e: { kind: string }) => e.kind === 'player').inventory,
  ).toEqual(player.inventory);
});

test('a protected old region with no artificial border receives a two-way travel action', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto('/?world=finite&debug=1&autostart=1&seed=123');
  await page.waitForFunction(() => !!window.__GAME__);
  const old = await page.evaluate(() => {
    window.__GAME__!.saveGame('link-source');
    const data = JSON.parse(localStorage.getItem('forestrpg.v2.save.link-source')!);
    const player = data.entities.find((e: { kind: string }) => e.kind === 'player'),
      portal = data.entities.find((e: { kind: string }) => e.kind === 'portal'),
      coin = data.entities.find((e: { kind: string }) => e.kind === 'pickup');
    data.world = {
      ...data.world,
      meta: {
        ...data.world.meta,
        width: 8,
        height: 8,
        generatorVersion: 0,
        hilltopObjectsVersion: 1,
      },
      tiles: Array(64).fill(1),
      props: [],
      bridges: [],
      encounterSites: [],
      spawn: { x: 2, y: 2 },
      portal: { x: 6, y: 6 },
      enemySpawns: [],
      pickupSpawns: [{ type: 'coin', x: 1, y: 1 }],
    };
    player.x = player.prevX = 2.5;
    player.y = player.prevY = 2.5;
    portal.x = portal.prevX = 6.5;
    portal.y = portal.prevY = 6.5;
    portal.active = false;
    portal.roundComplete = false;
    portal.portalState = 'locked';
    coin.x = coin.prevX = 1.5;
    coin.y = coin.prevY = 1.5;
    coin.id = 'legacy:coin';
    coin.alive = true;
    data.entities = [player, portal, coin];
    data.runtime = { rngState: 123 };
    data.elapsedMs = 0;
    data.time = 0.5;
    return data;
  });
  await page.goto('/?debug=1&world=infinite');
  await page.waitForFunction(() => !!window.__GAME__);
  expect(await page.evaluate((data) => window.__GAME__!.loadLegacySave(data), old)).toBe(true);
  await page.keyboard.press('KeyG');
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__GAME__!.getStreamingDebug()))?.globalPosition.x,
      { timeout: 10000 },
    )
    .toBeGreaterThan(8);
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyG');
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__GAME__!.getStreamingDebug()))?.globalPosition.x,
      { timeout: 10000 },
    )
    .toBeCloseTo(2.5);
});
