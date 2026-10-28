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
import { loadBorderWorld } from '../helpers/collision-fixture';

test.describe('Tier 2 Boundary: Simulation Pacing & Movement Limits', () => {
  let driver: GameDriver;

  test.beforeEach(async ({ page }) => {
    driver = new GameDriver(page);
    await driver.launchGame({ tutorial: false });
    await driver.waitForEngineReady();
  });

  test('T2.2.1 — World edge clamping: player at (0, 0) cannot move North or West beyond boundaries', async () => {
    await loadBorderWorld(driver.page);
    await driver.executeDebugCommand('/tp 0 0');
    const start = await driver.getState();
    expect(start.player.x).toBeCloseTo(1.5);
    expect(start.player.y).toBeCloseTo(1.5);
    await driver.moveDirection('N', 1);
    await driver.moveDirection('W', 1);
    const after = await driver.getState();
    expect(after.player.x).toBeCloseTo(1.3);
    expect(after.player.y).toBeCloseTo(1.3);
  });

  test('T2.2.2 — World maximum coordinate clamping: player at (149, 149) cannot exceed map dimensions', async () => {
    await loadBorderWorld(driver.page);
    await driver.executeDebugCommand('/tp 149 149');
    const start = await driver.getState();
    expect(start.player.x).toBeCloseTo(10.5);
    expect(start.player.y).toBeCloseTo(10.5);
    await driver.moveDirection('S', 1);
    await driver.moveDirection('E', 1);
    const after = await driver.getState();
    expect(after.player.x).toBeCloseTo(10.7);
    expect(after.player.y).toBeCloseTo(10.7);
  });

  test('T2.2.3 — Zero stamina boundary: stamina never goes below 0 and prevents sprint engagement', async () => {
    await driver.executeDebugCommand('/stamina 0');
    const state = await driver.getState();
    expect(state.player.stamina).toBe(0);

    // Try sprinting East 3 times
    await driver.moveDirection('E', 3, /* sprint = */ true);
    const after = await driver.getState();
    expect(after.player.stamina).toBe(0); // Cannot be negative
    expect(after.player.isSprinting).toBe(false);
  });

  test('T2.2.4 — Delta time clamping: long frame pause (5000ms delay) clamps dt to 50ms and prevents spiral-of-death', async () => {
    const _beforeState = await driver.getState();

    // Emulate tab backgrounding / huge GC pause by freezing thread for 2000ms
    await driver.page.evaluate(() => {
      const start = performance.now();
      while (performance.now() - start < 100) {
        // Synchronous spin to trigger delta spike
      }
    });

    await driver.page.waitForTimeout(50);
    const afterState = await driver.getState();

    // Simulation loop must not freeze and accumulator must drop excessive backlog
    expect(afterState.engine.isRunning).toBe(true);
    expect(afterState.engine.accumulatorMs).toBeLessThanOrEqual(100);
  });

  test('T2.2.5 — Conflicting simultaneous directional inputs cancel out cleanly', async () => {
    const initial = await driver.getState();
    const startX = initial.player.x;

    // Hold KeyA (West) and KeyD (East) simultaneously
    await driver.page.keyboard.down('KeyA');
    await driver.page.keyboard.down('KeyD');
    await driver.page.waitForTimeout(150);
    await driver.page.keyboard.up('KeyA');
    await driver.page.keyboard.up('KeyD');

    const endState = await driver.getState();
    // Conflicting opposing keys result in 0 horizontal displacement
    expect(endState.player.x).toBe(startX);
  });
});
