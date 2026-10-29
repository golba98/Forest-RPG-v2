import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { bridgeFixture } from '../fixtures/bridge-world';
import { generateWorld } from '../../src/world/WorldGenerator';
import { PLAYER_FOOTPRINT } from '../../src/systems/EntityFootprint';
import type { WorldBridge } from '../../src/types/world';
import sharp from 'sharp';

async function boot(page: Page, query = 'tutorial=1'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.text().includes('missing texture')) errors.push(m.text());
  });
  await page.clock.install();
  await page.goto(`/?debug=1&autostart=1&${query}`);
  await page.waitForFunction(
    () => !!window.__RENDER_DEBUG__ && window.__GAME__?.getState().ui.currentMenu === null,
  );
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.evaluate(() => window.__GAME__!.setDaylightRatio(0.5));
  return errors;
}

async function screenshot(page: Page, testInfo: TestInfo, name: string): Promise<Buffer> {
  const body = await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  await testInfo.attach(name, { body, contentType: 'image/png' });
  return body;
}

async function traverse(page: Page, bridge: WorldBridge, cross = 1): Promise<void> {
  const horizontal = bridge.orientation === 'horizontal';
  const start = {
    x: bridge.x + (horizontal ? -0.5 : cross),
    y: bridge.y + (horizontal ? cross : -0.5) - PLAYER_FOOTPRINT.offsetY,
  };
  await page.evaluate((p) => window.__GAME__!.setPlayerPosition(p.x, p.y), start);
  await page.clock.runFor(400);
  const axis = horizontal ? 'x' : 'y',
    forward = horizontal ? 'KeyD' : 'KeyS',
    reverse = horizontal ? 'KeyA' : 'KeyW';
  const duration = Math.ceil(((bridge.span + 3) / 6.25) * 1000);
  await page.keyboard.down(forward);
  await page.clock.runFor(duration);
  await page.keyboard.up(forward);
  const end = await page.evaluate(() => window.__GAME__!.getState().player);
  expect(end[axis] - start[axis]).toBeGreaterThan(bridge.span + 2.8);
  await page.keyboard.down(reverse);
  await page.clock.runFor(duration);
  await page.keyboard.up(reverse);
  const returned = await page.evaluate(() => window.__GAME__!.getState().player);
  expect(returned[axis]).toBeCloseTo(start[axis], 0);
}

