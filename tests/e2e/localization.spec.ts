import { test, expect } from '@playwright/test';

test('language and color mode settings persist and affect the interface', async ({ page }) => {
  await page.goto('/?debug=1'); await page.getByTestId('settings-button').click();
  await page.getByRole('button', { name: 'Accessibility', exact: true }).click();
  await page.getByLabel('Color mode').selectOption('Grayscale');
  await expect(page.locator('canvas')).toHaveCSS('filter', 'grayscale(1)');
  await page.getByLabel('Language').selectOption('Spanish');
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Jugar', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Jugar', exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCSS('filter', 'grayscale(1)');
});
