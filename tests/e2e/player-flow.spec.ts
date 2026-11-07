import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { boot } from './helpers/directional-fixture';

const phase = process.env.PLAYER_FLOW_PHASE ?? 'after';
const directions = [
  ['S', ['KeyS']],
  ['SE', ['KeyS', 'KeyD']],
  ['E', ['KeyD']],
  ['NE', ['KeyW', 'KeyD']],
  ['N', ['KeyW']],
  ['NW', ['KeyW', 'KeyA']],
  ['W', ['KeyA']],
  ['SW', ['KeyS', 'KeyA']],
] as const;

test('corrected sprite delivery and stable idle appearance', async ({ page }, info) => {
  const errors = await boot(page);
  const hashes = JSON.parse(
    await fs.readFile('docs/assets/source/player-face-continuity/sheet-hashes.json', 'utf8'),
  ) as Record<string, string>;
  for (const [file, hash] of Object.entries(hashes)) {
    const response = await page.request.get(`/assets/images/characters/player/${file}`);
    expect(response.ok()).toBe(true);
    expect(
      createHash('sha256')
        .update(await response.body())
        .digest('hex'),
      file,
    ).toBe(hash);
  }
  await page.evaluate(() => window.__GAME__!.setTimeScale(0));
  await page.clock.runFor(3000);
  const sprite = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().playerSprite);
  expect(sprite?.anim).toBe('idle');
  expect(sprite?.frame.x).toBe(0);
  await page.screenshot({ path: info.outputPath('same-art-idle.png') });
  await fs.writeFile(info.outputPath('idle-metadata.json'), JSON.stringify(sprite, null, 2));
  expect(errors).toEqual([]);
});

test('eight-direction stop flow and interruption preserve gameplay', async ({ page }, info) => {
  test.setTimeout(60_000);
  const errors = await boot(page);
  const trace: unknown[] = [];
  const snapshot = async (direction: string, stage: string) => {
    const state = await page.evaluate(() => window.__GAME__!.getState());
    const sprite = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().playerSprite);
    trace.push({ direction, stage, player: state.player, sprite, camera: state.camera });
    await page.screenshot({ path: info.outputPath(`${direction}-${stage}.png`) });
    return { state, sprite };
  };
  for (const [direction, keys] of directions) {
    await page.evaluate(() => {
      window.__GAME__!.setPlayerPosition(20.5, 20.5);
      window.__GAME__!.setPlayerStamina(100);
    });
    for (const key of keys) await page.keyboard.down(key);
    await page.clock.runFor(220);
    await page.keyboard.down('ShiftLeft');
    await page.clock.runFor(180);
    const moving = await snapshot(direction, 'running');
    expect(moving.sprite?.anim).toBe('run');
    expect(moving.state.player.direction).toBe(direction);
    for (const key of [...keys, 'ShiftLeft']) await page.keyboard.up(key);
    // Input collection and fixed updates may straddle two rendered frames.
    await page.clock.runFor(64);
    const stopped = await snapshot(direction, 'stop-64ms');
    expect(stopped.sprite?.facing).toBe(direction);
    if (phase === 'before') expect(stopped.sprite?.anim).toBe('idle');
    else expect(['run', 'idle']).toContain(stopped.sprite?.anim);
    await page.clock.runFor(32);
    const middle = await snapshot(direction, 'stop-96ms');
    expect(middle.state.player.x).toBeCloseTo(stopped.state.player.x, 8);
    expect(middle.state.player.y).toBeCloseTo(stopped.state.player.y, 8);
    await page.clock.runFor(64);
    const settled = await snapshot(direction, 'stop-160ms');
    expect(settled.sprite?.anim).toBe('idle');
    expect(settled.state.player.x).toBeCloseTo(stopped.state.player.x, 8);
    expect(settled.state.player.y).toBeCloseTo(stopped.state.player.y, 8);
    for (const key of keys) await page.keyboard.down(key);
    await page.clock.runFor(100);
    for (const key of keys) await page.keyboard.up(key);
    await page.clock.runFor(34);
    await page.keyboard.press('KeyE');
    await page.clock.runFor(34);
    const attack = await snapshot(direction, 'interrupt-punch');
    expect(attack.sprite?.anim).toBe('attack');
    expect(attack.state.player.attackDirection).toBe(direction);
    await page.clock.runFor(400);
  }
  await fs.writeFile(info.outputPath('trace.json'), JSON.stringify(trace, null, 2));
  expect(errors).toEqual([]);
});