for (const orientation of ['horizontal', 'vertical'] as const) {
  for (const span of [1, 6])
    test(`${orientation} span ${span}: traversal, rail boundaries, layering and reload`, async ({
      page,
    }, testInfo) => {
      const errors = await boot(page);
      const { world, bridge } = bridgeFixture(orientation, span);
      expect(
        await page.evaluate(
          (w) => {
            window.__GAME__!.saveGame('bridge-fixture');
            const payload = JSON.parse(localStorage.getItem('forestrpg.v2.save.bridge-fixture')!);
            delete payload.runtime.encounters;
    delete payload.runtime.moisture;
    payload.world = w;
            payload.entities = payload.entities.filter(
              (e: { kind: string }) => e.kind === 'player' || e.kind === 'portal',
            );
            for (const e of payload.entities) {
              const p = e.kind === 'player' ? w.spawn : w.portal;
              e.x = e.prevX = p.x + 0.5;
              e.y = e.prevY = p.y + 0.5;
            }
            localStorage.setItem('forestrpg.v2.save.bridge-fixture', JSON.stringify(payload));
            return window.__GAME__!.loadGame('bridge-fixture');
          },
          { ...world, tiles: Array.from(world.tiles) },
        ),
      ).toBe(true);
      for (const cross of [0.42, 1, 1.58]) await traverse(page, bridge, cross);
      const horizontal = orientation === 'horizontal';
      const centre = {
        x: bridge.x + (horizontal ? (span + 2) / 2 : 1),
        y: bridge.y + (horizontal ? 1 : (span + 2) / 2) - PLAYER_FOOTPRINT.offsetY,
      };
      await page.evaluate((p) => window.__GAME__!.setPlayerPosition(p.x, p.y), centre);
      await page.clock.runFor(700);
      await screenshot(page, testInfo, `${orientation}-${span}-normal-zoom`);
      // Holding into a rail must stop the feet inside the visible deck.
      const sideways = horizontal ? 'KeyW' : 'KeyA';
      await page.keyboard.down(sideways);
      await page.clock.runFor(500);
      await page.keyboard.up(sideways);
      const edge = await page.evaluate(() => window.__GAME__!.getState().player);
      expect(horizontal ? edge.y + PLAYER_FOOTPRINT.offsetY : edge.x).toBeGreaterThan(
        (horizontal ? bridge.y : bridge.x) + 6 / 32,
      );
      await screenshot(page, testInfo, `${orientation}-${span}-near-rail`);
      expect(await page.evaluate(() => window.__GAME__!.saveGame('bridge-roundtrip'))).toBe(true);
      await page.reload();
      await page.waitForFunction(() => !!window.__GAME__);
      expect(await page.evaluate(() => window.__GAME__!.loadGame('bridge-roundtrip'))).toBe(true);
      await page.clock.runFor(200);
      const reloaded = await page.evaluate(() => {
        window.__GAME__!.saveGame('bridge-reloaded');
        return JSON.parse(localStorage.getItem('forestrpg.v2.save.bridge-reloaded')!);
      });
      expect(reloaded.world.bridges).toEqual([bridge]);
      expect(reloaded.world.tiles).toEqual(Array.from(world.tiles));
      expect(reloaded.entities.find((e: { kind: string }) => e.kind === 'player')).toMatchObject({
        x: edge.x,
        y: edge.y,
      });
      const info = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo());
      expect(info.bridges).toBe(1);
      expect(info.bridgeRailSprites).toBe(2 * (span + 2));
      expect(info.placeholderSprites).toBe(0);
      await page.keyboard.press('KeyM');
      await page.clock.runFor(100);
      const map = await screenshot(page, testInfo, `${orientation}-${span}-minimap`);
      const { data, info: image } = await sharp(map)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const viewport = page.viewportSize()!;
      const k = Math.max(1, Math.floor((Math.min(viewport.width, viewport.height) * 0.8) / 48));
      const mx = Math.floor(
        (viewport.width - 48 * k) / 2 + (bridge.x + (horizontal ? (span + 2) / 2 : 1.5)) * k,
      );
      const my = Math.floor(
        (viewport.height - 48 * k) / 2 + (bridge.y + (horizontal ? 1.5 : (span + 2) / 2)) * k,
      );
      const pixel = (my * image.width + mx) * image.channels;
      expect(Array.from(data.subarray(pixel, pixel + 3))).toEqual([0xb0, 0x74, 0x44]);
      expect(errors).toEqual([]);
    });
}

for (const seed of [1, 42, 456])
  test(`seed ${seed}: natural crossings and regeneration cleanup`, async ({ page }, testInfo) => {
    const errors = await boot(page, `tutorial=0&seed=${seed}`);
    const world = generateWorld({ seed, level: 1, difficulty: 'normal' });
    expect(world.bridges!.length).toBeGreaterThan(0);
    // Remove combat distractions while exercising the generated terrain and props.
    await page.evaluate(() => window.__GAME__!.executeCommand('/kill all'));
    for (const bridge of world.bridges!) {
      await traverse(page, bridge);
      const horizontal = bridge.orientation === 'horizontal';
      await page.evaluate((p) => window.__GAME__!.setPlayerPosition(p.x, p.y), {
        x: bridge.x + (horizontal ? (bridge.span + 2) / 2 : 1),
        y: bridge.y + (horizontal ? 1 : (bridge.span + 2) / 2) - PLAYER_FOOTPRINT.offsetY,
      });
      await page.clock.runFor(500);
      await screenshot(page, testInfo, `seed-${seed}-bridge-${bridge.id}`);
    }
    if (seed === 1) {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.clock.runFor(200);
      await screenshot(page, testInfo, 'seed-1-normal-1080p-zoom');
    }
    await page.keyboard.press('KeyP');
    await page.clock.runFor(250);
    const regenerated = await page.evaluate(() => {
      window.__GAME__!.saveGame('regenerated-bridges');
      const payload = JSON.parse(localStorage.getItem('forestrpg.v2.save.regenerated-bridges')!);
      return {
        info: window.__RENDER_DEBUG__!.getInfo(),
        bridges: payload.world.bridges as WorldBridge[],
      };
    });
    expect(regenerated.info.bridges).toBe(regenerated.bridges.length);
    expect(regenerated.info.bridgeRailSprites).toBe(
      regenerated.bridges.reduce((n, b) => n + 2 * (b.span + 2), 0),
    );
    expect(errors).toEqual([]);
  });
