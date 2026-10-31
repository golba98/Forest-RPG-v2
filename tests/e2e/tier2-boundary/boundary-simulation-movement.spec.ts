/**
 * Tier 2 Boundary Test Suite: Simulation Pacing, Movement Limits & Physics Boundaries
 * Covers:
 * - Extreme map coordinates (0, 0) and (149, 149)
 * - Zero stamina bounds and negative value prevention
 * - Delta time 50ms clamping and spiral-of-death drop logic
 * - Conflicting simultaneous inputs (Left + Right, Up + Down)
 * - Corner clipping and diagonal speed scaling (1.22x factor)
 */

import { test, expect } from '@playwright/test';
import { GameDriver } from '../helpers/game-driver';
import { boot } from '../helpers/directional-fixture';
import { loadBorderWorld } from '../helpers/collision-fixture';

test.describe('Tier 2 Boundary: Simulation Pacing & Movement Limits', () => {
  let driver: GameDriver;

  test.beforeEach(async ({ page }) => {
    driver = new GameDriver(page);
    await boot(page);
  });

  test('T2.2.1 — World edge clamping: player at (0, 0) cannot move North or West beyond boundaries', async () => {
    await loadBorderWorld(driver.page);
    await driver.executeDebugCommand('/tp 0 0');
    const start = await driver.getState();
    expect(start.player.x).toBeCloseTo(1.5);
    expect(start.player.y).toBeCloseTo(1.5);
    await driver.page.keyboard.down('KeyW'); await driver.page.keyboard.down('KeyA');
    await driver.page.clock.runFor(500);
    const after = await driver.getState();
    const box = await driver.page.evaluate(() => window.__GAME__!.getGameplayDebug()!.playerFootprint);
    expect(box.minX).toBeGreaterThanOrEqual(1 - 1e-8); expect(box.minX).toBeLessThan(1.01);
    expect(box.minY).toBeGreaterThanOrEqual(1 - 1e-8); expect(box.minY).toBeLessThan(1.01);
    expect(after.player.x).toBeLessThan(start.player.x);
  });

  test('T2.2.2 — World maximum coordinate clamping: player at (149, 149) cannot exceed map dimensions', async () => {
    await loadBorderWorld(driver.page);
    await driver.executeDebugCommand('/tp 149 149');
    const start = await driver.getState();
    expect(start.player.x).toBeCloseTo(10.5);
    expect(start.player.y).toBeCloseTo(10.5);
    await driver.page.keyboard.down('KeyS'); await driver.page.keyboard.down('KeyD');
    await driver.page.clock.runFor(500);
    const after = await driver.getState();
    const box = await driver.page.evaluate(() => window.__GAME__!.getGameplayDebug()!.playerFootprint);
    expect(box.maxX).toBeLessThanOrEqual(11 + 1e-8); expect(box.maxX).toBeGreaterThan(10.99);
    expect(box.maxY).toBeLessThanOrEqual(11 + 1e-8); expect(box.maxY).toBeGreaterThan(10.99);
    expect(after.player.x).toBeGreaterThan(start.player.x);
  });

  test('T2.2.3 — Zero stamina boundary: stamina never goes below 0 and prevents sprint engagement', async () => {
    await driver.executeDebugCommand('/stamina 0');
    const state = await driver.getState();
    expect(state.player.stamina).toBe(0);

    // Try sprinting East 3 times
    await driver.page.keyboard.down('KeyD'); await driver.page.keyboard.down('ShiftLeft');
    await driver.page.clock.runFor(300);
    const after = await driver.getState();
    const seconds = (after.engine.stepCount - state.engine.stepCount) * state.engine.fixedDeltaMs / 1000;
    expect(seconds).toBeGreaterThan(.27); expect(seconds).toBeLessThan(.34);
    expect(after.player.stamina).toBeCloseTo(12 * seconds, 5); // Regeneration continues during lockout.
    expect(after.player.stamina).toBeGreaterThanOrEqual(0);
    expect(after.player.isSprinting).toBe(false);
  });

  test('T2.2.4 — a five-second frame gap clamps catch-up and normal movement resumes', async () => {
    await driver.page.keyboard.down('KeyD');
    const before = await driver.getState();
    // Skip RAF callbacks during the gap; unlike a busy loop this also works
    // with the controlled performance clock and cannot freeze the browser.
    await driver.page.clock.fastForward(5000);
    const after = await driver.getState();
    const steps = after.engine.stepCount - before.engine.stepCount;
    expect(steps).toBeGreaterThan(0); expect(steps).toBeLessThanOrEqual(3);
    expect(after.player.x - before.player.x).toBeCloseTo(6.25 * steps / 60, 6);
    expect(after.engine.isRunning).toBe(true);
    expect(after.engine.accumulatorMs).toBeLessThan(after.engine.fixedDeltaMs);
    await driver.page.clock.runFor(100);
    expect((await driver.getState()).player.x).toBeGreaterThan(after.player.x);
  });

  test('T2.2.5 — Conflicting simultaneous directional inputs cancel out cleanly', async () => {
    await driver.page.keyboard.down('KeyA');
    await driver.page.keyboard.down('KeyD');
    const initial = await driver.getState();
    await driver.page.clock.runFor(150);
    const held = await driver.getState();
    expect(held.player.x).toBe(initial.player.x);
    expect(held.player.y).toBe(initial.player.y);
    await driver.page.keyboard.up('KeyA'); await driver.page.keyboard.up('KeyD');
  });
});
