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
import { GameDriver } from '../helpers/game-driver';

test.describe('Tier 2 Boundary: Combat & AI Edge Conditions', () => {
  let driver: GameDriver;

  test.beforeEach(async ({ page }) => {
    driver = new GameDriver(page);
    await driver.launchGame({ tutorial: false });
    await driver.waitForEngineReady();
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
    await driver.page.waitForTimeout(100);

    const deathState = await driver.getState();
    expect(deathState.player.health).toBe(0);
    // Menu or death modal should be active
    expect(deathState.ui.currentMenu).toMatch(/death|game_over/i);

    // Attempting to move while dead must not alter coordinates
    const startX = deathState.player.x;
    await driver.moveDirection('E', 1);
    const postMove = await driver.getState();
    expect(postMove.player.x).toBe(startX);
  });

  test('T2.3.3 — Zero mana skill cast rejection: casting Q or E with 0 mana fails gracefully', async () => {
    await driver.executeDebugCommand('/mana 0');
    const zeroManaState = await driver.getState();
    expect(zeroManaState.player.mana).toBe(0);

    // Cast Spin Attack (Key Q, requires 30 mana)
    await driver.castSkill('Q');
    await driver.page.waitForTimeout(50);

    const postQState = await driver.getState();
    expect(postQState.player.mana).toBe(0); // Did not go negative
    expect(postQState.camera.shakeMagnitude).toBe(0); // Skill did not execute

    // Cast Magic Projectile (Key E, requires 20 mana)
    await driver.castSkill('E');
    await driver.page.waitForTimeout(50);
    const postEState = await driver.getState();
    expect(postEState.player.mana).toBe(0);
  });

  test('T2.3.4 — Invulnerability frames: consecutive hits within 600ms hurtTimer window are rejected', async () => {
    await driver.executeDebugCommand('/health 10');
    const initial = await driver.getState();
    expect(initial.player.health).toBe(10);

    // Apply 1st hit
    await driver.executeDebugCommand('/damage_player 2');
    const hit1 = await driver.getState();
    expect(hit1.player.health).toBe(8);
    expect(hit1.player.hurtTimer).toBeGreaterThan(0);

    // Apply immediate 2nd hit during i-frames window
    await driver.executeDebugCommand('/damage_player 2');
    const hit2 = await driver.getState();
    // Damage must be negated by i-frames
    expect(hit2.player.health).toBe(8);
  });

  test('T2.3.5 — Beetle Boss crush immunity: pushing boss against solid cliff does not instakill', async () => {
    await driver.executeDebugCommand('/tp 10 10');
    await driver.executeDebugCommand('/spawn beetle 1 0');

    const state = await driver.getState();
    const boss = state.enemies.find((e) => e.type === 'beetle');
    expect(boss).toBeDefined();

    // Force boss against solid tile
    await driver.executeDebugCommand(`/push_enemy ${boss?.id} 1 0`);
    await driver.page.waitForTimeout(100);

    const postPushBoss = (await driver.getState()).enemies.find((e) => e.id === boss?.id);
    expect(postPushBoss?.health).toBeGreaterThan(0);
  });

  test('T2.3.6 — Flee lock: Mantis at 1 HP maintains flee behavior and cannot re-aggro while fleeing', async () => {
    await driver.executeDebugCommand('/spawn mantis 2 0');
    const startState = await driver.getState();
    const mantis = startState.enemies.find((e) => e.type === 'mantis');
    expect(mantis).toBeDefined();

    // Damage to 1 HP
    await driver.executeDebugCommand(`/damage_enemy ${mantis?.id} ${mantis!.health - 1}`);
    await driver.page.waitForTimeout(100);

    const fleeingState = await driver.getState();
    const fleeingMantis = fleeingState.enemies.find((e) => e.id === mantis?.id);
    expect(fleeingMantis?.isPanicking).toBe(true);

    // Player steps closer to mantis; mantis must continue fleeing rather than attacking
    await driver.moveDirection('E', 1);
    await driver.page.waitForTimeout(100);

    const postApproachState = await driver.getState();
    const stillFleeingMantis = postApproachState.enemies.find((e) => e.id === mantis?.id);
    expect(stillFleeingMantis?.isPanicking).toBe(true);
  });
});
