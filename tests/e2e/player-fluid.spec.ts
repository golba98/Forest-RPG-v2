import { test, expect } from '@playwright/test';
import { boot } from './helpers/directional-fixture';
import fs from 'node:fs/promises';
const dirs = [
  ['S', ['KeyS']],
  ['SE', ['KeyS', 'KeyD']],
  ['E', ['KeyD']],
  ['NE', ['KeyW', 'KeyD']],
  ['N', ['KeyW']],
  ['NW', ['KeyW', 'KeyA']],
  ['W', ['KeyA']],
  ['SW', ['KeyS', 'KeyA']],
] as const;
for (const [direction, keys] of dirs)
  test(`${direction} connected locomotion jumping attacks and landing`, async ({ page }, info) => {
    const errors = await boot(page);
    const trace: unknown[] = [];
    const held = (keys: readonly string[], down: boolean) =>
      page.evaluate(
        ({ keys, down }) => {
          for (const code of keys)
            window.dispatchEvent(
              new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }),
            );
        },
        { keys, down },
      );
    const snap = async (label: string) => {
      const result = await page.evaluate(() => ({
        state: window.__GAME__!.getState().player,
        sprite: window.__RENDER_DEBUG__!.getInfo().playerSprite,
      }));
      trace.push({ label, ...result });
      expect(result.sprite?.playerPose).toBeTruthy();
      await page.screenshot({ path: info.outputPath(label + '.png') });
      return result;
    };
    await held(keys, true);
    await page.clock.runFor(220);
    await snap('walk');
    await held(['ShiftLeft'], true);
    await page.clock.runFor(180);
    await snap('run');
    await page.keyboard.press('Space');
    await page.clock.runFor(100);
    await page.keyboard.press('KeyE');
    await page.clock.runFor(140);
    const air = await snap('air-punch');
    expect(air.state.attackDirection).toBe(direction);
    expect(air.sprite?.playerPose?.lower).toEqual(air.sprite?.playerPose?.upper);
    expect(air.sprite?.playerPose?.lower.frame).toBeGreaterThan(2);
    expect(air.sprite?.playerPose?.upper.clip).toBe('attack');
    expect(air.sprite?.playerPose?.upper.facing).toBe(direction);
    await page.clock.runFor(320);
    await snap('landing');
    await page.clock.runFor(160);
    for (let stage = 0; stage < 3; stage++) {
      await page.evaluate(() => window.__GAME__!.setPlayerStamina(100));
      await page.keyboard.press('KeyE');
      await page.clock.runFor(140);
      const s = await snap('combo-' + stage);
      expect(s.state.attackDirection).toBe(direction);
      expect(s.sprite?.playerPose?.upper.facing).toBe(direction);
      await page.clock.runFor(260);
    }
    await held([...keys, 'ShiftLeft'], false);
    await page.clock.runFor(180);
    const stop = await snap('settled');
    expect(stop.sprite?.playerPose?.lower.clip).toBe('idle');
    await page.evaluate(() => window.__GAME__!.setTimeScale(0));
    await page.clock.runFor(200);
    const paused = await page.evaluate(
      () => window.__RENDER_DEBUG__!.getInfo().playerSprite?.playerPose,
    );
    await page.clock.runFor(1000);
    expect(
      await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().playerSprite?.playerPose),
    ).toEqual(paused);
    expect(errors).toEqual([]);
    await fs.writeFile(info.outputPath('trace.json'), JSON.stringify(trace, null, 2));
  });
