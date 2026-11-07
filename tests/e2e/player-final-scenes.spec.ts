import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

test.skip(!process.env.PLAYER_ART_FINAL, 'Opt-in final art comparison on the study server');
const cases = [
  ['S', 'tree', false],
  ['E', 'tree', false],
  ['NE', 'tree', false],
  ['S', 'rock', false],
  ['E', 'bridge', false],
  ['NE', 'tree', true],
  ['S', 'overlap', false],
] as const;
for (const width of [1280, 2560])
  for (const phase of ['candidate', 'final']) {
    test(`${phase} stable model comparison ${width}`, async ({ page }, info) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: (width * 9) / 16 });
      await page.addInitScript(() =>
        localStorage.setItem(
          'forestrpg.v2.settings',
          JSON.stringify({
            clouds: false,
            fireflies: false,
            particles: false,
            lighting: true,
            shake: false,
            tutorials: false,
            masterVolume: 0,
          }),
        ),
      );
      await page.clock.install();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`/?world=finite&debug=1&autostart=1&tutorial=0&seed=42&playerArt=${phase}`);
      await page.waitForFunction(() => !!window.__GAME__ && !!window.__RENDER_DEBUG__);
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 5000));
      const root =
        phase === 'candidate'
          ? 'artifacts/player-rework/sheets'
          : 'public/assets/images/characters/player';
      const expected = createHash('sha256')
        .update(await sharp(`${root}/idle/idle_south.png`).ensureAlpha().raw().toBuffer())
        .digest('hex');
      const digest = await page.evaluate(async () => {
        const url = '/tests/fixtures/player-study.ts';
        const { studyTextureDigest } = await import(/* @vite-ignore */ url);
        return studyTextureDigest('player_idle_south');
      });
      expect(digest).toBe(expected);
      const records = [];
      for (const [facing, scene, rain] of cases) {
        await page.evaluate(
          async ({ facing, scene, rain }) => {
            const url = '/tests/fixtures/player-study.ts';
            const { installPlayerStudy } = await import(/* @vite-ignore */ url);
            installPlayerStudy(window, facing, scene, rain);
            window.__GAME__!.setTimeScale(0);
          },
          { facing, scene, rain },
        );
        await page.clock.runFor(3000);
        const state = await page.evaluate(() => window.__GAME__!.getState());
        const sprite = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().playerSprite);
        expect(state.ui.currentMenu).toBeNull();
        expect(Math.abs(state.camera.x - state.camera.targetX)).toBeLessThan(0.001);
        expect(Math.abs(state.camera.y - state.camera.targetY)).toBeLessThan(0.001);
        expect(sprite?.frame.x).toBe(0);
        expect(sprite?.facing).toBe(facing);
        const name = `${facing}-${scene}${rain ? '-rain' : ''}`;
        records.push({ phase, width, name, state, sprite });
        await page.screenshot({ path: info.outputPath(`${name}.png`) });
      }
      await fs.writeFile(info.outputPath('metadata.json'), JSON.stringify(records, null, 2));
      expect(errors).toEqual([]);
    });
  }

test('final review controls use all directions and execute a complete combo', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/scripts/player-study/review.html');
  await expect(page.locator('#status')).toContainText('Approved remaster · S', { timeout: 30_000 });
  const game = page.frames().find((f) => f.url().includes('playerArt=approved'));
  if (!game) throw Error('Final game iframe missing');
  await expect(page.locator('#direction option')).toHaveCount(8);
  await page.selectOption('#direction', 'NW');
  await page.selectOption('#scene', 'bridge');
  const start = await game.evaluate(() => window.__GAME__!.getState().player.x);
  await page.click('#run');
  await page.waitForTimeout(950);
  const after = await game.evaluate(() => window.__GAME__!.getState());
  expect(after.player.x).toBeLessThan(start);
  expect(after.player.direction).toBe('NW');
  await page.waitForTimeout(500);
  await page.click('#combo');
  const seen = new Set<number>();
  for (let i = 0; i < 24; i++) {
    const player = await game.evaluate(() => window.__GAME__!.getState().player);
    if (player.attackDirection !== null) {
      expect(player.attackDirection).toBe('NW');
      seen.add(player.comboCount);
    }
    await page.waitForTimeout(60);
  }
  expect([...seen].sort()).toEqual([0, 1, 2]);
  await page.click('#jump');
  await page.waitForTimeout(300);
  expect(await game.evaluate(() => window.__RENDER_DEBUG__!.getInfo().playerSprite?.anim)).toBe(
    'jump',
  );
});
