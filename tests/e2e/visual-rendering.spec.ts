import { test, expect, type Page, type TestInfo } from '@playwright/test';
import sharp from 'sharp';
import { generateWorld } from '../../src/world/WorldGenerator';
import { Tile, isHillTile, type TileId } from '../../src/types/tiles';

/**
 * Rendering regression checks backed by renderer counters
 * (window.__RENDER_DEBUG__) plus screenshots for human review in
 * each test's directory under test-results/.
 */

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

test('no placeholder textures across scenes, projectiles and regeneration', async ({ page }, testInfo) => {
  const errors = await boot(page, 'seed=42');
  expect((await info(page)).placeholderSprites).toBe(0);

  // Magic bolt and acid must use real art (they used Texture.WHITE before).
  await page.evaluate(() => { window.__GAME__!.setPlayerMana(100); window.__GAME__!.setTimeScale(0.15); });
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().projectiles)).toBeGreaterThan(0);
  expect((await info(page)).placeholderSprites).toBe(0);
  await page.screenshot({ path: testInfo.outputPath(`check-magic-bolt.png`), clip: { x: 560, y: 280, width: 160, height: 160 } });
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

test('portal visual states follow the simulation and approach events', async ({ page }, testInfo) => {
  await boot(page, 'seed=42');
  const portal = await page.evaluate(() => window.__GAME__!.getState().world.portalPos);
  const states = async () => (await info(page)).portalStates;

  await teleport(page, portal.x + 0.5, portal.y + 6.5);
  await page.waitForTimeout(200);
  expect(await states()).toEqual(['locked']);

  await teleport(page, portal.x + 0.5, portal.y + 2.5);
  await page.waitForTimeout(120);
  expect(await states()).toEqual(['reacting']);
  await page.screenshot({ path: testInfo.outputPath(`check-portal-reacting.png`), clip: { x: 480, y: 160, width: 320, height: 260 } });
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
  await page.screenshot({ path: testInfo.outputPath(`check-portal-open.png`), clip: { x: 480, y: 160, width: 320, height: 260 } });

  // Walk in from just south of the portal, as a player would.
  await teleport(page, portal.x + 0.5, portal.y + 1.9);
  await page.waitForTimeout(150);
  await page.keyboard.down('KeyW');
  await expect.poll(() => page.evaluate(() => window.__GAME__!.getState().world.level), { timeout: 4000 }).toBe(2);
  await page.keyboard.up('KeyW');
  expect((await info(page)).transitionActive).toBe(true);
  await page.waitForTimeout(250);
  await page.screenshot({ path: testInfo.outputPath(`check-portal-transition.png`) });
  await expect.poll(async () => (await info(page)).transitionActive, { timeout: 3000 }).toBe(false);
  expect(await states()).toEqual(['locked']);
});

test('debug overlay shows colliders over hills and survives resizes', async ({ page }, testInfo) => {
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
  await page.screenshot({ path: testInfo.outputPath(`check-debug-overlay.png`) });

  await page.keyboard.press('F3');
  expect((await page.evaluate(() => window.__RENDER_DEBUG__!.getFlags())).enabled).toBe(false);
  await expect(page.locator('#visual-debug-panel')).toBeHidden();

  for (const size of [{ width: 800, height: 600 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(400);
    expect((await info(page)).placeholderSprites).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`check-resize-${size.width}x${size.height}.png`) });
  }
  expect(errors).toEqual([]);
});

test('enemy attack telegraph and death fade render without errors', async ({ page }, testInfo) => {
  const errors = await boot(page, 'seed=42');
  const p = await page.evaluate(() => window.__GAME__!.getState().player);
  await page.evaluate(([x, y]) => { window.__GAME__!.setPlayerHealth(99); window.__GAME__!.spawnEnemy('mantis', x! + 0.7, y!); }, [p.x, p.y]);
  await page.waitForTimeout(90);
  await page.screenshot({ path: testInfo.outputPath(`check-enemy-telegraph.png`), clip: { x: 560, y: 280, width: 160, height: 160 } });
  await page.evaluate(() => window.__GAME__!.executeCommand('/kill all'));
  await page.waitForTimeout(60);
  expect((await info(page)).effects).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath(`check-enemy-death.png`), clip: { x: 560, y: 280, width: 160, height: 160 } });
  expect(errors).toEqual([]);
});

