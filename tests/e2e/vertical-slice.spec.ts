import { test, expect } from '@playwright/test';

test('boots, moves, pauses and resizes without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error' || msg.text().includes('missing texture')) errors.push(msg.text()); });
  await page.goto('/?debug=1&autostart=1&tutorial=1&seed=123');
  await page.waitForFunction(() => !!window.__GAME__);
  const before = await page.evaluate(() => window.__GAME__!.getState().player.y);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(200); await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => window.__GAME__!.getState().player.y)).toBeLessThan(before);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__GAME__!.getState().engine.isPaused)).toBe(true);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: 'test-results/vertical-slice.png' });
  expect(errors).toEqual([]);
});
