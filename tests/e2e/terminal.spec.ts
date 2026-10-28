import { test, expect } from '@playwright/test';
test('debug commands open the portal and grant spendable character points', async ({ page }) => {
  await page.goto('/?debug=1&autostart=1&tutorial=1');
  await page.waitForFunction(() => !!window.__GAME__);
  await page.keyboard.press('Backquote'); const input = page.getByLabel('Terminal command');
  await input.fill('/kill all'); await input.press('Enter');
  await input.fill('/collect all'); await input.press('Enter');
  await input.fill('/give xp 100'); await input.press('Enter');
  await input.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__GAME__!.getState().world.isPortalActive)).toBe(true);
  await page.keyboard.press('KeyC');
  await expect(page.getByText('Available stat points: 1')).toBeVisible();
  await page.getByRole('button', { name: 'Damage 1 +' }).click();
  await expect(page.getByText('Available stat points: 0')).toBeVisible();
});
