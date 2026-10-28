import { test, expect } from '@playwright/test';
test('menu starts tutorial and pause settings persist', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.getByTestId('tutorial-button').click();
  await expect(page.locator('#game-overlay')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-button').click();
  await page.getByLabel('Frame limit').selectOption('120');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByTestId('resume-button').click();
  await page.reload();
  await page.getByTestId('settings-button').click();
  await expect(page.getByLabel('Frame limit')).toHaveValue('120');
});
