import { test, expect } from '@playwright/test';
test('streamed forest crosses negative coordinates and restores its origin', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug=1&autostart=1&seed=42&world=infinite');
  await page.waitForFunction(
    () => window.__GAME__?.getStreamingDebug() !== null && !!window.__GAME__?.getStreamingDebug(),
    {},
    { timeout: 60000 },
  );
  await page.waitForTimeout(500);
  const initial = await page.evaluate(() => window.__GAME__!.getStreamingDebug());
  expect(initial?.globalPosition.x).toBeCloseTo(0.5);
  await page.evaluate(() => window.__GAME__!.setGlobalPosition(-300.5, -200.5));
  await page.waitForTimeout(300);
  const distant = await page.evaluate(() => window.__GAME__!.getStreamingDebug());
  expect(distant?.globalPosition.x).toBeLessThan(-290);
  expect(distant?.globalPosition.y).toBeLessThan(-190);
  expect(distant?.residentChunks).toBeLessThanOrEqual(128);
  await page.screenshot({ path: info.outputPath('negative-forest.png') });
  await page.evaluate(() => window.__GAME__!.setGlobalPosition(0.5, 0.5));
  expect(
    (await page.evaluate(() => window.__GAME__!.getStreamingDebug()))?.globalPosition.x,
  ).toBeCloseTo(0.5);
  expect(errors).toEqual([]);
});
