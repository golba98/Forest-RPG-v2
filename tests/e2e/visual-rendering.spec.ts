import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { generateWorld } from '../../src/world/WorldGenerator';
import { Tile, isHillTile, type TileId } from '../../src/types/tiles';

/**
 * Rendering regression checks backed by renderer counters
 * (window.__RENDER_DEBUG__) plus screenshots for human review in
 * docs/qa/screens/after/.
 */
const OUT = 'docs/qa/screens/after';
mkdirSync(OUT, { recursive: true });

async function boot(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`/?debug=1&autostart=1&${query}`);
  await page.waitForFunction(() => window.__RENDER_DEBUG__ !== undefined && window.__GAME__?.getState().ui.currentMenu === null);
  await page.evaluate(() => window.__GAME__!.setDaylightRatio(0.5));
  return errors;
}

const info = (page: Page) => page.evaluate(() => window.__RENDER_DEBUG__!.getInfo());
const teleport = (page: Page, x: number, y: number) => page.evaluate(([px, py]) => window.__GAME__!.setPlayerPosition(px!, py!), [x, y]);

test.use({ viewport: { width: 1280, height: 720 } });

test('no placeholder textures across scenes, projectiles and regeneration', async ({ page }) => {
  const errors = await boot(page, 'seed=42');
  expect((await info(page)).placeholderSprites).toBe(0);

  // Magic bolt and acid must use real art (they used Texture.WHITE before).
  await page.evaluate(() => { window.__GAME__!.setPlayerMana(100); window.__GAME__!.setTimeScale(0.15); });
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().projectiles)).toBeGreaterThan(0);
  expect((await info(page)).placeholderSprites).toBe(0);
  await page.screenshot({ path: `${OUT}/check-magic-bolt.png`, clip: { x: 560, y: 280, width: 160, height: 160 } });
  await page.evaluate(() => window.__GAME__!.setTimeScale(1));

  const baseline = await info(page);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(250);
    const now = await info(page);
    expect(now.placeholderSprites).toBe(0);
    expect(now.portalViews).toBe(1);
  }
  // Regeneration must not leak actors: count stays within the range of a fresh world.
  const after = await info(page);
  expect(after.actorChildren).toBeLessThan(baseline.actorChildren * 3);
  expect(errors).toEqual([]);
});

test('portal visual states follow the simulation and approach events', async ({ page }) => {
  await boot(page, 'seed=42');
  const portal = await page.evaluate(() => window.__GAME__!.getState().world.portalPos);
  const states = async () => (await info(page)).portalStates;

  await teleport(page, portal.x + 0.5, portal.y + 6.5);
  await page.waitForTimeout(200);
  expect(await states()).toEqual(['locked']);

  await teleport(page, portal.x + 0.5, portal.y + 2.5);
  await page.waitForTimeout(120);
  expect(await states()).toEqual(['reacting']);
  await page.screenshot({ path: `${OUT}/check-portal-reacting.png`, clip: { x: 480, y: 160, width: 320, height: 260 } });
  // One-shot: returns to locked while the player is still near, without restarting.
  await page.waitForTimeout(1100);
  expect(await states()).toEqual(['locked']);

  // Leaving and coming back re-arms the reaction.
  await teleport(page, portal.x + 0.5, portal.y + 7.5);
  await page.waitForTimeout(150);
  await teleport(page, portal.x + 0.5, portal.y + 2.5);
  await page.waitForTimeout(120);
  expect(await states()).toEqual(['reacting']);

  await page.evaluate(() => { window.__GAME__!.executeCommand('/kill all'); window.__GAME__!.executeCommand('/collect all'); });
  await expect.poll(states).toEqual(['open']);
  await page.waitForTimeout(1500);
  expect(await states()).toEqual(['open']);
  await page.screenshot({ path: `${OUT}/check-portal-open.png`, clip: { x: 480, y: 160, width: 320, height: 260 } });

  // Walk in from just south of the portal, as a player would.
  await teleport(page, portal.x + 0.5, portal.y + 1.9);
  await page.waitForTimeout(150);
  await page.keyboard.down('KeyW');
  await expect.poll(() => page.evaluate(() => window.__GAME__!.getState().world.level), { timeout: 4000 }).toBe(2);
  await page.keyboard.up('KeyW');
  expect((await info(page)).transitionActive).toBe(true);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/check-portal-transition.png` });
  await expect.poll(async () => (await info(page)).transitionActive, { timeout: 3000 }).toBe(false);
  expect(await states()).toEqual(['locked']);
});

test('debug overlay shows colliders over hills and survives resizes', async ({ page }) => {
  const world = generateWorld({ seed: 1337, level: 1, difficulty: 'normal' });
  const errors = await boot(page, 'seed=1337');
  // A walkable tile just below a south cliff face.
  let target = { x: world.spawn.x + 0.5, y: world.spawn.y + 0.5 };
  const w = world.meta.width;
  const elevated = (x: number, y: number) => { const t = world.tiles[y * w + x] as TileId; return isHillTile(t) || t === Tile.PLATEAU; };
  outer: for (let y = 10; y < world.meta.height - 10; y++) for (let x = 10; x < w - 10; x++) {
    if (elevated(x, y - 1) && elevated(x - 1, y - 1) && elevated(x + 1, y - 1) && world.tiles[y * w + x] === Tile.GRASS) { target = { x: x + 0.5, y: y + 1.5 }; break outer; }
  }
  await teleport(page, target.x, target.y);
  await page.evaluate(() => window.__RENDER_DEBUG__!.setFlags({ enabled: true, colliders: true, tileGrid: true, spriteBounds: true, labels: true }));
  await expect(page.locator('#visual-debug-panel')).toBeVisible();
  await page.mouse.move(640, 300);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/check-debug-overlay.png` });

  await page.keyboard.press('F3');
  expect((await page.evaluate(() => window.__RENDER_DEBUG__!.getFlags())).enabled).toBe(false);
  await expect(page.locator('#visual-debug-panel')).toBeHidden();

  for (const size of [{ width: 800, height: 600 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(400);
    expect((await info(page)).placeholderSprites).toBe(0);
    await page.screenshot({ path: `${OUT}/check-resize-${size.width}x${size.height}.png` });
  }
  expect(errors).toEqual([]);
});

test('enemy attack telegraph and death fade render without errors', async ({ page }) => {
  const errors = await boot(page, 'seed=42');
  const p = await page.evaluate(() => window.__GAME__!.getState().player);
  await page.evaluate(([x, y]) => { window.__GAME__!.setPlayerHealth(99); window.__GAME__!.spawnEnemy('mantis', x! + 0.7, y!); }, [p.x, p.y]);
  await page.waitForTimeout(90);
  await page.screenshot({ path: `${OUT}/check-enemy-telegraph.png`, clip: { x: 560, y: 280, width: 160, height: 160 } });
  await page.evaluate(() => window.__GAME__!.executeCommand('/kill all'));
  await page.waitForTimeout(60);
  expect((await info(page)).effects).toBeGreaterThan(0);
  await page.screenshot({ path: `${OUT}/check-enemy-death.png`, clip: { x: 560, y: 280, width: 160, height: 160 } });
  expect(errors).toEqual([]);
});
