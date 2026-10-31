import sharp from 'sharp';
import { rasterizeSoilTile } from '../../src/rendering/soilMaterial';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const phase = process.env.FOREST_SOIL_PHASE ?? 'after';

for (const seed of [1, 42, 123, 1337]) {
  test(`bank material seed ${seed}: camera cycling and saved world`, async ({ page }, info) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.clock.install();
    await page.goto(`/?debug=1&autostart=1&tutorial=0&seed=${seed}`);
    await page.waitForFunction(() => window.__GAME__?.getState().ui.currentMenu === null);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
    const scene = await page.evaluate(() => {
      const g = window.__GAME__!;
      g.setDaylightRatio(0.5);
      window.__RENDER_DEBUG__!.setWeatherPreview('clear');
      g.saveGame('soil-baseline');
      const world = JSON.parse(localStorage.getItem('forestrpg.v2.save.soil-baseline')!).world;
      const width = world.meta.width;
      const mud = (world.tiles as number[])
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => t === 22)
        .sort(
          (a, b) =>
            Math.hypot((a.i % width) - world.spawn.x, Math.floor(a.i / width) - world.spawn.y) -
            Math.hypot((b.i % width) - world.spawn.x, Math.floor(b.i / width) - world.spawn.y),
        )[0]!;
      const x = (mud.i % width) + 0.5,
        y = Math.floor(mud.i / width) + 0.5;
      g.setPlayerPosition(x, y);
      return { world, x, y };
    });
    await page.clock.runFor(350);
    await page.screenshot({ path: info.outputPath(`${phase}-${info.project.name}-seed-${seed}.png`) });
    if (seed === 42) {
      await page.evaluate(() =>
        window.__RENDER_DEBUG__!.setFlags({
          enabled: true,
          colliders: true,
          banks: true,
          chunkEdges: true,
          labels: false,
        }),
      );
      await page.clock.runFor(32);
      await page.screenshot({ path: info.outputPath(`${phase}-${info.project.name}-seed-42-colliders.png`) });
      await page.evaluate(() => window.__RENDER_DEBUG__!.setFlags({ enabled: false }));
    }
    for (const [x, y] of [
      [10, 10],
      [130, 130],
      [scene.x, scene.y],
    ]) {
      await page.evaluate(([x, y]) => window.__GAME__!.setPlayerPosition(x!, y!), [x, y]);
      await page.clock.runFor(80);
    }
    expect(await page.evaluate(() => window.__GAME__!.loadGame('soil-baseline'))).toBe(true);
    const reloaded = await page.evaluate(({ x, y }) => {
      const g = window.__GAME__!;
      g.setPlayerPosition(x, y);
      g.saveGame('soil-reloaded');
      return JSON.parse(localStorage.getItem('forestrpg.v2.save.soil-reloaded')!).world;
    }, scene);
    expect(reloaded).toEqual(scene.world);
    // Static worlds captured before this repair, rather than newly generated expectations.
    const archived = JSON.parse(
      readFileSync(`tests/fixtures/landscape/v10-seed-${seed}.json`, 'utf8'),
    );
    expect(
      await page.evaluate((world) => {
        const g = window.__GAME__!;
        const save = JSON.parse(localStorage.getItem('forestrpg.v2.save.soil-baseline')!);
        save.world = world;
        delete save.runtime.encounters;
        delete save.runtime.moisture;
        localStorage.setItem('forestrpg.v2.save.soil-archived', JSON.stringify(save));
        return g.loadGame('soil-archived');
      }, archived),
    ).toBe(true);
    const loadedArchive = await page.evaluate(({ x, y }) => {
      const g = window.__GAME__!;
      g.setPlayerPosition(x, y);
      g.saveGame('soil-archive-check');
      return JSON.parse(localStorage.getItem('forestrpg.v2.save.soil-archive-check')!).world;
    }, scene);
    expect(loadedArchive).toEqual(archived);

    await page.clock.runFor(250);
    await page.screenshot({ path: info.outputPath('bank-after-reload.png') });
    expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().placeholderSprites)).toBe(
      0,
    );
    expect(errors).toEqual([]);
    await info.attach('scene', {
      body: JSON.stringify({ seed, x: scene.x, y: scene.y }),
      contentType: 'application/json',
    });
  });
}

