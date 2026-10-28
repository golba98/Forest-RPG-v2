import { test, expect, type Page } from '@playwright/test';

test.use({ video: 'on' });

async function boot(page: Page): Promise<void> {
  await page.goto('/?debug=1&autostart=1&tutorial=0&seed=123');
  await page.waitForFunction(() => !!window.__GAME__ && !!window.__RENDER_DEBUG__);
}
async function ledgeFixture(page: Page): Promise<void> {
  await boot(page);
  await page.evaluate(() => {
    const g = window.__GAME__!;
    g.pauseSimulation();
    g.saveGame('ledge');
    const d = JSON.parse(localStorage.getItem('forestrpg.v2.save.ledge')!);
    const tiles = new Array<number>(24 * 24).fill(1);
    for (let y = 5; y <= 17; y++) for (let x = 5; x <= 17; x++) tiles[y * 24 + x] = 21;
    tiles[10 * 24 + 5] = 23;
    d.world = {
      ...d.world,
      meta: { ...d.world.meta, width: 24, height: 24 },
      tiles,
      bridges: [],
      props: [],
      spawn: { x: 12, y: 12 },
      portal: { x: 21, y: 21 },
      enemySpawns: [],
      pickupSpawns: [],
    };
    const player = d.entities.find((e: { kind: string }) => e.kind === 'player');
    const portal = d.entities.find((e: { kind: string }) => e.kind === 'portal');
    const coin = d.entities.find(
      (e: { kind: string; pickupType?: string }) => e.kind === 'pickup' && e.pickupType === 'coin',
    );
    Object.assign(player, { x: 12.5, y: 16.6, prevX: 12.5, prevY: 16.6 });
    Object.assign(player.stats, { maxHealth: 20, health: 17, coins: 1234 });
    Object.assign(player.inventory, { healthPotions: 3, speedPotions: 8 });
    Object.assign(portal, {
      x: 21.5,
      y: 21.5,
      prevX: 21.5,
      prevY: 21.5,
      portalState: 'locked',
      roundComplete: false,
      active: false,
    });
    Object.assign(coin, { x: 20.5, y: 21.5 });
    d.entities = [player, portal, coin];
    d.time = 0.3;
    localStorage.setItem('forestrpg.v2.save.ledge', JSON.stringify(d));
    if (!g.loadGame('ledge')) throw new Error('Ledge fixture save failed to load');
    g.resumeSimulation();
  });
  // A fading pause-menu button may otherwise lose focus after the first keydown
  // and correctly clear held input. Settle focus on the actual game surface.
  await page.locator('canvas').evaluate((canvas) => {
    canvas.tabIndex = 0;
    canvas.focus();
  });
}
async function hold(page: Page, keys: string[], ms: number): Promise<void> {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
}

test('feet reach the visible lip, stay there, slide and reload without pushback', async ({
  page,
}, info) => {
  await ledgeFixture(page);
  await page.keyboard.down('KeyS');
  await expect
    .poll(() => page.evaluate(() => window.__GAME__!.getState().player.y))
    .toBeCloseTo(17.0625);
  await page.keyboard.up('KeyS');
  let state = await page.evaluate(() => window.__GAME__!.getState());
  expect(state.player.y).toBeCloseTo(17.0625);
  let foot = await page.evaluate(() => window.__GAME__!.getGameplayDebug()!.playerFootprint);
  expect(foot.maxY).toBeCloseTo(17.375);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__GAME__!.getState().player.y)).toBeCloseTo(
    state.player.y,
  );
  await hold(page, ['ShiftLeft', 'KeyS', 'KeyD'], 200);
  state = await page.evaluate(() => window.__GAME__!.getState());
  expect(state.player.x).toBeGreaterThan(12.5);
  expect(state.player.y).toBeCloseTo(17.0625);
  await page.evaluate(() => {
    window.__GAME__!.saveGame('rim');
    window.__GAME__!.loadGame('rim');
  });
  foot = await page.evaluate(() => window.__GAME__!.getGameplayDebug()!.playerFootprint);
  expect(foot.maxY).toBeCloseTo(17.375);
  await page.screenshot({ path: info.outputPath('standing-at-lip.png') });
});

test('corner HUD stays in the viewport with twenty hearts at every screen size and scale', async ({
  page,
}, info) => {
  for (const [width, height] of [
    [320, 568],
    [1280, 720],
    [1920, 1080],
    [3440, 1440],
  ] as const)
    for (const scale of [0.8, 1, 1.2]) {
      await page.setViewportSize({ width, height });
      await page.addInitScript(
        ({ scale }) => {
          localStorage.setItem(
            'forestrpg.v2.settings',
            JSON.stringify({ version: 2, uiScale: scale }),
          );
        },
        { scale },
      );
      await ledgeFixture(page);
      await page.waitForTimeout(80);
      const hud = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().hud!);
      expect(hud.heartCount).toBe(20);
      expect(hud.slotCount).toBe(5);
      // Level/XP/coins top-left; hearts + hotbar bottom-right; both fully on screen.
      expect(hud.level.x).toBeGreaterThanOrEqual(10);
      expect(hud.level.y).toBeGreaterThanOrEqual(10);
      expect(hud.level.x + hud.level.width).toBeLessThan(width / 2 + 100);
      expect(hud.cluster.x + hud.cluster.width).toBeLessThanOrEqual(width - 10);
      expect(hud.cluster.y + hud.cluster.height).toBeLessThanOrEqual(height - 10);
      expect(hud.cluster.x + hud.cluster.width).toBeGreaterThan(width - 40);
      expect(hud.cluster.y).toBeGreaterThan(height * 0.5);
      expect(hud.level.y + hud.level.height).toBeLessThan(hud.cluster.y);
      if (scale === 1)
        await page.screenshot({ path: info.outputPath(`hud-${width}x${height}.png`) });
    }
});
