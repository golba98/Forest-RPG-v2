import { test, expect } from '@playwright/test';
import { boot } from '../helpers/directional-fixture';
import { loadBorderWorld } from '../helpers/collision-fixture';
import { GAME_CONFIG as C } from '../../../src/config/GameConfig';

test.beforeEach(async ({ page }) => { await boot(page); });

test('T1.2.1 — continuous eight-direction displacement has normalized speed', async ({ page }) => {
  for (const keys of [['KeyW'], ['KeyD'], ['KeyS'], ['KeyA'], ['KeyW', 'KeyD'], ['KeyS', 'KeyD'], ['KeyS', 'KeyA'], ['KeyW', 'KeyA']]) {
    await page.evaluate(() => window.__GAME__!.setPlayerPosition(20.5, 20.5));
    for (const key of keys) await page.keyboard.down(key);
    const before = await page.evaluate(() => window.__GAME__!.getState().engine);
    await page.clock.runFor(200);
    const state = await page.evaluate(() => window.__GAME__!.getState());
    const p = state.player;
    const seconds = (state.engine.stepCount - before.stepCount) * before.fixedDeltaMs / 1000;
    expect(seconds).toBeGreaterThan(.17); expect(seconds).toBeLessThan(.24);
    const dx = Number(keys.includes('KeyD')) - Number(keys.includes('KeyA'));
    const dy = Number(keys.includes('KeyS')) - Number(keys.includes('KeyW'));
    expect(Math.sign(p.x - 20.5)).toBe(dx); expect(Math.sign(p.y - 20.5)).toBe(dy);
    expect(Math.hypot(p.x - 20.5, p.y - 20.5)).toBeCloseTo(C.player.walkSpeed * seconds, 6);
    for (const key of keys) await page.keyboard.up(key);
  }
});

test('T1.2.2 — sprint drains stamina and exceeds walking pace', async ({ page }) => {
  await page.keyboard.down('KeyD'); await page.keyboard.down('ShiftLeft');
  const before = await page.evaluate(() => window.__GAME__!.getState().engine);
  await page.clock.runFor(400);
  const state = await page.evaluate(() => window.__GAME__!.getState());
  const p = state.player;
  const seconds = (state.engine.stepCount - before.stepCount) * before.fixedDeltaMs / 1000;
  expect(p.isSprinting).toBe(true);
  expect(p.stamina).toBeCloseTo(100 - C.player.sprintDrainPerSec * seconds, 5);
  expect(p.x - 20.5).toBeGreaterThan(C.player.walkSpeed * seconds);
});

test('T1.2.3 — exhausted stamina regenerates while sprint remains locked for four seconds', async ({ page }) => {
  await page.evaluate(() => window.__GAME__!.executeCommand('/stamina 0'));
  await page.keyboard.down('KeyD'); await page.keyboard.down('ShiftLeft');
  const before = await page.evaluate(() => window.__GAME__!.getState().engine);
  await page.clock.runFor(3900);
  const state = await page.evaluate(() => window.__GAME__!.getState());
  const locked = state.player;
  const seconds = (state.engine.stepCount - before.stepCount) * before.fixedDeltaMs / 1000;
  expect(seconds).toBeLessThan(4);
  expect(locked.stamina).toBeCloseTo(C.player.staminaRegenPerSec * seconds, 5);
  expect(locked.isSprinting).toBe(false);
  await page.clock.runFor(150);
  expect(await page.evaluate(() => window.__GAME__!.getState().player.isSprinting)).toBe(true);
});

