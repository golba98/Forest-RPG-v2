import { test, expect } from '@playwright/test';

test('starting objectives survive exploration and the streamed portal carries progression', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug=1&autostart=1&seed=123');
  await page.waitForFunction(() => !!window.__GAME__?.getStreamingDebug(), {}, { timeout: 60000 });
  await page.evaluate(() => window.__GAME__!.setGlobalPosition(-400.5, 300.5));
  expect((await page.evaluate(() => window.__GAME__!.getState())).world.isPortalActive).toBe(false);
  await page.evaluate(() => window.__GAME__!.setGlobalPosition(0.5, 0.5));
  const portal = await page.evaluate(() => {
    const game = window.__GAME__!,
      p = game.getState().world.portalPos,
      origin = game.getStreamingDebug()!.origin;
    game.executeCommand('/kill all');
    game.executeCommand('/collect all');
    game.executeCommand('/give xp 100');
    game.executeCommand('/give health 2');
    return { x: p.x + origin.x + 0.5, y: p.y + origin.y + 0.5 };
  });
  await expect
    .poll(() => page.evaluate(() => window.__GAME__!.getState().world.isPortalActive))
    .toBe(true);
  await page.evaluate(() => window.__GAME__!.setGlobalPosition(-400.5, 300.5));
  await expect
    .poll(() => page.evaluate(() => window.__GAME__!.getState().world.isPortalActive))
    .toBe(true);
  await page.evaluate((p) => window.__GAME__!.setGlobalPosition(p.x, p.y), portal);
  await expect
    .poll(() => page.evaluate(() => window.__GAME__!.getState().world.level), { timeout: 60000 })
    .toBe(2);
  const player = await page.evaluate(() => window.__GAME__!.getState().player);
  expect(player.level).toBe(2);
  expect(player.potions.health).toBe(2);
  expect(player.coins).toBe(0);
  expect(await page.evaluate(() => !!window.__GAME__!.getStreamingDebug())).toBe(true);
  expect(errors).toEqual([]);
});
