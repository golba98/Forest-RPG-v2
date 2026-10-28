import { test, expect } from '@playwright/test';

test.describe('Forest RPG V2 Smoke E2E', () => {
  test('initializes page shell and mounts canvas element', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Forest RPG V2');
    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeVisible();
  });
});
