import { test, expect } from '@playwright/test';
test('distant checkpoints and immutable manual slots restore progress', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug=1&autostart=1&seed=123&world=infinite');
  await page.waitForFunction(() => !!window.__GAME__?.getStreamingDebug(), {}, { timeout: 60000 });
  expect(await page.evaluate(() => window.__GAME__!.saveGame('home'))).toBe(true);
  await page.evaluate(() => window.__GAME__!.setGlobalPosition(-1000.5, 700.5));
  await page.evaluate(() => window.__GAME__!.executeCommand('/give health 7'));
  const distant = await page.evaluate(() => window.__GAME__!.getStreamingDebug()!.globalPosition);
  expect(await page.evaluate(() => window.__GAME__!.saveGame('far'))).toBe(true);
  await page.reload();
  await page.waitForFunction(() => !!window.__GAME__, {}, { timeout: 60000 });
  expect(await page.evaluate(() => window.__GAME__!.loadGame('far'))).toBe(true);
  expect((await page.evaluate(() => window.__GAME__!.getStreamingDebug()))?.globalPosition).toEqual(
    distant,
  );
  expect(await page.evaluate(() => window.__GAME__!.loadGame('home'))).toBe(true);
  const home = await page.evaluate(() => window.__GAME__!.getStreamingDebug());
  expect(home?.globalPosition.x).toBeCloseTo(0.5);
  expect(home?.globalPosition.y).toBeCloseTo(0.5);
  expect(await page.evaluate(() => window.__GAME__!.loadGame('far'))).toBe(true);
  expect((await page.evaluate(() => window.__GAME__!.getStreamingDebug()))?.globalPosition).toEqual(
    distant,
  );
  expect(errors).toEqual([]);
});