test('T1.2.4 — dash lasts 200 ms, rejects retrigger during cooldown and restarts after it', async ({ page }) => {
  await page.keyboard.down('KeyD'); await page.keyboard.down('ShiftLeft');
  const before = await page.evaluate(() => window.__GAME__!.getState().engine);
  await page.clock.runFor(100);
  const state = await page.evaluate(() => window.__GAME__!.getState());
  const dashing = state.player;
  const seconds = (state.engine.stepCount - before.stepCount) * before.fixedDeltaMs / 1000;
  expect(seconds).toBeGreaterThan(.07); expect(seconds).toBeLessThan(.14);
  expect(dashing.isDashing).toBe(true);
  expect(dashing.x - 20.5).toBeCloseTo(C.player.sprintSpeed * 1.45 * seconds, 5);
  await page.clock.runFor(150);
  expect(await page.evaluate(() => window.__GAME__!.getState().player.isDashing)).toBe(false);
  await page.keyboard.up('ShiftLeft'); await page.keyboard.down('ShiftLeft');
  await page.clock.runFor(650);
  expect(await page.evaluate(() => window.__GAME__!.getState().player.isDashing)).toBe(false);
  await page.clock.runFor(150);
  expect(await page.evaluate(() => window.__GAME__!.getState().player.isDashing)).toBe(true);
});

test('T1.2.5 — jumps steer in flight and land after 500 ms', async ({ page }) => {
  await page.keyboard.press('Space'); await page.keyboard.down('KeyW');
  await page.clock.runFor(200);
  const north = await page.evaluate(() => window.__GAME__!.getState().player);
  expect(north.isJumping).toBe(true); expect(north.y).toBeLessThan(20.5);
  await page.keyboard.up('KeyW'); await page.keyboard.down('KeyD');
  await page.clock.runFor(200);
  const east = await page.evaluate(() => window.__GAME__!.getState().player);
  expect(east.isJumping).toBe(true); expect(east.x).toBeGreaterThan(north.x); expect(east.y).toBe(north.y);
  await page.clock.runFor(100);
  expect(await page.evaluate(() => window.__GAME__!.getState().player.isJumping)).toBe(false);
});

test('T1.2.6 — solid border stops the physical footbox at contact', async ({ page }) => {
  await loadBorderWorld(page);
  await page.evaluate(() => window.__GAME__!.setPlayerPosition(1.5, 2.5));
  await page.keyboard.down('KeyA'); await page.clock.runFor(400);
  const box = await page.evaluate(() => window.__GAME__!.getGameplayDebug()!.playerFootprint);
  expect(box.minX).toBeGreaterThanOrEqual(1 - 1e-8); expect(box.minX).toBeLessThan(1.01);
  const stopped = await page.evaluate(() => window.__GAME__!.getState().player.x);
  await page.clock.runFor(400);
  expect(await page.evaluate(() => window.__GAME__!.getState().player.x)).toBe(stopped);
});

test('T1.2.7 — water navigation slows continuous walking', async ({ page }) => {
  await page.evaluate(() => {
    const g = window.__GAME__!; g.saveGame('water-speed');
    const data = JSON.parse(localStorage.getItem('forestrpg.v2.save.water-speed')!);
    data.world.tiles.fill(11); // RIVER
    localStorage.setItem('forestrpg.v2.save.water-speed', JSON.stringify(data));
    if (!g.loadGame('water-speed')) throw new Error('Water fixture rejected');
  });
  const start = await page.evaluate(() => window.__GAME__!.getState().player.x);
  await page.keyboard.down('KeyD'); await page.clock.runFor(200);
  const end = await page.evaluate(() => window.__GAME__!.getState().player.x);
  expect(end - start).toBeGreaterThan(0);
  expect(end - start).toBeLessThan(C.player.walkSpeed * .2);
});

test('T1.2.8 — passive health and mana regenerate at controlled simulation times', async ({ page }) => {
  await page.evaluate(() => { window.__GAME__!.executeCommand('/health 5'); window.__GAME__!.executeCommand('/mana 50'); });
  const before = await page.evaluate(() => window.__GAME__!.getState().engine);
  await page.clock.runFor(1000);
  const state = await page.evaluate(() => window.__GAME__!.getState());
  const seconds = (state.engine.stepCount - before.stepCount) * before.fixedDeltaMs / 1000;
  expect(state.player.health).toBe(5);
  expect(state.player.mana).toBeCloseTo(50 + C.player.manaRegenPerSec * seconds, 5);
  await page.clock.runFor(9000);
  expect(await page.evaluate(() => window.__GAME__!.getState().player.health)).toBeGreaterThan(5);
});
