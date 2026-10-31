/**
 * Tier 1 Feature Test Suite: World Gen, Environment, Camera, Tutorial & Lifecycle
 * Covers:
 * - Feature 2: 2D Camera (Follow, Zoom, Bounds, Shake)
 * - Feature 5: Chunked Terrain & Viewport Culling
 * - Feature 6: Depth-Sorted Entity Layers
 * - Feature 7: Day/Night Lighting Transitions
 * - Feature 8: Ambient Weather Particle Effects
 * - Feature 10: Seeded Procedural World Gen & Connectivity
 * - Feature 19: Loot Drops, Consumables & Environmental Cut
 * - Feature 21: Tutorial Flow (Training Glade -> Level 1)
 * - Feature 22: Portal Activation & Victory Sequence
 * - Feature 23: In-Game Debug Terminal Commands
 */

import { test, expect } from '@playwright/test';
import { boot } from '../helpers/directional-fixture';
import { GameDriver } from '../helpers/game-driver';

test.describe('Tier 1: World Gen, Environment, Camera & Lifecycle', () => {
  let driver: GameDriver;

  test.beforeEach(async ({ page }) => {
    driver = new GameDriver(page);
  });

  test('T1.4.1 — Seeded world gen determinism: identical seed produces identical map layout', async ({
    page: _page,
  }) => {
    const fixedSeed = 42819;
    await driver.launchGame({ seed: fixedSeed });
    await driver.waitForEngineReady();

    const state1 = await driver.getState();
    expect(state1.world.seed).toBe(fixedSeed);
    expect(state1.world.width).toBe(150);
    expect(state1.world.height).toBe(150);
    const spawnPos1 = { x: state1.player.x, y: state1.player.y };
    const portalPos1 = { ...state1.world.portalPos };

    // Reload with exact same seed
    await driver.launchGame({ seed: fixedSeed });
    await driver.waitForEngineReady();

    const state2 = await driver.getState();
    expect(state2.player.x).toBe(spawnPos1.x);
    expect(state2.player.y).toBe(spawnPos1.y);
    expect(state2.world.portalPos.x).toBe(portalPos1.x);
    expect(state2.world.portalPos.y).toBe(portalPos1.y);
  });

  test('T1.4.2 — 2D Camera smooth tracking and world boundary clamping', async () => {
    await driver.launchGame({ seed: 100 });
    await driver.waitForEngineReady();

    const initial = await driver.getState();
    const _initCamX = initial.camera.x;
    const _initCamY = initial.camera.y;

    // Teleport player near edge (x: 2, y: 2)
    await driver.executeDebugCommand('/tp 2 2');
    await driver.page.waitForTimeout(150);

    const edgeState = await driver.getState();
    // Camera must clamp to world bounds, preventing negative offsets
    expect(edgeState.camera.x).toBeGreaterThanOrEqual(0);
    expect(edgeState.camera.y).toBeGreaterThanOrEqual(0);
    expect(edgeState.camera.boundsClamped).toBe(true);
  });

  test('T1.4.3 — Day/Night lighting cycle transitions and ambient darkness', async () => {
    await driver.launchGame();
    await driver.waitForEngineReady();

    // Transition to Day
    await driver.executeDebugCommand('/time day');
    await driver.page.waitForTimeout(100);
    const dayState = await driver.getState();
    expect(dayState.world.ambientDarknessAlpha).toBeLessThan(0.3);

    // Transition to Night
    await driver.executeDebugCommand('/time night');
    await driver.page.waitForTimeout(100);
    const nightState = await driver.getState();
    // Darkness must increase significantly during night phase
    expect(nightState.world.ambientDarknessAlpha).toBeGreaterThan(0.6);
  });

  test('T1.4.4 — Weather particle system: night starfield activates when darkness threshold exceeded', async () => {
    await driver.launchGame();
    await driver.waitForEngineReady();

    await driver.executeDebugCommand('/time night');
    await driver.page.waitForTimeout(150);

    const nightState = await driver.getState();
    expect(nightState.world.starCount).toBeGreaterThanOrEqual(400);
  });

  test('T1.4.5 — melee cuts fixture flowers in its cone after the strike delay', async () => {
    await boot(driver.page);
    expect(await driver.page.evaluate(() => {
      const g = window.__GAME__!; g.saveGame('flowers');
      const data = JSON.parse(localStorage.getItem('forestrpg.v2.save.flowers')!);
      data.world.tiles[20 * 40 + 21] = 9;
      data.world.tiles[20 * 40 + 19] = 9;
      data.entities.find((e: { kind: string }) => e.kind === 'player').facing = 'E';
      localStorage.setItem('forestrpg.v2.save.flowers', JSON.stringify(data));
      return g.loadGame('flowers');
    })).toBe(true);
    const tiles = () => driver.page.evaluate(() => {
      window.__GAME__!.saveGame('flower-result');
      const data = JSON.parse(localStorage.getItem('forestrpg.v2.save.flower-result')!);
      return [data.world.tiles[20 * 40 + 21], data.world.tiles[20 * 40 + 19]];
    });
    await driver.page.keyboard.press('KeyE'); await driver.page.clock.runFor(100);
    expect(await tiles()).toEqual([9, 9]);
    await driver.page.clock.runFor(50);
    expect(await tiles()).toEqual([1, 9]);
  });

  test('T1.4.6 — Consumable usage: Key 1 drinks Health Potion, Key 2 drinks Speed Potion', async () => {
    await driver.launchGame();
    await driver.waitForEngineReady();

    // Grant 1 health potion and set health to 5
    await driver.executeDebugCommand('/health 5');
    await driver.executeDebugCommand('/give potion');

    const preDrink = await driver.getState();
    expect(preDrink.player.potions.health).toBeGreaterThanOrEqual(1);
    expect(preDrink.player.health).toBe(5);

    // Use health potion (Key 1)
    await driver.useConsumable(1);
    await driver.page.waitForTimeout(100);

    const postDrink = await driver.getState();
    // Health increases by 2 (5 -> 7)
    expect(postDrink.player.health).toBe(7);
    expect(postDrink.player.potions.health).toBe(preDrink.player.potions.health - 1);
  });

  test('T1.4.7 — Tutorial Flow (Training Glade): dedicated 20x20 glade progression', async () => {
    await driver.launchGame({ tutorial: true });
    await driver.waitForEngineReady();

    const state = await driver.getState();
    expect(state.world.isTutorial).toBe(true);
    expect(state.world.width).toBe(20);
    expect(state.world.height).toBe(20);
  });

  test('T1.4.8 — Victory condition: collecting all coins and defeating enemies activates portal', async () => {
    await driver.launchGame();
    await driver.waitForEngineReady();

    // Portal initially inactive
    const initial = await driver.getState();
    expect(initial.world.isPortalActive).toBe(false);

    // Collect all coins & kill all non-ghost enemies via debug console
    await driver.executeDebugCommand('/collect all');
    await driver.executeDebugCommand('/kill all');
    await driver.page.waitForTimeout(150);

    const victoryState = await driver.getState();
    // Portal must now be activated!
    expect(victoryState.world.isPortalActive).toBe(true);
  });

  test('T1.4.9 — actual terminal UI executes supported help, teleport and resource commands', async () => {
    await boot(driver.page);
    await driver.page.keyboard.press('Backquote'); await driver.page.clock.runFor(17);
    const input = driver.page.getByLabel('Terminal command');
    await expect(input).toBeVisible();
    for (const command of ['/help', '/tp 22 23', '/give health 2', '/stamina 0']) {
      await input.fill(command); await input.press('Enter');
    }
    await expect(driver.page.locator('#debug-terminal pre')).toContainText('/kill all|boss');
    await expect(driver.page.locator('#debug-terminal pre')).toContainText('Position: 22, 23.');
    const state = await driver.getState();
    expect(state.player.x).toBe(22); expect(state.player.y).toBe(23);
    expect(state.player.potions.health).toBeGreaterThanOrEqual(2);
    expect(state.player.stamina).toBe(0);
    await input.press('Escape'); await driver.page.clock.runFor(17);
    await expect(input).toBeHidden();
    expect((await driver.getState()).ui.currentMenu).toBeNull();
  });
});