/** Install before boot so GameLoop and its RAF callbacks share the fake clock. */
async function controlledBoot(page: Page, query = 'tutorial=1'): Promise<string[]> {
  await page.clock.install();
  const errors = await boot(page, query);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  return errors;
}

async function pressFrame(page: Page, key: string, ms = 80): Promise<void> {
  await page.keyboard.press(key);
  await page.clock.runFor(ms);
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<Buffer> {
  const body = await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  await testInfo.attach(name, { body, contentType: 'image/png' });
  return body;
}

type PixelPredicate = (r: number, g: number, b: number, x: number, y: number) => boolean;
async function countPixels(png: Buffer, matches: PixelPredicate): Promise<number> {
  const { data, info: image } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const i = (y * image.width + x) * image.channels;
    if (matches(data[i]!, data[i + 1]!, data[i + 2]!, x, y)) count++;
  }
  return count;
}

/** Cosmetic camera shake is at most a few pixels; pixel checks allow that margin. */
async function playerPoint(page: Page): Promise<{ x: number; y: number; zoom: number }> {
  return page.evaluate(() => {
    const { player, camera } = window.__GAME__!.getState();
    return {
      x: player.x * 32 * camera.zoom + Math.round(innerWidth / 2 - camera.x * camera.zoom),
      y: player.y * 32 * camera.zoom + Math.round(innerHeight / 2 - camera.y * camera.zoom),
      zoom: camera.zoom,
    };
  });
}

test('timed slash, gold finisher and spin are visibly drawn and expire', async ({ page }, testInfo) => {
  const errors = await controlledBoot(page);
  const p = await playerPoint(page);
  const arcPixel = (x: number, y: number) => {
    const dx = (x - p.x) / p.zoom, dy = (y - p.y) / p.zoom + 12;
    return dy > 18 && Math.hypot(dx, dy) > 28 && Math.hypot(dx, dy) < 60;
  };
  for (let swing = 1; swing <= 3; swing++) {
    await pressFrame(page, 'KeyE');
    expect((await info(page)).effects).toBe(1);
    const shot = await capture(page, testInfo, `slash-${swing}-80ms`);
    const pixels = await countPixels(shot, (r, g, b, x, y) => arcPixel(x, y) &&
      (swing === 3 ? r > 150 && g > 130 && b < 130 : r > 135 && g > 135 && b > 135));
    expect(pixels, `swing ${swing} must paint its arc into the canvas`).toBeGreaterThan(10);
    expect(await page.evaluate(() => window.__GAME__!.getState().player.comboCount)).toBe(swing % 3);
    await page.clock.runFor(320);
    expect((await info(page)).effects).toBe(0);
  }
  await pressFrame(page, 'KeyQ');
  expect((await info(page)).effects).toBe(1);
  expect(await page.evaluate(() => window.__GAME__!.getState().player.mana)).toBeLessThan(75);
  const spin = await capture(page, testInfo, 'spin-80ms');
  expect(await countPixels(spin, (r, g, b, x, y) => {
    const radius = Math.hypot((x - p.x) / p.zoom, (y - p.y) / p.zoom + 8);
    return radius > 30 && radius < 80 && r > 100 && g > 155 && b > 170;
  })).toBeGreaterThan(30);
  await page.clock.runFor(400);
  expect((await info(page)).effects).toBe(0);
  expect(errors).toEqual([]);
});

