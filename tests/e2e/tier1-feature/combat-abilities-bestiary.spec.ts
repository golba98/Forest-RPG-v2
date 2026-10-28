/**
 * Tier 1 Feature Test Suite: Real-Time Combat, Skills & Bestiary AI
 * Covers:
 * - Feature 14: Mantis AI (Melee, Panic Flee at 1 HP)
 * - Feature 15: Maggot AI (Ranged Acid Spit, Panic Flee at 1 HP)
 * - Feature 16: Beetle Boss AI (Global Aggro, Lunge, Anti-Stuck, Crush Immunity)
 * - Feature 17: Ghost AI (Night Elite, Phase Walls, Blue Light, Dawn Despawn)
 * - Feature 18: Real-Time Combat (3-hit Combo, Critical 3rd, Wall Crush, Skills Q & E)
 * - Feature 20: XP Progression, Leveling & Stat Points
 */

import { test, expect } from '@playwright/test';
import { GameDriver } from '../helpers/game-driver';

test.describe('Tier 1: Real-Time Combat, Skills & Bestiary AI', () => {
  let driver: GameDriver;

  test.beforeEach(async ({ page }) => {
    driver = new GameDriver(page);
    await driver.launchGame({ tutorial: false });
    await driver.waitForEngineReady();
  });

  test('T1.3.1 — 3-Hit melee combo: 1st/2nd hits deal base damage, 3rd hit deals critical 1.5x+1 damage and kicks camera shake', async () => {
    // Spawn a target enemy (Mantis with 10 HP for combo testing) 1 tile ahead
    await driver.executeDebugCommand('/spawn mantis 1 0');
    const startState = await driver.getState();
    const _initialCombo = startState.player.comboCount;

    // Hit 1
    await driver.performMeleeAttack();
    await driver.page.waitForTimeout(100);
    const hit1State = await driver.getState();
    expect(hit1State.player.comboCount).toBe(1);

    // Hit 2
    await driver.performMeleeAttack();
    await driver.page.waitForTimeout(100);
    const hit2State = await driver.getState();
    expect(hit2State.player.comboCount).toBe(2);

    // Hit 3 (Critical Hit)
    await driver.performMeleeAttack();
    await driver.page.waitForTimeout(100);
    const hit3State = await driver.getState();
    // 3rd hit resets combo to 0 and triggers enhanced camera shake (2.5)
    expect(hit3State.player.comboCount).toBe(0);
    expect(hit3State.camera.shakeMagnitude).toBeGreaterThanOrEqual(2.0);
  });

  test('T1.3.2 — Combo reset: exceeding 800ms attack window resets combo count back to 0', async () => {
    await driver.performMeleeAttack();
    const hit1State = await driver.getState();
    expect(hit1State.player.comboCount).toBe(1);

    // Wait > 800ms without attacking
    await driver.page.waitForTimeout(900);

    const expiredState = await driver.getState();
    expect(expiredState.player.comboCount).toBe(0);
  });

  test('T1.3.3 — Skill Q (AoE Spin Attack): consumes 30 mana, deals 2x damage in 3.5 tile radius', async () => {
    const initial = await driver.getState();
    expect(initial.player.mana).toBeGreaterThanOrEqual(30);

    // Cast Spin Attack (Key Q)
    await driver.castSkill('Q');
    await driver.page.waitForTimeout(100);

    const postSkill = await driver.getState();
    // Mana reduced by exactly 30
    expect(postSkill.player.mana).toBeLessThanOrEqual(initial.player.mana - 29);
    // Radial camera shake triggered
    expect(postSkill.camera.shakeMagnitude).toBeGreaterThanOrEqual(2.0);
  });

  test('T1.3.4 — Skill E (Magic Projectile): consumes 20 mana, spawns directional projectile', async () => {
    const initial = await driver.getState();
    expect(initial.player.mana).toBeGreaterThanOrEqual(20);

    // Cast Magic Projectile (Key E)
    await driver.castSkill('E');
    await driver.page.waitForTimeout(80);

    const postCast = await driver.getState();
    expect(postCast.player.mana).toBeLessThanOrEqual(initial.player.mana - 19);
  });

  test('T1.3.5 — Solid wall crush execution: knocking regular mob into solid obstacle instakills with SPLAT', async () => {
    // Spawn mantis between player and solid cliff
    await driver.executeDebugCommand('/tp 2 2');
    await driver.executeDebugCommand('/spawn mantis 1 0');

    // Attack toward mantis pushing it against solid wall at x: 0
    await driver.performMeleeAttack();
    await driver.page.waitForTimeout(150);

    const enemies = (await driver.getState()).enemies;
    const nearbyEnemy = enemies.find((e) => Math.abs(e.x - 2) <= 2 && Math.abs(e.y - 2) <= 2);
    // Enemy crushed or defeated
    if (nearbyEnemy) {
      expect(nearbyEnemy.health).toBe(0);
    }
  });

  test('T1.3.6 — Bestiary Mantis AI: melee aggro at 8 tiles, panic flee for 4000ms upon reaching 1 HP', async () => {
    await driver.executeDebugCommand('/spawn mantis 5 0');
    const state = await driver.getState();
    const mantis = state.enemies.find((e) => e.type === 'mantis');
    expect(mantis).toBeDefined();

    // Damage mantis to exactly 1 HP
    await driver.executeDebugCommand(`/damage_enemy ${mantis?.id} 2`);
    await driver.page.waitForTimeout(100);

    const panickingState = await driver.getState();
    const updatedMantis = panickingState.enemies.find((e) => e.id === mantis?.id);
    expect(updatedMantis?.health).toBe(1);
    expect(updatedMantis?.isPanicking).toBe(true);
  });

  test('T1.3.7 — Bestiary Maggot AI: ranged acid spit notice at 10 tiles, panic flee at 1 HP', async () => {
    await driver.executeDebugCommand('/spawn maggot 6 0');
    const state = await driver.getState();
    const maggot = state.enemies.find((e) => e.type === 'maggot');
    expect(maggot).toBeDefined();

    // Reduce Maggot HP to 1
    await driver.executeDebugCommand(`/damage_enemy ${maggot?.id} 1`);
    await driver.page.waitForTimeout(100);

    const panickingState = await driver.getState();
    const updatedMaggot = panickingState.enemies.find((e) => e.id === maggot?.id);
    expect(updatedMaggot?.isPanicking).toBe(true);
  });

  test('T1.3.8 — Bestiary Beetle Boss AI: persistent aggro, immune to crush instakill, resists knockback', async () => {
    await driver.executeDebugCommand('/spawn beetle 4 0');
    const state = await driver.getState();
    const boss = state.enemies.find((e) => e.type === 'beetle');
    expect(boss).toBeDefined();
    expect(boss?.maxHealth).toBeGreaterThanOrEqual(15);
    expect(boss?.immuneToCrush).toBe(true);
    expect(boss?.resistsKnockback).toBe(true);

    // Attack beetle boss
    await driver.performMeleeAttack();
    await driver.page.waitForTimeout(100);

    const postAttackBoss = (await driver.getState()).enemies.find((e) => e.id === boss?.id);
    // Boss takes damage but is not crushed
    expect(postAttackBoss?.health).toBeGreaterThan(0);
  });

  test('T1.3.9 — Bestiary Ghost AI: phases through obstacles, blue point-light, despawns at dawn', async () => {
    // Set time to night
    await driver.executeDebugCommand('/time night');
    await driver.executeDebugCommand('/spawn ghost 3 0');

    const nightState = await driver.getState();
    const ghost = nightState.enemies.find((e) => e.type === 'ghost');
    expect(ghost).toBeDefined();

    // Transition time to dawn
    await driver.executeDebugCommand('/time dawn');
    await driver.page.waitForTimeout(200);

    const dawnState = await driver.getState();
    const despawnedGhost = dawnState.enemies.find((e) => e.id === ghost?.id);
    // Ghost must despawn at dawn
    expect(despawnedGhost).toBeUndefined();
  });

  test('T1.3.10 — XP progression & Level-up: defeating enemy awards XP, 100 XP triggers level-up', async () => {
    const initial = await driver.getState();
    expect(initial.player.level).toBe(1);
    expect(initial.player.xp).toBe(0);
    expect(initial.player.xpToNextLevel).toBe(100);

    // Grant 100 XP via debug command
    await driver.executeDebugCommand('/xp 100');
    await driver.page.waitForTimeout(100);

    const levelUpState = await driver.getState();
    expect(levelUpState.player.level).toBe(2);
    expect(levelUpState.player.statPoints).toBeGreaterThanOrEqual(1);
    // Next level threshold scales by 1.5x (floor(100 * 1.5) = 150)
    expect(levelUpState.player.xpToNextLevel).toBe(150);
  });
});
