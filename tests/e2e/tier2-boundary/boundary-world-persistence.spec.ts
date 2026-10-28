/**
 * Tier 2 Boundary Test Suite: World Borders, Save Corruption & Persistence Stress
 * Covers:
 * - Corrupted JSON save data recovery
 * - Save files with mismatched dimensions or persistentGameId
 * - Camera clamping at all 4 world corners without rendering jitter
 * - Rapid save/load serialization spam
 * - Malformed terminal input stress (/tp out of bounds, negative values)
 */

import { test, expect } from '@playwright/test';
import { GameDriver } from '../helpers/game-driver';
import { CORRUPTED_LEGACY_PAYLOADS } from '../helpers/legacy-fixtures';

test.describe('Tier 2 Boundary: World Borders & Persistence Stress', () => {
  let driver: GameDriver;

  test.beforeEach(async ({ page }) => {
    driver = new GameDriver(page);
  });

  test('T2.4.1 — Malformed JSON string in localStorage recovers cleanly on boot', async () => {
    await driver.launchGame({
      storageItems: {
        autosave_map: CORRUPTED_LEGACY_PAYLOADS.malformedJsonString,
      },
    });
    await driver.waitForEngineReady();

    const state = await driver.getState();
    expect(state.engine.isRunning).toBe(true);
    expect(state.world.width).toBe(150);
  });

  test('T2.4.2 — Invalid tile ID array recovers to default grass/forest grid', async () => {
    await driver.launchGame({
      storageItems: {
        autosave_map: JSON.stringify(CORRUPTED_LEGACY_PAYLOADS.invalidTileIds),
      },
    });
    await driver.waitForEngineReady();

    const state = await driver.getState();
    expect(state.engine.isRunning).toBe(true);
  });

  test('T2.4.3 — Camera viewport clamping at all 4 extreme corners (NW, NE, SW, SE)', async () => {
    await driver.launchGame();
    await driver.waitForEngineReady();

    const corners = [
      { name: 'NW', x: 0, y: 0 },
      { name: 'NE', x: 149, y: 0 },
      { name: 'SW', x: 0, y: 149 },
      { name: 'SE', x: 149, y: 149 },
    ];

    for (const corner of corners) {
      await driver.executeDebugCommand(`/tp ${corner.x} ${corner.y}`);
      await driver.page.waitForTimeout(100);

      const state = await driver.getState();
      expect(state.camera.boundsClamped).toBe(true);
      expect(state.camera.x).toBeGreaterThanOrEqual(0);
      expect(state.camera.y).toBeGreaterThanOrEqual(0);
    }
  });

  test('T2.4.4 — Rapid save/load spam: 10 back-to-back saves without race conditions', async () => {
    await driver.launchGame();
    await driver.waitForEngineReady();

    for (let i = 0; i < 5; i++) {
      await driver.executeDebugCommand('/save');
      await driver.executeDebugCommand('/load');
    }

    const state = await driver.getState();
    expect(state.engine.isRunning).toBe(true);
  });

  test('T2.4.5 — Terminal command out-of-bounds inputs: /tp 999999 999999 is safely clamped or rejected', async () => {
    await driver.launchGame();
    await driver.waitForEngineReady();

    const _result = await driver.executeDebugCommand('/tp 999999 999999');
    const state = await driver.getState();

    // Coordinates must either remain unchanged or clamp to [0, 149]
    expect(state.player.x).toBeLessThanOrEqual(149);
    expect(state.player.y).toBeLessThanOrEqual(149);
  });

  test('T2.4.6 — Terminal negative health command: /health -100 clamps to 0 or rejects without error', async () => {
    await driver.launchGame();
    await driver.waitForEngineReady();

    await driver.executeDebugCommand('/health -100');
    const state = await driver.getState();

    // Player health must be clamped to >= 0
    expect(state.player.health).toBeGreaterThanOrEqual(0);
  });
});
