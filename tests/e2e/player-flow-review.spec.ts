import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

test.skip(!process.env.PLAYER_FLOW_REVIEW, 'Review-only Vite page');
test('review defaults to approved art and changes playback without changing pixels', async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.goto('/scripts/player-study/review.html');
  await expect(page.locator('#status')).toContainText('Approved remaster · S', { timeout: 30_000 });
  await expect(page.locator('#art option')).toHaveCount(1);
  const expected = createHash('sha256')
    .update(
      await sharp('public/assets/images/characters/player/idle/idle_south.png').raw().toBuffer(),
    )
    .digest('hex');
  for (const playback of ['before', 'after']) {
    await page.selectOption('#playback', playback);
    await expect
      .poll(() => page.frames().some((f) => f.url().includes(`playerFlow=${playback}`)))
      .toBe(true);
    const game = page.frames().find((f) => f.url().includes(`playerFlow=${playback}`));
    if (!game) throw Error('Missing game iframe');
    await game.waitForFunction(() => !!window.__GAME__ && !!window.__RENDER_DEBUG__);
    const info = await game.evaluate(async () => {
      const flowUrl = '/src/animation/PlayerPlayback.ts',
        fixtureUrl = '/tests/fixtures/player-study.ts';
      const { PLAYER_FLOW_ENABLED } = await import(/* @vite-ignore */ flowUrl);
      const { studyTextureDigest } = await import(/* @vite-ignore */ fixtureUrl);
      return { enabled: PLAYER_FLOW_ENABLED, hash: await studyTextureDigest('player_idle_south') };
    });
    expect(info.enabled).toBe(playback === 'after');
    expect(info.hash).toBe(expected);
  }
  await page.selectOption('#direction', 'NW');
  await page.click('#combo');
  const game = page.frames().find((f) => f.url().includes('playerFlow=after'));
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
});
