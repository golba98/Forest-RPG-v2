import { test, expect } from '@playwright/test';
test.use({ video: 'on' });
import { walk } from './helpers/walk';
test('real keyboard routes cross chunks in all directions and preserve visible scenery', async ({
  page,
}, info) => {
  test.setTimeout(360000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install();
  await page.goto('/?debug=1&autostart=1&seed=42&world=infinite');
  await page.waitForFunction(() => !!window.__GAME__?.getStreamingDebug(), {}, { timeout: 60000 });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  for (const [dx, dy] of [
    [24, 0],
    [24, 0],
    [0, -24],
    [0, -24],
    [-24, 0],
    [-24, 0],
    [-24, 0],
    [-24, 0],
    [0, 24],
    [0, 24],
    [0, 24],
    [0, 24],
    [24, -24],
    [-24, -24],
    [24, 24],
    [-24, 24],
  ])
    await walk(page, dx!, dy!);
  const state = await page.evaluate(() => window.__GAME__!.getStreamingDebug());
  expect(state?.error).toBeNull();
  expect(state?.transitions).toBeGreaterThan(4);
  expect(state?.residentChunks).toBeLessThanOrEqual(144);
  await page.screenshot({ path: info.outputPath('keyboard-exploration.png') });
  expect(errors).toEqual([]);
});
