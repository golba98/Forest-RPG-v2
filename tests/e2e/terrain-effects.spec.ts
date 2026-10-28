import { test, expect } from '@playwright/test';

test('jump reaches hill top and water immersion displays without render errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?debug=1&autostart=1&tutorial=1'); await page.waitForFunction(() => !!window.__GAME__);
  const loaded = await page.evaluate(() => {
    const tiles = Array<number>(64).fill(1); tiles[4 * 8 + 5] = 19; tiles[4 * 8 + 6] = 21; tiles[5 * 8 + 4] = 11;
    return window.__GAME__!.loadLegacySave({ logicalW: 8, logicalH: 8, cellSize: 32, mapStates: tiles, terrainLayer: [...tiles], treeObjects: [], playerPosition: { x: 4, y: 4 }, portalPos: { x: 6, y: 6 }, enemies: [] });
  });
  expect(loaded).toBe(true);
  await page.keyboard.down('KeyD'); await page.keyboard.down('Space'); await page.waitForTimeout(180); await page.keyboard.up('Space'); await page.keyboard.up('KeyD');
  expect(await page.evaluate(() => window.__GAME__!.getState().player.isJumping)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__GAME__!.getState().player.x)).toBeGreaterThan(5);
  await page.waitForTimeout(450); expect(await page.evaluate(() => window.__GAME__!.getState().player.isJumping)).toBe(false);
  await page.screenshot({ path: 'test-results/hill.png' });
  await page.evaluate(() => window.__GAME__!.setPlayerPosition(4.5, 5.5)); await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/water.png' });
  expect(errors).toEqual([]);
});
