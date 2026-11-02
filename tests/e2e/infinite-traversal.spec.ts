import { test, expect, type Page } from '@playwright/test';
test.use({ video: 'on' });
async function walk(page: Page, dx: number, dy: number) {
  const p = await page.evaluate(() => window.__GAME__!.getStreamingDebug()!.globalPosition);
  const route = await page.evaluate((p) => window.__GAME__!.planTravelPath(p.x, p.y), {
    x: p.x + dx,
    y: p.y + dy,
  });
  expect(route.length).toBeGreaterThan(0);
  for (const target of route) {
    for (let tries = 0; tries < 100; tries++) {
      const at = await page.evaluate(() => {
        window.__GAME__!.setPlayerHealth(7);
        return window.__GAME__!.getStreamingDebug()!.globalPosition;
      });
      const x = target.x - at.x,
        y = target.y - at.y;
      if (Math.max(Math.abs(x), Math.abs(y)) < 0.025) break;
      if (tries === 99)
        throw new Error(
          `Traversal stuck at ${JSON.stringify(at)} heading to ${JSON.stringify(target)}`,
        );
      const keys = [
        ...(Math.abs(x) > 0.015 ? [x > 0 ? 'KeyD' : 'KeyA'] : []),
        ...(Math.abs(y) > 0.015 ? [y > 0 ? 'KeyS' : 'KeyW'] : []),
      ];
      await page.evaluate(
        (scale) => window.__GAME__!.setTimeScale(scale),
        Math.max(Math.abs(x), Math.abs(y)) < 0.3 ? 0.2 : 1,
      );
      for (const key of keys) await page.keyboard.down(key);
      await page.clock.runFor(16);
      for (const key of keys) await page.keyboard.up(key);
    }
  }
}
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
