import { test, expect } from '@playwright/test';

test('walking stops at a cliff edge, a jump climbs it, and water immersion displays without render errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/?debug=1&autostart=1&tutorial=1');
  await page.waitForFunction(() => !!window.__GAME__);
  const loaded = await page.evaluate(() => {
    const tiles = Array<number>(64).fill(1);
    for (let y = 3; y <= 5; y++) {
      tiles[y * 8 + 5] = 19;
      tiles[y * 8 + 6] = 21;
    }
    tiles[5 * 8 + 4] = 11;
    return window.__GAME__!.loadLegacySave({
      logicalW: 8,
      logicalH: 8,
      cellSize: 32,
      mapStates: tiles,
      terrainLayer: [...tiles],
      treeObjects: [],
      playerPosition: { x: 4, y: 4 },
      portalPos: { x: 6, y: 6 },
      enemies: [],
    });
  });
  expect(loaded).toBe(true);
  // Walking into the cliff edge (HILL_W at x=5) stops at its face.
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyD');
  expect(await page.evaluate(() => window.__GAME__!.getState().player.x)).toBeLessThanOrEqual(
    4.781,
  );
  // Jumping carries the player over the edge onto the hill top (PLATEAU at x=6).
  await page.keyboard.down('KeyD');
  await page.keyboard.down('Space');
  await page.waitForTimeout(100);
  await page.keyboard.up('Space');
  expect(await page.evaluate(() => window.__GAME__!.getState().player.isJumping)).toBe(true);
  await page.waitForTimeout(550);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__GAME__!.getState().player.isJumping)).toBe(false);
  expect(await page.evaluate(() => window.__GAME__!.getState().player.x)).toBeGreaterThan(6);
  await page.screenshot({ path: 'test-results/hill.png' });
  await page.evaluate(() => window.__GAME__!.setPlayerPosition(4.5, 5.5));
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/water.png' });
  expect(errors).toEqual([]);
});
