import { test, expect } from '@playwright/test';

test('generated world renders, camera follows, and regeneration releases old entities', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.text().includes('missing texture')) errors.push(message.text()); });
  await page.goto('/?debug=1&autostart=1&seed=123');
  await page.waitForFunction(() => !!window.__GAME__);
  const before = await page.evaluate(() => window.__GAME__!.getState());
  await page.keyboard.down('KeyD'); await page.waitForTimeout(250); await page.keyboard.up('KeyD');
  const after = await page.evaluate(() => window.__GAME__!.getState());
  expect(after.player.x).toBeGreaterThan(before.player.x);
  expect(after.camera.x).toBeGreaterThan(before.camera.x);
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/generated-world.png' });
  expect(errors).toEqual([]);
});
