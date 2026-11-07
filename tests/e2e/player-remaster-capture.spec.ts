import { test, expect } from '@playwright/test';
import { boot } from './helpers/directional-fixture';

// Successful recordings are deliverables, unlike the ordinary failure-only videos.
test.use({ video: { mode: 'on', size: { width: 1280, height: 720 } }, viewport: { width: 1280, height: 720 } });
test('player remaster live eight-direction motion and combos', async ({ page }, info) => {
  test.setTimeout(90_000);
  const errors = await boot(page, [], {}, true);
  const label = async (text: string) => page.evaluate(text => {
    let el = document.getElementById('motion-evidence-label');
    if (!el) {
      el = document.createElement('div'); el.id = 'motion-evidence-label';
      el.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:99999;padding:8px 16px;background:#142419ee;color:white;font:16px monospace;pointer-events:none';
      document.body.append(el);
    }
    el.textContent = text;
  }, text);
  // Release diagonal keys in one browser event-loop turn. Separate protocol
  // calls can render a legitimate one-key cardinal step between key releases.
  const movementKeys = (keys: readonly string[], down: boolean) => page.evaluate(({ keys, down }) => {
    for (const code of keys) window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code.slice(3).toLowerCase(), bubbles: true }));
  }, { keys, down });
  const directions = [
    ['S', ['KeyS']], ['SE', ['KeyS', 'KeyD']], ['E', ['KeyD']],
    ['NE', ['KeyW', 'KeyD']], ['N', ['KeyW']], ['NW', ['KeyW', 'KeyA']],
    ['W', ['KeyA']], ['SW', ['KeyS', 'KeyA']],
  ] as const;
  for (const [direction, keys] of directions) {
    await label(`${direction} · walk`);
    await page.evaluate(() => { window.__GAME__!.setPlayerPosition(20.5, 20.5); window.__GAME__!.setPlayerStamina(100); });
    await movementKeys(keys, true);
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => window.__GAME__!.getState().player.direction)).toBe(direction);
    await page.screenshot({ path: info.outputPath(`${direction}-walk.png`) });
    await page.keyboard.down('ShiftLeft');
    await label(`${direction} · run`);
    await page.waitForTimeout(600);
    await page.keyboard.up('ShiftLeft');
    await movementKeys(keys, false);
    await label(`${direction} · idle`);
    await page.waitForTimeout(350);
    await page.screenshot({ path: info.outputPath(`${direction}-idle.png`) });
    for (let combo = 1; combo <= 3; combo++) {
      await label(`${direction} · punch ${combo}`);
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(160);
      expect(await page.evaluate(() => window.__GAME__!.getState().player.attackDirection)).toBe(direction);
      expect(await page.evaluate(() => window.__GAME__!.getState().player.comboCount)).toBe(combo % 3);
      await page.screenshot({ path: info.outputPath(`${direction}-combo-${combo}.png`) });
      await page.waitForTimeout(240);
    }
    await label(`${direction} · jump`);
    await page.keyboard.press('Space');
    await page.waitForTimeout(600);
  }
  expect(errors).toEqual([]);
});
