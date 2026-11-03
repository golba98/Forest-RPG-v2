import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { boot } from './helpers/directional-fixture';
import { PlayerBlink } from '../../src/animation/PlayerBlink';

test('natural eyelids persist across movement, jumping, punching and pause', async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const errors = await boot(page);
  const records: unknown[] = [];
  const read = () => page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().playerSprite!);
  await page.clock.runFor(new PlayerBlink().nextChangeMs - 160);
  const seen: string[] = [];
  let paused = false,
    changedAction = false;
  for (let i = 0; i < 50; i++) {
    const s = await read();
    const face = s.playerFace!;
    expect(face).toBeTruthy();
    expect(
      face.eyes.map(([x, y, w, h]) => [x! - face.headOffset[0], y! - face.headOffset[1], w, h]),
    ).toEqual([
      [28, 33, 3, 5],
      [34, 33, 3, 5],
    ]);
    records.push(s);
    if (seen.at(-1) !== face.phase) {
      seen.push(face.phase);
      await page.screenshot({ path: info.outputPath(`blink-${face.phase}.png`) });
    }
    if (face.phase === 'closing' && !changedAction) {
      await page.keyboard.down('KeyS');
      await page.keyboard.down('ShiftLeft');
      await page.keyboard.press('Space');
      await page.keyboard.press('KeyE');
      changedAction = true;
    }
    if (face.phase === 'closed' && !paused) {
      await page.evaluate(() => window.__GAME__!.setTimeScale(0));
      await page.clock.runFor(64);
      const before = await read();
      await page.clock.runFor(1000);
      const held = await read();
      expect(held.playerFace).toEqual(before.playerFace);
      expect(held.playerPose).toEqual(before.playerPose);
      expect(held.frame).toEqual(before.frame);
      await page.evaluate(() => window.__GAME__!.setTimeScale(1));
      paused = true;
    }
    await page.clock.runFor(8);
  }
  expect(seen.slice(0, 5)).toEqual(['open', 'closing', 'closed', 'opening', 'open']);
  expect(changedAction && paused).toBe(true);
  const current = await read();
  expect(current.facing).toBe('S');
  expect(current.playerFace?.phase).toBe('open');
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyS');
  expect(errors).toEqual([]);
  await fs.writeFile(
    info.outputPath('blink-through-actions.json'),
    JSON.stringify(records, null, 2),
  );
});
