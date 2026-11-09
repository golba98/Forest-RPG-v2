import { expect, test, type Page } from '@playwright/test';
async function library(page: Page) {
  await page.getByTestId('new-game-button').click();
  await expect(page.getByRole('heading', { name: 'Your Worlds' })).toBeVisible();
}
async function create(page: Page, name: string, seed: string) {
  await page.getByTestId('create-world-button').click();
  await page.getByLabel('World name', { exact: true }).fill(name);
  await page.getByLabel('Seed (optional)').fill(seed);
  await page.getByRole('button', { name: 'Create and Play', exact: true }).click();
  await page.waitForFunction(
    () =>
      window.__GAME__?.getState().ui.currentMenu === null && !!window.__GAME__?.getStreamingDebug(),
    {},
    { timeout: 60000 },
  );
}
async function leave(page: Page) {
  await page.keyboard.press('Escape');
  await page.getByTestId('main-menu-button').click();
  await expect(page.getByTestId('new-game-button')).toBeVisible();
}
test('worlds with the same seed retain independent progress after switching and reload', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/?debug=1');
  const worlds = [
    ['First seed 42', 3],
    ['Second seed 42', 6],
  ] as const;
  const identities: string[] = [];
  for (const [name, health] of worlds) {
    await library(page);
    await create(page, name, '42');
    await page.evaluate((health) => {
      window.__GAME__!.setTimeScale(0);
      window.__GAME__!.setPlayerHealth(health);
    }, health);
    expect(await page.evaluate(() => window.__GAME__!.saveGame('auto'))).toBe(true);
    await leave(page);
    await library(page);
    const entry = page
      .locator('.world-entry')
      .filter({ has: page.getByRole('heading', { name, exact: true }) });
    const id = await entry.getAttribute('data-world-id');
    if (!id) throw new Error('Named world has no persistent library identity');
    identities.push(id);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
  }
  expect(new Set(identities).size).toBe(2);
  await page.reload();
  for (const [index, [name, health]] of worlds.entries()) {
    await library(page);
    await expect(page.locator('.world-entry')).toHaveCount(2);
    const entry = page
      .locator('.world-entry')
      .filter({ has: page.getByRole('heading', { name, exact: true }) });
    await expect(entry).toHaveAttribute('data-world-id', identities[index]!);
    await expect(entry).toContainText('Seed 42');
    await entry.getByRole('button', { name: 'Play / Resume' }).click();
    await page.waitForFunction(() => window.__GAME__?.getState().ui.currentMenu === null);
    expect(await page.evaluate(() => window.__GAME__!.getState().player.health)).toBe(health);
    await leave(page);
  }
  expect(errors).toEqual([]);
});
test('independent worlds resume, rename, export, import and delete', async ({ page }, info) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug=1');
  await library(page);
  await create(page, 'Oak', '42');
  await page.evaluate(() => {
    window.__GAME__!.setTimeScale(0);
    window.__GAME__!.setPlayerHealth(4);
  });
  await leave(page);
  await library(page);
  await create(page, 'Birch', '123');
  await leave(page);
  await library(page);
  let oak = page
    .locator('.world-entry')
    .filter({ has: page.getByRole('heading', { name: 'Oak', exact: true }) });
  await oak.getByRole('button', { name: 'Play / Resume' }).click();
  await page.waitForFunction(
    () =>
      window.__GAME__?.getState().ui.currentMenu === null && !!window.__GAME__?.getStreamingDebug(),
    {},
    { timeout: 60000 },
  );
  expect(await page.evaluate(() => window.__GAME__!.getState().player.health)).toBe(4);
  await leave(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await library(page);
  oak = page
    .locator('.world-entry')
    .filter({ has: page.getByRole('heading', { name: 'Oak', exact: true }) });
  await oak.getByRole('button', { name: 'Rename', exact: true }).click();
  await oak.getByLabel('World name').fill('Oak Home');
  await oak.getByRole('button', { name: 'Save name' }).click();
  const renamed = page.locator('.world-entry').filter({ hasText: 'Oak Home' });
  const download = page.waitForEvent('download');
  await renamed.getByRole('button', { name: 'Export', exact: true }).click();
  const file = await download;
  const path = info.outputPath('export.jsonl');
  await file.saveAs(path);
  await page.locator('input[type=file]').setInputFiles(path);
  await expect(page.locator('.world-entry')).toHaveCount(3);
  await renamed.getByRole('button', { name: 'Delete', exact: true }).click();
  await renamed.getByRole('button', { name: 'Cancel' }).click();
  await renamed.getByRole('button', { name: 'Delete', exact: true }).click();
  await renamed.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.locator('.world-entry')).toHaveCount(2);
  // A late checkpoint from the previous live session cannot resurrect a deletion.
  expect(await page.evaluate(() => window.__GAME__!.saveGame('auto'))).toBe(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await library(page);
  await expect(page.locator('.world-entry')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('world-library.png') });
  expect(errors).toEqual([]);
});
test('temporary developer browser and mobile worlds menu', async ({ page }, info) => {
  await page.goto('/?debug=1');
  await page.getByTestId('developer-button').click();
  await expect(page.getByRole('heading', { name: 'Developer · Demo' })).toBeVisible();
  for (const tab of ['Characters', 'Environment', 'Loot & Portals']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await expect(page.locator('.content-preview')).toBeVisible();
    await expect(page.locator('.developer-panel [role=status]')).toHaveText(/\w+/);
    await expect(page.locator('.developer-panel [role=status]')).not.toHaveText(
      /Loading|unavailable|No preview/,
    );
  }
  await page.screenshot({ path: info.outputPath('developer.png') });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await library(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('mobile-worlds.png') });
});

