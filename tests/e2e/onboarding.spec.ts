import { test, expect } from '@playwright/test';
test('first-time welcome is remembered after skipping', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.getByTestId('new-game-button').click();
  await expect(page.getByRole('heading', { name: 'Welcome to the forest' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.reload(); await page.getByTestId('new-game-button').click();
  await expect(page.locator('#game-overlay')).toBeHidden();
});
test('settings exposes tutorial preferences and controls', async ({ page }) => {
  await page.goto('/?debug=1'); await page.getByTestId('settings-button').click();
  await expect(page.getByLabel('Show tutorials')).toBeChecked();
  await page.getByLabel('Show tutorials').uncheck();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/settings.png' });
  await page.reload(); await page.getByTestId('new-game-button').click();
  await expect(page.locator('#game-overlay')).toBeHidden();
});
