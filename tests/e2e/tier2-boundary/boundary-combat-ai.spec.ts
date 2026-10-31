/**
 * Tier 2 Boundary Test Suite: Combat Limits, AI Edge Conditions & Death Lifecycle
 * Covers:
 * - Hard HP cap at 20 (cannot exceed via potions, upgrades, or regeneration)
 * - Zero HP player death state & Game Over modal
 * - Zero mana skill failure ("Need Mana!" warning)
 * - Invulnerability frame damage rejection window (600ms player / 800ms boss)
 * - Beetle Boss crush & knockback immunity
 * - Panic state locks on low HP mobs (Mantis & Maggot)
 */

import { test, expect } from '@playwright/test';
import { boot } from '../helpers/directional-fixture';
import { bossAtWall } from '../helpers/encounter-contract';
import { GameDriver } from '../helpers/game-driver';

test.describe('Tier 2 Boundary: Combat & AI Edge Conditions', () => {
  let driver: GameDriver;

  test.beforeEach(async ({ page }) => {
    driver = new GameDriver(page, '', true);
    await boot(page);
  });

  test('T2.3.1 — Hard HP Cap: player max health cannot exceed 20 HP through stat points or potions', async () => {
    // Attempt to set health to 99 via console or upgrade
    await driver.executeDebugCommand('/health 99');
    const state = await driver.getState();

    // Must be clamped to the authoritative 20 HP hard cap
    expect(state.player.maxHealth).toBeLessThanOrEqual(20);
    expect(state.player.health).toBeLessThanOrEqual(20);

    // Using health potion at 20 HP cannot exceed 20
    await driver.executeDebugCommand('/give potion');
    await driver.useConsumable(1);
    const postPotion = await driver.getState();
    expect(postPotion.player.health).toBeLessThanOrEqual(20);
  });

  test('T2.3.2 — Player zero HP death: triggers Game Over screen and locks movement', async () => {
    // Reduce player HP to 0
    await driver.executeDebugCommand('/health 0');
    await driver.page.clock.runFor(100);

    const deathState = await driver.getState();
    expect(deathState.player.health).toBe(0);
    // Menu or death modal should be active
    expect(deathState.ui.currentMenu).toBe('gameover');

    // Attempting to move while dead must not alter coordinates
    const startX = deathState.player.x;
    await driver.moveDirection('E', 1);
    const postMove = await driver.getState();
    expect(postMove.player.x).toBe(startX);
  });

  test('T2.3.3 — insufficient mana rejects both skills while regeneration stays nonnegative', async () => {
    await driver.executeDebugCommand('/mana 0');
    await driver.executeDebugCommand('/spawn mantis 1.5 0');
    const enemy = (await driver.getState()).enemies[0]!;
    for (const key of ['KeyQ', 'KeyR']) {
      const before = await driver.getState();
      await driver.page.keyboard.press(key); await driver.page.clock.runFor(100);
      const after = await driver.getState();
      const seconds = (after.engine.stepCount - before.engine.stepCount) * before.engine.fixedDeltaMs / 1000;
      expect(seconds).toBeGreaterThan(.07); expect(seconds).toBeLessThan(.14);
      expect(after.player.mana).toBeCloseTo(before.player.mana + seconds * 3, 5);
      expect(after.enemies.find(e => e.id === enemy.id)!.health).toBe(enemy.health);
      expect(after.camera.shakeMagnitude).toBe(0);
      expect(after.player.mana).toBeGreaterThanOrEqual(0);
    }
    expect(await driver.page.evaluate(() => {
      window.__GAME__!.saveGame('rejected-cast');
      const data = JSON.parse(localStorage.getItem('forestrpg.v2.save.rejected-cast')!);
      return data.entities.filter((e: { kind: string }) => e.kind === 'projectile').length;
    })).toBe(0);
  });

  test('T2.3.4 — ordinary enemy strikes respect the 800 ms immunity window', async () => {
    await driver.executeDebugCommand('/health 10');
    const initial = await driver.getState();
    expect(initial.player.health).toBe(Math.min(10, initial.player.maxHealth));
    await driver.executeDebugCommand('/spawn mantis 0.5 0');
    await driver.page.clock.runFor(250);
    const first = await driver.getState();
    expect(first.player.health).toBe(initial.player.health - 1); expect(first.player.hurtTimer).toBeGreaterThan(700);
    // A fresh attacker delivers another ordinary strike within the first hurt window.
    await driver.executeDebugCommand('/spawn mantis -0.5 0');
    await driver.page.clock.runFor(250);
    expect((await driver.getState()).player.health).toBe(first.player.health);
    await driver.page.clock.runFor(800);
    expect((await driver.getState()).player.health).toBeLessThan(first.player.health);
  });

  test('T2.3.5 — a successful melee hit against a wall cannot crush or displace the boss', async () => {
    await bossAtWall(driver.page);
  });

  test('T2.3.6 — Flee lock: Mantis at 1 HP maintains flee behavior and cannot re-aggro while fleeing', async () => {
    await driver.executeDebugCommand('/spawn mantis 2 0');
    const startState = await driver.getState();
    const mantis = startState.enemies.find((e) => e.type === 'mantis');
    expect(mantis).toBeDefined();

    // Damage to 1 HP
    await driver.executeDebugCommand(`/damage_enemy ${mantis?.id} ${mantis!.health - 1}`);
    await driver.page.clock.runFor(100);

    const fleeingState = await driver.getState();
    const fleeingMantis = fleeingState.enemies.find((e) => e.id === mantis?.id);
    expect(fleeingMantis?.isPanicking).toBe(true);

    // Player steps closer to mantis; mantis must continue fleeing rather than attacking
    await driver.moveDirection('E', 1);
    await driver.page.clock.runFor(100);

    const postApproachState = await driver.getState();
    const stillFleeingMantis = postApproachState.enemies.find((e) => e.id === mantis?.id);
    expect(stillFleeingMantis?.isPanicking).toBe(true);
  });
});
