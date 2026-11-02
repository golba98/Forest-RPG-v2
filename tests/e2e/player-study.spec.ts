import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import type { StudyDirection, StudyScene } from '../fixtures/player-study';

test.skip(!process.env.PLAYER_ART_STUDY, 'Opt-in artwork review server only');
const directions = [
  { facing: 'S', suffix: 'south', keys: ['KeyS'] },
  { facing: 'E', suffix: 'east', keys: ['KeyD'] },
  { facing: 'NE', suffix: 'northeast', keys: ['KeyW', 'KeyD'] },
] as const;

async function boot(page: Page, phase: string, controlled = true) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('forestrpg.v2.settings', JSON.stringify({ clouds: false, fireflies: false, particles: false, lighting: true, shake: false, tutorials: false, masterVolume: 0 })));
  if (controlled) await page.clock.install();
  const textureResponse = page.waitForResponse(r => r.request().method() === 'GET' && r.url().includes('/idle/idle_south.png'));
  await page.goto(`/?world=finite&debug=1&autostart=1&tutorial=0&seed=42&playerArt=${phase}`);
  await page.waitForFunction(() => !!window.__GAME__ && !!window.__RENDER_DEBUG__);
  const texture = await textureResponse;
  expect(new URL(texture.url()).searchParams.get('playerArt')).toBe(phase);
  if (phase === 'candidate' || phase === 'rejected') {
    const root = phase === 'candidate' ? 'artifacts/player-rework/sheets' : 'docs/assets/source/player-rework/rejected';
    const expected = createHash('sha256').update(await sharp(`${root}/idle/idle_south.png`).ensureAlpha().raw().toBuffer()).digest('hex');
    const actual = await page.evaluate(async () => {
      const url = '/tests/fixtures/player-study.ts';
      const { studyTextureDigest } = await import(/* @vite-ignore */ url);
      return studyTextureDigest('player_idle_south');
    });
    expect(actual, 'decoded Pixi pixels must match the selected artwork').toBe(expected);
  }
  if (controlled) await page.clock.pauseAt(await page.evaluate(() => Date.now() + 5000));
  return errors;
}

async function scene(page: Page, facing: StudyDirection, name: StudyScene = 'tree', rain = false, controlled = true) {
  await page.evaluate(async ({ facing, name, rain }) => {
    // Vite serves this QA-only module; it never enters a production bundle.
    const url = '/tests/fixtures/player-study.ts';
    const { installPlayerStudy } = await import(/* @vite-ignore */ url);
    installPlayerStudy(window, facing, name, rain);
  }, { facing, name, rain });
  if (controlled) {
    await page.evaluate(() => window.__GAME__!.setTimeScale(0));
    // Settle the camera while keeping the simulation pose at frame zero.
    await page.clock.runFor(3000);
  }
  else await page.waitForTimeout(150);
}