test('combat feedback freezes while paused and clears on world replacement', async ({ page }, testInfo) => {
  const errors = await controlledBoot(page);
  await pressFrame(page, 'KeyE');
  await pressFrame(page, 'Escape', 32);
  expect(await page.evaluate(() => window.__GAME__!.getState().engine.isPaused)).toBe(true);
  expect((await info(page)).effects).toBe(1);
  await page.clock.runFor(1000);
  expect((await info(page)).effects).toBe(1);
  await pressFrame(page, 'Escape', 250);
  expect((await info(page)).effects).toBe(0);
  await pressFrame(page, 'KeyQ');
  expect((await info(page)).effects).toBe(1);
  await pressFrame(page, 'KeyP', 48);
  expect((await info(page)).effects).toBe(0);
  expect((await info(page)).transitionActive).toBe(false);
  await capture(page, testInfo, 'regenerated-without-stale-feedback');
  expect(errors).toEqual([]);
});

test('melee impacts are visible during a scripted fight', async ({ page }, testInfo) => {
  const errors = await controlledBoot(page);
  const p = await page.evaluate(() => window.__GAME__!.getState().player);
  const enemy = await page.evaluate(({ x, y }) => window.__GAME__!.spawnEnemy('mantis', x + 0.8, y), p);
  await pressFrame(page, 'KeyE', 160);
  expect(await page.evaluate(id => window.__GAME__!.getState().enemies.find(e => e.id === id)!.health, enemy)).toBe(2);
  expect((await info(page)).effects).toBeGreaterThan(1);
  await capture(page, testInfo, 'melee-impact-160ms');
  expect(errors).toEqual([]);
});

test('post-hit white flash, red tint and invulnerability blinking are visible', async ({ page }, testInfo) => {
  const errors = await controlledBoot(page);
  const p = await page.evaluate(() => window.__GAME__!.getState().player);
  await page.evaluate(({ x, y }) => window.__GAME__!.spawnEnemy('mantis', x + 0.8, y), p);
  // Let the mantis finish its ordinary windup; stop on the first hurt frame.
  for (let i = 0; i < 30; i++) {
    if (await page.evaluate(() => window.__GAME__!.getState().player.isInvulnerable)) break;
    await page.clock.runFor(16);
  }
  expect(await page.evaluate(() => window.__GAME__!.getState().player.health)).toBeLessThan(p.health);
  await capture(page, testInfo, 'hurt-white-flash');
  await page.clock.runFor(100);
  await capture(page, testInfo, 'hurt-red-tint');
  await page.clock.runFor(144);
  const first = await capture(page, testInfo, 'hurt-blink-a');
  await page.clock.runFor(48);
  const second = await capture(page, testInfo, 'hurt-blink-b');
  const center = await playerPoint(page);
  const skin: PixelPredicate = (r, g, b, x, y) =>
    Math.abs(x - center.x) < 8 * center.zoom && y > center.y - 28 * center.zoom && y < center.y - 6 * center.zoom && r > 160 && g > 160 && b > 160;
  const counts = [await countPixels(first, skin), await countPixels(second, skin)];
  expect(Math.max(...counts) - Math.min(...counts), 'player opacity must visibly alternate').toBeGreaterThan(10);
  expect(errors).toEqual([]);
});

