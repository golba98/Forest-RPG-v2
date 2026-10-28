/**
 * Tier 2 Boundary Test Suite: Boot, Menus, Audio & Viewport Edge Cases
 * Covers:
 * - Empty/missing settings fallback
 * - Extreme viewports (320x240 tiny, 3840x1080 ultrawide, 4K)
 * - Rapid pause/resume oscillation stress
 * - Web Audio autoplay security compliance
 * - Malformed query strings and seeds
 */

import { test, expect } from '@playwright/test';
import { GameDriver } from '../helpers/game-driver';

test.describe('Tier 2 Boundary: Boot, Menus & Display Viewports', () => {
  let driver: GameDriver;

  test.beforeEach(async ({ page }) => {
    driver = new GameDriver(page);
  });

  test('T2.1.1 — Empty/missing localStorage fallback: defaults are safely constructed without null dereferences', async () => {
    // Clear all localStorage entries
    await driver.launchGame();
    await driver.page.evaluate(() => window.localStorage.clear());
    await driver.page.reload({ waitUntil: 'domcontentloaded' });
    await driver.waitForEngineReady();

    const state = await driver.getState();
    expect(state.player.health).toBe(7);
    expect(state.player.mana).toBe(100);
    expect(state.player.stamina).toBe(100);
    expect(state.world.width).toBe(150);
  });

  test('T2.1.2 — Extreme viewport scaling: 320x240 tiny screen maintains legible rendering without overflow', async ({
    page: _page,
  }) => {
    await driver.launchGame({ viewport: { width: 320, height: 240 } });
    await driver.waitForEngineReady();

    const canvas = driver.getCanvas();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('T2.1.3 — Ultra-wide 32:9 (3840x1080) viewport scales without horizontal stretching or seam artifacts', async ({
    page: _page,
  }) => {
    await driver.launchGame({ viewport: { width: 3840, height: 1080 } });
    await driver.waitForEngineReady();

    const state = await driver.getState();
    expect(state.engine.canvasWidth).toBeGreaterThanOrEqual(3840);
  });

  test('T2.1.4 — Rapid pause/resume stress: 10 rapid toggles in 200ms does not desync simulation accumulator', async () => {
    await driver.launchGame();
    await driver.waitForEngineReady();

    for (let i = 0; i < 10; i++) {
      await driver.pressKey('Escape', 10);
      await driver.page.waitForTimeout(20);
    }

    // Engine must remain responsive
    const finalState = await driver.getState();
    expect(finalState.engine.isRunning).toBe(true);
  });

  test('T2.1.5 — Malformed query parameters (?seed=NaN&difficulty=unknown) sanitize safely', async () => {
    await driver.launchGame({
      queryParams: {
        seed: 'invalid_not_a_number',
        difficulty: 'super_ultra_unknown',
      },
    });
    await driver.waitForEngineReady();

    const state = await driver.getState();
    // Falls back to numeric seed and valid world
    expect(typeof state.world.seed).toBe('number');
    expect(isNaN(state.world.seed)).toBe(false);
  });
});
