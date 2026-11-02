import { expect, test } from '@playwright/test';

test('starts the world with the common performance metrics privacy filter enabled', async ({
  page,
}) => {
  let blocked = 0;
  // EasyPrivacy's /performance/metrics filter is case insensitive and matches Vite module URLs.
  await page.route(/\/performance\/metrics/i, (route) => {
    blocked++;
    return route.abort('blockedbyclient');
  });
  await page.goto('/?debug=1&autostart=1&seed=123');
  await page.waitForFunction(() => !!window.__GAME__?.getStreamingDebug());
  await expect(page.locator('#loading-screen')).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => window.__RENDER_DEBUG__?.getInfo().residency?.visibleChunks ?? 0),
    )
    .toBeGreaterThan(0);
  expect(blocked).toBe(0);
});

test('shows a startup error when the game module cannot be downloaded', async ({ page }) => {
  await page.route(/\/(?:src\/main\.ts|assets\/main-[^/]+\.js)(?:\?|$)/, (route) =>
    route.abort('blockedbyclient'),
  );
  await page.goto('/');
  await expect(page.locator('#loading-screen')).toContainText('Unable to start:');
  await expect(page.locator('#loading-screen')).toContainText('Reload the page');
});

test('shows storage startup failures instead of leaving the initialization spinner', async ({
  page,
}) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException('Saved game storage is blocked', 'SecurityError');
    };
  });
  await page.goto('/');
  await expect(page.locator('#loading-screen')).toHaveText(
    'Unable to start: Saved game storage is blocked',
  );
  await expect(page.locator('#game-overlay')).toBeHidden();
});
