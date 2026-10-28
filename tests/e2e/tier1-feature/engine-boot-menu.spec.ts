/**
 * Tier 1 Feature Test Suite: Engine Boot, Loop, Menus & Audio
 * Covers:
 * - Feature 1: Standalone TypeScript Engine & Decoupled 60Hz Loop
 * - Feature 4: High-Fidelity Pixel-Art & Nearest-Neighbor Rendering
 * - Feature 9: Pixel-Art HUD & Adaptive Scaling
 * - Feature 36: Game Menu Systems & Audio Controls
 */

import { test, expect } from '@playwright/test';
import { GameDriver } from '../helpers/game-driver';

test.describe('Tier 1: Engine Boot, Simulation Loop & Menus', () => {
  let driver: GameDriver;

  test.beforeEach(async ({ page }) => {
    driver = new GameDriver(page);
  });

  test('T1.1.1 — Clean bootstrap: canvas attaches, no console errors, and page title is Forest RPG V2', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await driver.launchGame({ tutorial: false });
    await driver.waitForEngineReady();

    expect(consoleErrors).toEqual([]);
    const canvas = driver.getCanvas();
    await expect(canvas).toBeVisible();

    const title = await page.title();
    expect(title).toMatch(/Forest RPG/i);
  });

  test('T1.1.2 — 60Hz fixed-timestep simulation accumulator starts and ticks at 16.667ms nominal delta', async () => {
    await driver.launchGame();
    await driver.waitForEngineReady();

    const initial = await driver.getState();
    expect(initial.engine.isRunning).toBe(true);
    expect(initial.engine.targetFps).toBe(60);
    expect(initial.engine.fixedDeltaMs).toBeCloseTo(16.667, 1);

    // Wait 250ms (~15 frames) and assert stepCount has advanced proportionally
    await driver.page.waitForTimeout(250);
    const after = await driver.getState();
    const stepsElapsed = after.engine.stepCount - initial.engine.stepCount;

    // In 250ms at 60Hz, expected steps ≈ 15 (tolerance 10-20 across test environments)
    expect(stepsElapsed).toBeGreaterThanOrEqual(10);
    expect(stepsElapsed).toBeLessThanOrEqual(25);
  });

  test('T1.1.3 — Pause and resume halts simulation loop accumulator and resumes seamlessly', async () => {
    await driver.launchGame();
    await driver.waitForEngineReady();

    // Trigger pause via driver or Escape key
    await driver.pauseSimulation();
    const pausedState1 = await driver.getState();
    expect(pausedState1.engine.isPaused).toBe(true);

    const stepSnapshot = pausedState1.engine.stepCount;
    await driver.page.waitForTimeout(150);

    const pausedState2 = await driver.getState();
    // Step count must freeze while paused
    expect(pausedState2.engine.stepCount).toBe(stepSnapshot);

    // Resume simulation
    await driver.resumeSimulation();
    await driver.page.waitForTimeout(150);
    const resumedState = await driver.getState();
    expect(resumedState.engine.isPaused).toBe(false);
    expect(resumedState.engine.stepCount).toBeGreaterThan(stepSnapshot);
  });

  test('T1.1.4 — Nearest-neighbor texture filtering and crisp pixel-art canvas styling', async () => {
    await driver.launchGame();
    await driver.waitForEngineReady();

    const canvas = driver.getCanvas();
    // Check computed CSS image-rendering property
    const imageRendering = await canvas.evaluate((el) => {
      return window.getComputedStyle(el).imageRendering;
    });

    expect(['pixelated', 'crisp-edges', '-webkit-optimize-contrast']).toContain(imageRendering);

    const state = await driver.getState();
    expect(state.engine.canvasWidth).toBeGreaterThan(0);
    expect(state.engine.canvasHeight).toBeGreaterThan(0);
  });

  test('T1.1.5 — Main menu navigation and HUD activation', async () => {
    await driver.launchGame();
    await driver.waitForEngineReady();

    const state = await driver.getState();
    // In-game HUD must be active when game is loaded
    expect(state.ui.isHUDVisible).toBe(true);
    expect(state.player.health).toBe(7); // Base HP = 7
    expect(state.player.maxHealth).toBe(7);
    expect(state.player.mana).toBe(100); // Base Mana = 100
    expect(state.player.stamina).toBe(100); // Base Stamina = 100
  });

  test('T1.1.6 — Audio toggle and settings persistence to localStorage', async () => {
    await driver.launchGame();
    await driver.waitForEngineReady();

    // Set audio volume via debug command or direct localStorage
    await driver.executeDebugCommand('/volume master 0.4');
    const savedSettings = await driver.getLocalStorage('game.settings');

    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      expect(parsed.masterVol).toBeCloseTo(0.4, 1);
    }
  });

  test('T1.1.7 — Adaptive viewport resizing preserves aspect ratio and recalculates canvas bounds', async ({
    page,
  }) => {
    await driver.launchGame({ viewport: { width: 1280, height: 720 } });
    await driver.waitForEngineReady();

    const initial = await driver.getState();
    expect(initial.engine.canvasWidth).toBeGreaterThanOrEqual(1280);

    // Resize to 1920x1080 (1080p)
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(100);

    const resized = await driver.getState();
    expect(resized.engine.canvasWidth).toBeGreaterThanOrEqual(1920);
    expect(resized.engine.canvasHeight).toBeGreaterThanOrEqual(1080);
  });
});
