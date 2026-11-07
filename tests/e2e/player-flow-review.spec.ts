import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

test.skip(!process.env.PLAYER_FLOW_REVIEW, 'Review-only Vite page');
test('approved viewer serves the saved character and plays connected actions', async ({
  page,
}, info) => {
  test.setTimeout(45000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#status')).toContainText('Approved character · S', { timeout: 30000 });
  await expect(page.locator('#art option')).toHaveCount(1);
  await page.selectOption('#inspect-clip', 'attack');
  await page.click('#inspect-pause');
  const before = await page.locator('#inspect-status').textContent();
  await page.click('#inspect-step');
  await expect(page.locator('#inspect-status')).not.toHaveText(before!);
  await page.selectOption('#inspect-clip', 'sequence');
  await page.selectOption('#inspect-speed', '0.25');
  await page.click('#inspect-pause');
  await page.waitForFunction(
    () => document.querySelector('#inspect-status')?.textContent?.includes('action transition'),
    {},
    { polling: 'raf', timeout: 8000 },
  );
  await page.click('#inspect-pause');
  for (const art of ['approved']) {
    const root = 'public/assets/images/characters/player';
    const expected = createHash('sha256')
      .update(await sharp(`${root}/idle/idle_south.png`).raw().toBuffer())
      .digest('hex');
    await page.selectOption('#art', art);
    await expect
      .poll(() => page.frames().some((f) => f.url().includes(`playerArt=${art}`)))
      .toBe(true);
    const game = page.frames().find((f) => f.url().includes(`playerArt=${art}`));
    if (!game) throw Error('Missing review game');
    await game.waitForFunction(() => !!window.__GAME__ && !!window.__RENDER_DEBUG__);
    const hash = await game.evaluate(async () => {
      const url = '/tests/fixtures/player-study.ts';
      const { studyTextureDigest } = await import(/* @vite-ignore */ url);
      return studyTextureDigest('player_idle_south');
    });
    expect(hash).toBe(expected);
    await expect(page.locator('#status')).not.toContainText('Loading');
    await page.click('#punch');
    await expect
      .poll(
        () =>
          game.evaluate(() => {
            const p = window.__RENDER_DEBUG__!.getInfo().playerSprite;
            return p?.anim === 'attack' && p.animTimeMs >= 60;
          }),
        { intervals: [20, 40], timeout: 2000 },
      )
      .toBe(true);
    await page.waitForTimeout(800);
  }
  await page.selectOption('#direction', 'NW');
  await page.click('#combo');
  const game = page.frames().find((f) => f.url().includes('playerArt=approved'));
  if (!game) throw Error('Missing final game iframe');
  const seen = new Set<number>();
  for (let i = 0; i < 26; i++) {
    const player = await game.evaluate(() => window.__GAME__!.getState().player);
    if (player.attackDirection !== null) {
      expect(player.attackDirection).toBe('NW');
      seen.add(player.comboCount);
    }
    await page.waitForTimeout(60);
  }
  expect([...seen].sort()).toEqual([0, 1, 2]);
  await page.click('#connected');
  let airbornePunch = false;
  for (let i = 0; i < 26; i++) {
    const flying = await game.evaluate(() => {
      const p = window.__GAME__!.getState().player;
      return p.jumpProgress > 0 && p.attackDirection !== null;
    });
    if (flying) airbornePunch = true;
    await page.waitForTimeout(40);
  }
  expect(airbornePunch).toBe(true);
  await page.screenshot({ path: info.outputPath('review.png'), fullPage: true });
  expect(errors).toEqual([]);
});