test('invalid creation is recoverable and Developer does not alter the world list', async ({
  page,
}) => {
  await page.goto('/?debug=1');
  await library(page);
  await page.getByTestId('create-world-button').click();
  await page.getByLabel('Seed (optional)').fill('-1');
  await page.getByRole('button', { name: 'Create and Play', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Seed must');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your Worlds' })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByTestId('developer-button').click();
  const content = page.getByLabel('Content', { exact: true });
  for (const name of ['player', 'mantis', 'maggot', 'beetle', 'ghost']) {
    await content.selectOption(name);
    await page.getByLabel('Direction', { exact: true }).selectOption('N');
    await page.getByLabel('Animation', { exact: true }).selectOption('attack');
    await expect(page.locator('.developer-panel [role=status]')).toHaveText(name);
  }
  await page.keyboard.press('Escape');
  await library(page);
  await expect(page.locator('.world-entry')).toHaveCount(0);
});

test('legacy adventure migration runs once and deleted entries stay deleted', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/?debug=1&autostart=1&seed=42');
  await page.waitForFunction(() => window.__GAME__?.getState().ui.currentMenu === null);
  expect(await page.evaluate(() => window.__GAME__!.saveGame('auto'))).toBe(true);
  await page.goto('/?debug=1');
  await library(page);
  await expect(page.locator('.world-entry')).toHaveCount(1);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await library(page);
  await expect(page.locator('.world-entry')).toHaveCount(1);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.locator('.world-entry')).toHaveCount(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await library(page);
  await expect(page.locator('.world-entry')).toHaveCount(0);
});
test('checkpoint storage failure keeps existing worlds and shows a retryable error', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('/?debug=1');
  await library(page);
  await create(page, 'Safe world', '42');
  await leave(page);
  await library(page);
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (storeNames, mode, options) {
      if (
        mode === 'readwrite' &&
        Array.isArray(storeNames) &&
        storeNames.includes('library') &&
        storeNames.includes('chunks')
      )
        throw new DOMException('Test storage full', 'QuotaExceededError');
      return original.call(this, storeNames, mode, options);
    };
  });
  await page.getByTestId('create-world-button').click();
  await page.getByRole('button', { name: 'Create and Play', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Test storage full', { timeout: 60000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await library(page);
  await expect(page.locator('.world-entry')).toHaveCount(1);
});

test('named world retains its library identity and difficulty after a portal transition', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto('/?debug=1');
  await library(page);
  await page.getByTestId('create-world-button').click();
  await page.getByLabel('World name', { exact: true }).fill('Portal world');
  await page.getByLabel('Seed (optional)').fill('123');
  await page.getByLabel('Difficulty').selectOption('hard');
  await page.getByRole('button', { name: 'Create and Play', exact: true }).click();
  await page.waitForFunction(
    () =>
      window.__GAME__?.getState().ui.currentMenu === null && !!window.__GAME__?.getStreamingDebug(),
  );
  const portal = await page.evaluate(() => {
    const game = window.__GAME__!,
      p = game.getState().world.portalPos,
      origin = game.getStreamingDebug()!.origin;
    game.executeCommand('/kill all');
    game.executeCommand('/collect all');
    return { x: p.x + origin.x + 0.5, y: p.y + origin.y + 0.5 };
  });
  await expect
    .poll(() => page.evaluate(() => window.__GAME__!.getState().world.isPortalActive))
    .toBe(true);
  await page.evaluate((p) => window.__GAME__!.setGlobalPosition(p.x, p.y), portal);
  await expect
    .poll(() => page.evaluate(() => window.__GAME__!.getState().world.level), { timeout: 60000 })
    .toBe(2);
  await page.waitForFunction(() => window.__GAME__?.getState().ui.currentMenu === null);
  await leave(page);
  await library(page);
  await expect(page.locator('.world-entry')).toHaveCount(1);
  await expect(page.locator('.world-entry')).toContainText('hard · Level 2');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await library(page);
  await page.getByRole('button', { name: 'Play / Resume' }).click();
  await page.waitForFunction(() => window.__GAME__?.getState().ui.currentMenu === null);
  expect(await page.evaluate(() => window.__GAME__!.getState().world.level)).toBe(2);
});
