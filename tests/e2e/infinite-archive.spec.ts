import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('streaming archives restore progress and reject truncated imports without replacing the game', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto('/?debug=1&autostart=1&seed=42');
  await page.waitForFunction(() => !!window.__GAME__?.getStreamingDebug(), {}, { timeout: 60000 });
  await page.evaluate(() => window.__GAME__!.executeCommand('/give health 9'));
  await page.keyboard.press('Escape');
  const downloading = page.waitForEvent('download');
  await page.getByTestId('export-button').click();
  const download = await downloading,
    raw = await readFile((await download.path())!, 'utf8');
  expect(download.suggestedFilename()).toMatch(/\.jsonl$/);
  expect(JSON.parse(raw.split('\n')[0]!).version).toBe(3);
  await page.getByTestId('main-menu-button').click();
  await page.getByTestId('new-game-button').click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'world.jsonl',
    mimeType: 'application/x-ndjson',
    buffer: Buffer.from(raw),
  });
  const imported = page.locator('.world-entry').filter({
    has: page.getByRole('heading', { name: 'world', exact: true }),
  });
  await imported.getByRole('button', { name: 'Play / Resume' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__GAME__!.getState().ui.currentMenu), { timeout: 60000 })
    .toBeNull();
  const good = await page.evaluate(() => window.__GAME__!.getStreamingDebug()!.globalPosition);
  expect((await page.evaluate(() => window.__GAME__!.getState().player)).potions.health).toBe(9);
  await page.keyboard.press('Escape');
  await page.getByTestId('main-menu-button').click();
  await page.getByTestId('new-game-button').click();
  await expect(page.getByRole('heading', { name: 'world', exact: true })).toBeVisible();
  const count = await page.locator('.world-entry').count();
  const corrupt = raw.slice(0, raw.lastIndexOf('{"end"'));
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.jsonl',
    mimeType: 'application/x-ndjson',
    buffer: Buffer.from(corrupt),
  });
  await expect(page.getByRole('alert')).toContainText('Incomplete world archive', {
    timeout: 30000,
  });
  expect((await page.evaluate(() => window.__GAME__!.getStreamingDebug()))?.globalPosition).toEqual(
    good,
  );
  await expect(page.locator('.world-entry')).toHaveCount(count);
});
