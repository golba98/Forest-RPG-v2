import { test, expect } from '@playwright/test';

test('ordinary production build ignores the profiling URL and preserves streamed saves', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?debug=1&profile=1&autostart=1&seed=42');
  await page.waitForFunction(() => !!window.__GAME__?.getStreamingDebug(), {}, { timeout: 60000 });
  expect(await page.evaluate(() => window.__PERF__)).toBeUndefined();
  await page.evaluate(() => window.__GAME__!.setGlobalPosition(-300.5, 200.5));
  const saved = await page.evaluate(async () => {
    window.__GAME__!.setTimeScale(0);
    const position = window.__GAME__!.getStreamingDebug()!.globalPosition;
    const ok = await window.__GAME__!.saveGame('profiledisabled');
    return { position, ok };
  });
  expect(saved.ok).toBe(true);
  await page.reload();
  await page.waitForFunction(() => !!window.__GAME__?.getStreamingDebug(), {}, { timeout: 60000 });
  expect(await page.evaluate(() => window.__GAME__!.loadGame('profiledisabled'))).toBe(true);
  expect(await page.evaluate(() => window.__GAME__!.getStreamingDebug()!.globalPosition)).toEqual(
    saved.position,
  );
  expect(await page.evaluate(() => window.__PERF__)).toBeUndefined();
  expect(errors).toEqual([]);
});
