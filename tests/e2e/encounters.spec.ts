import { test, expect } from '@playwright/test';
test('real attack input damages the tutorial dummy', async ({ page }) => {
  await page.goto('/?debug=1&autostart=1&tutorial=1');
  await page.waitForFunction(() => !!window.__GAME__);
  await page.evaluate(() => window.__GAME__!.setPlayerPosition(5.5, 6.6));
  await page.keyboard.down('KeyW'); await page.waitForTimeout(20); await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyE');
  await expect.poll(() => page.evaluate(() => window.__GAME__!.getState().enemies[0]?.health)).toBeLessThan(5);
});
test('main menu presents the original art at desktop resolution', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?debug=1');
  await page.getByTestId('new-game-button').waitFor();
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'test-results/main-menu.png' });
});