test('minimap cycles, centers the player, points to the portal and survives resizing and regeneration', async ({ page }, testInfo) => {
  const errors = await controlledBoot(page, 'seed=42');
  const generated = generateWorld({ seed: 42, level: 1, difficulty: 'normal' });
  const tile = generated.tiles.findIndex((t, i) => {
    const x = i % generated.meta.width, y = Math.floor(i / generated.meta.width);
    return t === Tile.GRASS && x > 30 && y > 30 && x < 120 && y < 120 &&
      Math.hypot(x - generated.portal.x, y - generated.portal.y) > 60 &&
      !generated.props.some(p => Math.abs(p.tileX - x) <= 1 && Math.abs(p.tileY - y) <= 1);
  });
  expect(tile).toBeGreaterThanOrEqual(0);
  await page.evaluate(() => window.__GAME__!.executeCommand('/kill all'));
  await teleport(page, tile % generated.meta.width + 0.5, Math.floor(tile / generated.meta.width) + 0.5);
  await page.clock.runFor(800);
  expect((await info(page)).minimapMode).toBe('radar');
  const { player, world } = await page.evaluate(() => window.__GAME__!.getState());
  const dx = world.portalPos.x + 0.5 - player.x, dy = world.portalPos.y + 0.5 - player.y;
  expect(Math.max(Math.abs(dx), Math.abs(dy))).toBeGreaterThan(25);
  const radar = await capture(page, testInfo, 'minimap-radar');
  expect(await countPixels(radar, (r, g, b, x, y) => Math.hypot(x - 1160, y - 120) < 4 && r > 220 && g > 220 && b > 220)).toBeGreaterThan(10);
  const arrowX = 1160 + dx / Math.max(Math.abs(dx), Math.abs(dy)) * 91;
  const arrowY = 120 + dy / Math.max(Math.abs(dx), Math.abs(dy)) * 91;
  expect(await countPixels(radar, (r, g, b, x, y) => Math.hypot(x - arrowX, y - arrowY) < 10 && r > 100 && b > r + 15 && g < r)).toBeGreaterThan(5);

  for (const size of [{ width: 800, height: 600 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await page.clock.runFor(80);
    expect((await info(page)).minimapMode).toBe('radar');
    await capture(page, testInfo, `minimap-radar-${size.width}`);
    await pressFrame(page, 'KeyM');
    expect((await info(page)).minimapMode).toBe('full');
    const full = await capture(page, testInfo, `minimap-full-${size.width}`);
    // The white camera frame must be present inside the centered world map.
    const state = await page.evaluate(() => window.__GAME__!.getState());
    const k = Math.max(1, Math.floor(Math.min(size.width, size.height) * 0.8 / state.world.width));
    const left = Math.round((size.width - state.world.width * k) / 2);
    const top = Math.round((size.height - state.world.height * k) / 2);
    const frameX = left + (state.camera.x - size.width / (2 * state.camera.zoom)) / 32 * k;
    const frameY = top + (state.camera.y - size.height / (2 * state.camera.zoom)) / 32 * k;
    expect(await countPixels(full, (r, g, b, x, y) => x > frameX + 8 && x < frameX + 40 && Math.abs(y - frameY) < 2 && r > 170 && g > 170 && b > 170)).toBeGreaterThan(10);
    await pressFrame(page, 'KeyM');
    expect((await info(page)).minimapMode).toBe('hidden');
    await capture(page, testInfo, `minimap-hidden-${size.width}`);
    await pressFrame(page, 'KeyM');
    expect((await info(page)).minimapMode).toBe('radar');
  }
  await pressFrame(page, 'KeyP');
  expect((await info(page)).minimapMode).toBe('radar');
  expect((await info(page)).placeholderSprites).toBe(0);
  await capture(page, testInfo, 'minimap-regenerated');
  expect(errors).toEqual([]);
});

test('tutorial full map keeps the camera frame inside the map panel', async ({ page }, testInfo) => {
  const errors = await controlledBoot(page);
  await pressFrame(page, 'KeyM');
  const full = await capture(page, testInfo, 'tutorial-full-map');
  // At 1280×720 the 20×20 map spans x=360..920, while the unclipped
  // camera frame would span x=80..1200 and draw through the rest of the HUD.
  expect(await countPixels(full, (r, g, b, x, y) => Math.abs(x - 80) < 2 && y > 200 && y < 500 && r > 150 && g > 150 && b > 150)).toBe(0);
  expect(await countPixels(full, (r, g, b, x, y) => Math.abs(x - 360) < 2 && y > 200 && y < 500 && r > 150 && g > 150 && b > 150)).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});