test('WebGL composes a bank transition across saved mud/grass cells and preserves it on reload', async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await page.addInitScript(() =>
    localStorage.setItem(
      'forestrpg.v2.settings',
      JSON.stringify({
        version: 2,
        lighting: false,
        clouds: false,
        particles: false,
        fireflies: false,
      }),
    ),
  );
  await page.clock.install();
  await page.goto('/?debug=1&autostart=1&tutorial=0&seed=42');
  await page.waitForFunction(() => window.__GAME__?.getState().ui.currentMenu === null);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
  const world = await page.evaluate(() => {
    const g = window.__GAME__!;
    g.saveGame('soil-pixels');
    const save = JSON.parse(localStorage.getItem('forestrpg.v2.save.soil-pixels')!);
    delete save.runtime.encounters;
    delete save.runtime.moisture;
    const tiles = new Array(32 * 32).fill(1);
    tiles[12 * 32 + 12] = 22;
    for (let x = 0; x < 32; x++) tiles[11 * 32 + x] = 11;
    Object.assign(save.world, {
      tiles,
      props: [],
      bridges: [],
      encounterSites: [],
      spawn: { x: 16, y: 16 },
      portal: { x: 28, y: 28 },
      enemySpawns: [],
      pickupSpawns: [],
      meta: { ...save.world.meta, width: 32, height: 32 },
    });
    save.entities = save.entities.filter((e: { kind: string }) =>
      ['player', 'portal'].includes(e.kind),
    );
    for (const e of save.entities) {
      const p = e.kind === 'player' ? save.world.spawn : save.world.portal;
      Object.assign(e, { x: p.x + 0.5, y: p.y + 0.5, prevX: p.x + 0.5, prevY: p.y + 0.5 });
    }
    localStorage.setItem('forestrpg.v2.save.soil-pixels', JSON.stringify(save));
    if (!g.loadGame('soil-pixels')) throw Error('Cannot load soil pixel fixture');
    g.setDaylightRatio(0.5);
    window.__RENDER_DEBUG__!.setWeatherPreview('clear');
    return save.world;
  });
  await page.clock.runFor(500);
  const grass = await sharp('public/assets/images/terrain/grass.png')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const check = async () => {
    const camera = (await page.evaluate(() => window.__GAME__!.getState())).camera;
    const viewport = page.viewportSize()!;
    const screen = await sharp(await page.screenshot())
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (const tx of [13, 14]) {
      const localX = tx === 12 ? 31 : 0,
        localY = 16,
        ty = 12;
      const x = Math.floor(
        (tx * 32 + localX + 0.5) * camera.zoom +
          Math.round(viewport.width / 2 - camera.x * camera.zoom),
      );
      const y = Math.floor(
        (ty * 32 + localY + 0.5) * camera.zoom +
          Math.round(viewport.height / 2 - camera.y * camera.zoom),
      );
      const dryX = Math.floor(
        (tx * 32 + 16.5) * camera.zoom + Math.round(viewport.width / 2 - camera.x * camera.zoom),
      );
      const soil = rasterizeSoilTile(world, tx, ty);
      const si = (localY * 32 + localX) * 4;
      const alpha = (soil?.[si + 3] ?? 0) / 255;
      for (let c = 0; c < 3; c++) {
        // Infer this tile's grass tint from its unaffected centre, independently of terrainArt.
        const tint =
          screen.data[(y * screen.info.width + dryX) * 4 + c]! /
          grass.data[(localY * grass.info.width + 16) * 4 + c]!;
        const base = grass.data[(localY * grass.info.width + localX) * 4 + c]! * tint;
        const expected = base * (1 - alpha) + (soil?.[si + c] ?? 0) * alpha;
        const actual = screen.data[(y * screen.info.width + x) * 4 + c]!;
        expect(
          Math.abs(actual - expected),
          `tile ${tx}, channel ${c}, actual ${actual}, expected ${expected}`,
        ).toBeLessThan(4);
      }
    }
  };
  await page.screenshot({ path: info.outputPath(`${phase}-${info.project.name}-isolated-bank.png`) });
  await check();
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 800, height: 600 },
  ]) {
    await page.setViewportSize(viewport);
    await page.clock.runFor(200);
    await check();
  }
  expect(await page.evaluate(() => window.__GAME__!.loadGame('soil-pixels'))).toBe(true);
  await page.clock.runFor(100);
  await check();
});
