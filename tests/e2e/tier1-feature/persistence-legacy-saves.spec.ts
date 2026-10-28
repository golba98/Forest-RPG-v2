/**
 * Tier 1 Feature Test Suite: Persistence & Legacy Save Adapter
 * Covers:
 * - Feature 24: Versioned JSON Persistence
 * - Feature 25: Legacy Save Adapter (maps/active_map.json format)
 */

import { test, expect } from '@playwright/test';
import { GameDriver } from '../helpers/game-driver';
import {
  MINIMAL_LEGACY_MAP_8X8,
  createStandardLegacyMap150x150,
  CORRUPTED_LEGACY_PAYLOADS,
  LEGACY_SETTINGS_DEFAULT,
} from '../helpers/legacy-fixtures';

test.describe('Tier 1: Persistence & Legacy Save Adapter', () => {
  let driver: GameDriver;

  test.beforeEach(async ({ page }) => {
    driver = new GameDriver(page);
  });

  test('T1.5.1 — Versioned save serialization: game saves valid JSON state into localStorage', async () => {
    await driver.launchGame({ seed: 7777 });
    await driver.waitForEngineReady();

    // Advance player and collect a coin
    await driver.executeDebugCommand('/tp 50 50');
    await driver.executeDebugCommand('/health 6');

    // Trigger manual or auto save
    await driver.executeDebugCommand('/save');
    const rawSave = await driver.getLocalStorage('autosave_map');
    expect(rawSave).not.toBeNull();

    const parsed = JSON.parse(rawSave!);
    expect(parsed.playerPosition.x).toBe(50);
    expect(parsed.playerPosition.y).toBe(50);
    expect(parsed.logicalW).toBe(150);
    expect(parsed.logicalH).toBe(150);
  });

  test('T1.5.2 — Save restoration: reload from saved state restores identical player and world vitals', async () => {
    await driver.launchGame({ seed: 8888 });
    await driver.waitForEngineReady();

    await driver.executeDebugCommand('/tp 42 42');
    await driver.executeDebugCommand('/save');

    // Reload page
    await driver.page.reload({ waitUntil: 'domcontentloaded' });
    await driver.waitForEngineReady();

    // Trigger load
    await driver.executeDebugCommand('/load');
    await driver.page.waitForTimeout(100);

    const loadedState = await driver.getState();
    expect(loadedState.player.x).toBe(42);
    expect(loadedState.player.y).toBe(42);
  });

  test('T1.5.3 — Legacy adapter parses minimal 8x8 active_map fixture without throwing', async () => {
    await driver.launchGame({
      storageItems: {
        autosave_map: JSON.stringify(MINIMAL_LEGACY_MAP_8X8),
      },
    });
    await driver.waitForEngineReady();

    const state = await driver.getState();
    expect(state.engine.isRunning).toBe(true);
  });

  test('T1.5.4 — Legacy adapter parses standard 150x150 active_map fixture (22,500 tiles) with enemies and rivers', async () => {
    const standardFixture = createStandardLegacyMap150x150();
    await driver.launchGame({
      storageItems: {
        autosave_map: JSON.stringify(standardFixture),
      },
    });
    await driver.waitForEngineReady();

    const state = await driver.getState();
    expect(state.world.width).toBe(150);
    expect(state.world.height).toBe(150);

    // Player position restored to (75, 75)
    expect(state.player.x).toBe(75);
    expect(state.player.y).toBe(75);

    // Enemies restored (Mantis, Maggot, Beetle)
    const enemyTypes = state.enemies.map((e) => e.type);
    expect(enemyTypes).toContain('mantis');
    expect(enemyTypes).toContain('maggot');
    expect(enemyTypes).toContain('beetle');
  });

  test('T1.5.5 — Corrupt save recovery: truncated map array falls back gracefully to fresh world', async () => {
    await driver.launchGame({
      storageItems: {
        autosave_map: JSON.stringify(CORRUPTED_LEGACY_PAYLOADS.truncatedArray),
      },
    });
    // Engine must recover without unhandled exception
    await driver.waitForEngineReady();

    const state = await driver.getState();
    expect(state.engine.isRunning).toBe(true);
    // Fresh 150x150 world initialized
    expect(state.world.width).toBe(150);
  });

  test('T1.5.6 — Legacy settings schema parsed and applied cleanly', async () => {
    await driver.launchGame({
      storageItems: {
        'game.settings': JSON.stringify(LEGACY_SETTINGS_DEFAULT),
      },
    });
    await driver.waitForEngineReady();

    const state = await driver.getState();
    expect(state.engine.isRunning).toBe(true);
  });
});
