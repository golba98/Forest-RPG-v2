import { test, expect } from '@playwright/test';

test('completing the tutorial opens its portal and starts the first world', async ({ page }) => {
  await page.goto('/?debug=1&autostart=1&tutorial=1');
  await page.waitForFunction(() => !!window.__GAME__);
  await page.evaluate(() => window.__GAME__!.setPlayerPosition(5.5, 6.6));
  await page.keyboard.down('KeyW'); await page.waitForTimeout(40); await page.keyboard.up('KeyW');
  for (let i = 0; i < 5; i++) { await page.keyboard.press('KeyE'); await page.waitForTimeout(900); }
  await expect.poll(() => page.evaluate(() => window.__GAME__!.getState().world.activeEnemiesCount)).toBe(0);
  for (const [x,y] of [[15.5,5.5],[16.5,4.5],[14.5,6.5]]) {
    await page.evaluate(([x,y]) => window.__GAME__!.setPlayerPosition(x!,y!), [x,y]);
    await page.waitForTimeout(100);
  }
  await expect.poll(() => page.evaluate(() => window.__GAME__!.getState().world.isPortalActive)).toBe(true);
  await page.evaluate(() => window.__GAME__!.setPlayerPosition(17.5,3.5));
  await expect.poll(() => page.evaluate(() => window.__GAME__!.getState().world.isTutorial)).toBe(false);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('forestrpg.v2.onboarding'))).toContain('"complete":true');
});

test('entering a normal portal advances without resetting progression', async ({ page }) => {
  await page.goto('/?debug=1&autostart=1&seed=123');
  await page.waitForFunction(() => !!window.__GAME__);
  await page.evaluate(() => {
    window.__GAME__!.executeCommand('/kill all');
    window.__GAME__!.executeCommand('/collect all');
    window.__GAME__!.executeCommand('/give xp 100');
    window.__GAME__!.executeCommand('/give health 2');
  });
  await expect.poll(() => page.evaluate(() => window.__GAME__!.getState().world.isPortalActive)).toBe(true);
  await page.evaluate(() => { const portal = window.__GAME__!.getState().world.portalPos; window.__GAME__!.setPlayerPosition(portal.x + 0.5, portal.y + 0.5); });
  await expect.poll(() => page.evaluate(() => window.__GAME__!.getState().world.level)).toBe(2);
  const player = await page.evaluate(() => window.__GAME__!.getState().player);
  expect(player.level).toBe(2); expect(player.potions.health).toBe(2); expect(player.coins).toBe(0);
});
