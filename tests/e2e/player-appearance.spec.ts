import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { boot } from './helpers/directional-fixture';
const directions = [
  ['N', 'north'],
  ['NE', 'northeast'],
  ['E', 'east'],
  ['SE', 'southeast'],
  ['S', 'south'],
  ['SW', 'southwest'],
  ['W', 'west'],
  ['NW', 'northwest'],
] as const;

test('the playable character matches the approved native pixels in every direction', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const errors = await boot(page);
  await page.evaluate(() => window.__RENDER_DEBUG__!.setZoom(1));
  for (const [facing, suffix] of directions) {
    await page.evaluate((facing) => {
      const key = 'forestrpg.v2.save.directions';
      const save = JSON.parse(localStorage.getItem(key)!);
      const player = save.entities.find((e: { kind: string }) => e.kind === 'player');
      Object.assign(player, { facing, anim: 'idle', animTimeMs: 0 });
      save.elapsedMs = 0;
      localStorage.setItem(key, JSON.stringify(save));
      if (!window.__GAME__!.loadGame('directions')) throw new Error('Appearance fixture failed');
      window.__GAME__!.setTimeScale(0);
    }, facing);
    await page.clock.runFor(1000);
    const displayed = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo());
    const sprite = displayed.playerSprite!;
    expect(displayed.placeholderSprites).toBe(0);
    expect(sprite.playerPose?.upper).toEqual({ clip: 'idle', frame: 0, facing });
    expect(sprite.playerFace?.phase).toBe('open');
    expect(sprite.frame).toEqual({ x: 0, y: 0, w: 64, h: 64 });
    expect(sprite.bounds.width).toBe(64);
    expect(sprite.bounds.height).toBe(64);
    const actual = await page.screenshot({ clip: sprite.bounds });
    const reference = await sharp(
      `docs/assets/source/player-face-continuity/frames/${suffix}/idle-0.png`,
    )
      .ensureAlpha()
      .raw()
      .toBuffer();
    const pixels = await sharp(actual).ensureAlpha().raw().toBuffer();
    const mismatches: number[] = [];
    let opaque = 0;
    for (let i = 0; i < reference.length; i += 4) {
      if (reference[i + 3] !== 255) continue;
      opaque++;
      if (!reference.subarray(i, i + 3).equals(pixels.subarray(i, i + 3))) mismatches.push(i / 4);
    }
    expect(opaque).toBeGreaterThan(100);
    expect(
      mismatches,
      `${facing}: actual canvas pixels must retain approved palette and proportions`,
    ).toEqual([]);
    expect(actual).toMatchSnapshot(`${facing}.png`, { threshold: 0.05, maxDiffPixels: 0 });
    await info.attach(`${facing}-actual-player`, { body: actual, contentType: 'image/png' });
  }
  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('missing player artwork blocks startup with an explicit error', async ({ page }) => {
  await page.route('**/characters/player/idle/idle_north.png*', (route) => route.abort());
  await page.goto('/?debug=1&autostart=1&seed=42');
  await expect(page.locator('#loading-screen')).toContainText(
    'Required player artwork unavailable',
    { timeout: 30000 },
  );
  await expect(page.locator('#loading-screen')).toContainText('player_idle_north');
  await expect(page.getByTestId('new-game-button')).toBeHidden();
});
