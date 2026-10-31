import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { encounterFixture } from '../fixtures/encounter-world';
import { generateWorld } from '../../src/world/WorldGenerator';
import type { WorldData } from '../../src/types/world';

const phase = process.env.GROVE_ART_PHASE ?? 'after';
const out = `docs/qa/evidence/grove-art/${phase}`;
mkdirSync(out, { recursive: true });
async function load(page: Page, world: WorldData) {
  await page.clock.install();
  await page.goto('/?debug=1&autostart=1&tutorial=0&seed=123');
  await page.waitForFunction(() => window.__GAME__?.getState().ui.currentMenu === null);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
  const grove = world.encounterSites!.find((s) => s.kind === 'grove')!;
  expect(
    await page.evaluate(
      ({ world, grove }) => {
        const g = window.__GAME__!;
        g.saveGame('grove-art');
        const save = JSON.parse(localStorage.getItem('forestrpg.v2.save.grove-art')!);
        delete save.runtime.encounters;
        delete save.runtime.moisture;
        save.world = world;
        save.entities = save.entities.filter((e: { kind: string }) =>
          ['player', 'portal'].includes(e.kind),
        );
        for (const e of save.entities) {
          const p =
            e.kind === 'player'
              ? { x: grove.x - 2, y: grove.y }
              : { x: world.portal.x + 0.5, y: world.portal.y + 0.5 };
          Object.assign(e, { x: p.x, y: p.y, prevX: p.x, prevY: p.y });
          if (e.kind === 'player') Object.assign(e.stats, { health: 20, maxHealth: 20 });
        }
        localStorage.setItem('forestrpg.v2.save.grove-art', JSON.stringify(save));
        if (!g.loadGame('grove-art')) return false;
        g.setDaylightRatio(0.5);
        window.__RENDER_DEBUG__!.setWeatherPreview('clear');
        return true;
      },
      { world: { ...world, tiles: Array.from(world.tiles) }, grove },
    ),
  ).toBe(true);
  await page.locator('canvas').evaluate((c) => {
    c.tabIndex = 0;
    c.focus();
  });
  await page.clock.runFor(350);
  return grove;
}

test('native grove, walking, depth, camera cycling, night and reload', async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const grove = await load(page, encounterFixture());
  await page.screenshot({ path: `${out}/${info.project.name}-day.png` });
  if (phase === 'before') {
    await page.evaluate(() => window.__GAME__!.setDaylightRatio(0.95));
    await page.clock.runFor(100);
    await page.screenshot({ path: `${out}/${info.project.name}-night.png` });
    return;
  }
  const views = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().groveViews!);
  expect(views).toHaveLength(2);
  for (const v of views)
    expect(v).toMatchObject({ width: 64, height: 48, scaleX: 1, scaleY: 1, fungi: 12 });
  const savedWorld = await page.evaluate(() => {
    window.__GAME__!.saveGame('grove-state');
    return JSON.parse(localStorage.getItem('forestrpg.v2.save.grove-state')!).world;
  });
  // Gameplay positions, not artwork, remain authoritative.
  await page.keyboard.down('KeyD');
  await page.clock.runFor(650);
  await page.keyboard.up('KeyD');
  expect(await page.evaluate(() => window.__GAME__!.getState().player.x)).toBeGreaterThan(
    grove.x + 1,
  );
  for (const [name, y] of [
    ['behind', grove.y - 0.8],
    ['front', grove.y + 0.1],
  ] as const) {
    await page.evaluate(({ x, y }) => window.__GAME__!.setPlayerPosition(x, y), { x: grove.x, y });
    await page.clock.runFor(200);
    const order = await page.evaluate(() => ({
      player: window.__RENDER_DEBUG__!.getInfo().playerDepth!,
      grove: window.__RENDER_DEBUG__!.getInfo().groveViews![0]!.depth,
    }));
    expect(name === 'behind' ? order.player < order.grove : order.player > order.grove).toBe(true);
    await page.screenshot({ path: `${out}/${info.project.name}-${name}.png` });
  }
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 800, height: 600 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.clock.runFor(200);
    await page.screenshot({ path: `${out}/${info.project.name}-${viewport.width}.png` });
  }
  await page.evaluate(() => window.__GAME__!.setPlayerPosition(8, 8));
  await page.clock.runFor(300);
  await page.evaluate(({ x, y }) => window.__GAME__!.setPlayerPosition(x - 2, y), grove);
  await page.clock.runFor(300);
  for (let i = 0; i < 3; i++) {
    expect(await page.evaluate(() => window.__GAME__!.loadGame('grove-art'))).toBe(true);
    await page.clock.runFor(50);
    expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().groveViews!.length)).toBe(
      2,
    );
  }
  const loadedWorld = await page.evaluate(() => {
    window.__GAME__!.saveGame('grove-state');
    return JSON.parse(localStorage.getItem('forestrpg.v2.save.grove-state')!).world;
  });
  expect(loadedWorld).toEqual(savedWorld);
  await page.clock.runFor(200);
  expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().groveViews!.length)).toBe(2);
  await page.screenshot({ path: `${out}/${info.project.name}-reload.png` });
  await page.evaluate(() => window.__GAME__!.setDaylightRatio(0.95));
  await page.clock.runFor(100);
  await page.screenshot({ path: `${out}/${info.project.name}-night.png` });
  expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().placeholderSprites)).toBe(0);
  expect(errors).toEqual([]);
});

for (const seed of [1, 42, 123, 1337])
  test(`generated grove seed ${seed}`, async ({ page }, info) => {
    test.skip(phase === 'before');
    test.setTimeout(90000);
    const world = generateWorld({ seed, level: 1, difficulty: 'normal' });
    await load(page, world);
    await page.screenshot({ path: `${out}/${info.project.name}-seed-${seed}.png` });
    expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().placeholderSprites)).toBe(
      0,
    );
  });
