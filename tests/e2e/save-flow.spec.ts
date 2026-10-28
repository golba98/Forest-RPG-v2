import { test, expect } from '@playwright/test';
test('pause save survives reload and Continue restores the player', async ({ page }) => {
  await page.goto('/?debug=1&autostart=1&tutorial=1');
  await page.waitForFunction(() => !!window.__GAME__);
  await page.evaluate(() => { window.__GAME__!.setPlayerPosition(4.5, 15.5); window.__GAME__!.setPlayerHealth(4); });
  await page.keyboard.press('Escape'); await page.getByTestId('save-button').click();
  await page.goto('/?debug=1'); await page.getByTestId('continue-button').click();
  await expect.poll(() => page.evaluate(() => window.__GAME__!.getState().player.health)).toBe(4);
  expect(await page.evaluate(() => window.__GAME__!.getState().player.x)).toBeCloseTo(4.5);
});
