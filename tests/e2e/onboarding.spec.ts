import { test, expect } from '@playwright/test';
test('Play opens worlds without forcing the tutorial', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.getByTestId('new-game-button').click();
  await expect(page.getByRole('heading', { name: 'Your Worlds' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome to the forest' })).toHaveCount(0);
});
test('settings exposes tutorial preferences and controls', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.getByTestId('settings-button').click();
  await page.getByRole('button', { name: 'Gameplay', exact: true }).click();
  await expect(page.getByLabel('Show tutorials')).toBeChecked();
  await page.getByLabel('Show tutorials').uncheck();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/settings.png' });
  await page.reload();
  await page.getByTestId('new-game-button').click();
  await expect(page.getByRole('heading', { name: 'Your Worlds' })).toBeVisible();
});