for (const width of [1280, 2560]) for (const phase of ['original', 'rejected', 'candidate']) {
  test(`${phase} matched scenes ${width}`, async ({ page }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: width * 9 / 16 });
    const errors = await boot(page, phase);
    const records = [];
    for (const d of directions) {
      for (const name of ['tree', 'rock', 'bridge', 'overlap'] as const) {
        await scene(page, d.facing, name);
        const state = await page.evaluate(() => window.__GAME__!.getState());
        expect(state.ui.currentMenu).toBeNull();
        expect(Math.abs(state.camera.x - state.camera.targetX)).toBeLessThan(.001);
        expect(Math.abs(state.camera.y - state.camera.targetY)).toBeLessThan(.001);
        const sprite = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().playerSprite);
        expect(sprite?.assetId).toBe(`player_idle_${d.suffix}`);
        expect(sprite?.facing).toBe(d.facing);
        expect(sprite?.frame.x).toBe(0);
        records.push({ phase, width, scene: name, facing: d.facing, state, sprite });
        await page.screenshot({ path: info.outputPath(`${phase}-${d.facing}-${name}-idle.png`) });
      }
      await scene(page, d.facing, 'tree', true);
      await page.screenshot({ path: info.outputPath(`${phase}-${d.facing}-rain-idle.png`) });
      await scene(page, d.facing);
      await page.evaluate(() => window.__GAME__!.setTimeScale(1));
      for (const key of d.keys) await page.keyboard.down(key);
      for (let tick = 0; tick < 40; tick++) {
        await page.clock.runFor(8);
        const pose = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().playerSprite);
        if (pose?.anim === 'walk' && pose.frame.x === 3 * 64) break;
      }
      expect((await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().playerSprite))?.frame.x).toBe(3 * 64);
      expect((await page.evaluate(() => window.__GAME__!.getState())).player.direction).toBe(d.facing);
      await page.screenshot({ path: info.outputPath(`${phase}-${d.facing}-tree-walk.png`) });
      for (const key of d.keys) await page.keyboard.up(key);
      await scene(page, d.facing);
      await page.evaluate(() => window.__GAME__!.setTimeScale(1));
      await page.keyboard.press('KeyE');
      // Explicitly sample all nine cells without relying on RAF/40ms alignment.
      for (let frame = 0; frame < 9; frame++) {
        for (let tick = 0; tick < 12; tick++) {
          const sprite = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().playerSprite);
          if (sprite?.anim === 'attack' && [40, 80, 120, 180, 220, 250, 280, 320].filter(t => sprite.animTimeMs >= t).length === frame) break;
          await page.clock.runFor(8);
        }
        const sprite = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().playerSprite);
        expect(sprite?.assetId).toBe(`player_attack_${d.suffix}`);
        expect(sprite?.frame.x).toBe(frame * 64);
        expect(await page.evaluate(() => window.__GAME__!.getState().player.attackDirection)).toBe(d.facing);
        await page.screenshot({ path: info.outputPath(`${phase}-${d.facing}-punch-${frame}.png`) });
      }
    }
    await fs.writeFile(info.outputPath('capture-metadata.json'), JSON.stringify(records, null, 2));
    expect(errors).toEqual([]);
  });
}

test('candidate native frames are actually delivered to the game', async ({ page }) => {
  await boot(page, 'candidate');
  for (const d of directions) for (const anim of ['idle', 'walk', 'attack']) {
    const url = `/assets/images/characters/player/${anim}/${anim}_${d.suffix}.png`;
    const response = await page.request.get(url, { headers: { Referer: 'http://localhost:4328/?playerArt=candidate' } });
    expect(await response.body()).toEqual(await fs.readFile(`artifacts/player-rework/sheets/${anim}/${anim}_${d.suffix}.png`));
    const m = await sharp(await response.body()).metadata();
    expect(m.height).toBe(64);
  }
});

test.describe('successful recordings', () => {
  for (const phase of ['rejected', 'candidate']) test(`${phase} live sample motion`, async ({ browser }, info) => {
    const context = await browser.newContext({ baseURL: 'http://localhost:4328', viewport: { width: 1280, height: 720 }, recordVideo: { dir: info.outputPath('motion'), size: { width: 1280, height: 720 } } });
    const page = await context.newPage();
    const video = page.video();
    try {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    const errors = await boot(page, phase, false);
    for (const d of directions) {
      await scene(page, d.facing, 'tree', false, false);
      await page.waitForTimeout(1200);
      for (const key of d.keys) await page.keyboard.down(key);
      await page.waitForTimeout(700);
      for (const key of d.keys) await page.keyboard.up(key);
      await page.waitForTimeout(300);
      await scene(page, d.facing, 'tree', false, false);
      await page.keyboard.press('KeyE'); await page.waitForTimeout(150);
      expect(await page.evaluate(() => window.__GAME__!.getState().player.attackDirection)).toBe(d.facing);
      await page.screenshot({ path: info.outputPath(`${d.facing}-impact.png`) });
      await page.waitForTimeout(700);
    }
    expect(errors).toEqual([]);
    } finally {
      await context.close();
      if (video) await fs.rename(await video.path(), info.outputPath('video.webm'));
    }
  });
});

test('playable review controls load the fixture and drive real movement/punches', async ({ page }) => {
  await page.goto('/scripts/player-study/review.html');
  await expect(page.locator('#status')).toContainText('Approved remaster · S', { timeout: 30_000 });
  const game = page.frames().find(f => f.url().includes('playerArt=approved'))!;
  await page.selectOption('#direction', 'E');
  const start = await game.evaluate(() => window.__GAME__!.getState().player.x);
  await page.click('#walk'); await page.waitForTimeout(950);
  expect(await game.evaluate(() => window.__GAME__!.getState().player.x)).toBeGreaterThan(start);
  await page.waitForTimeout(500);
  await page.click('#punch'); await page.waitForTimeout(250);
  expect(await game.evaluate(() => window.__GAME__!.getState().player.attackDirection)).toBe('E');
});
