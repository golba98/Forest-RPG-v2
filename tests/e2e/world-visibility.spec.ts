import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { boot } from './helpers/directional-fixture';
import type { Entity } from '../../src/types/entities';

async function fixture(page: Page, clouds = false, sensitivity = 5) {
  const errors = await boot(page, [], {
    clouds,
    particles: false,
    lighting: false,
    hud: false,
    sensitivity,
  });
  expect(
    await page.evaluate(() => {
      const g = window.__GAME__!;
      g.saveGame('visibility-fixture');
      const data = JSON.parse(localStorage.getItem('forestrpg.v2.save.visibility-fixture')!);
      delete data.runtime.encounters;
      delete data.runtime.moisture;
      const width = 150,
        height = 150,
        tiles = Array<number>(width * height).fill(1);
      tiles[49 * width + 51] = 11;
      tiles[60 * width + 52] = 9;
      data.world = {
        ...data.world,
        meta: { ...data.world.meta, width, height, generatorVersion: 12, hilltopObjectsVersion: 1 },
        tiles,
        props: [
          { id: 900, kind: 'tree', tileX: 50, tileY: 50, solid: true },
          { id: 901, kind: 'flower_pink', tileX: 51, tileY: 60, solid: false },
          { id: 902, kind: 'rock_boulder', tileX: 54, tileY: 60, solid: true },
        ],
        bridges: [],
        encounterSites: [],
        enemySpawns: [],
        pickupSpawns: [],
        spawn: { x: 50, y: 59 },
        portal: { x: 145, y: 145 },
      };
      data.entities = data.entities.filter(
        (e: Entity) => e.kind === 'player' || e.kind === 'portal',
      );
      for (const e of data.entities) {
        e.x = e.prevX = e.kind === 'player' ? 50.5 : 145.5;
        e.y = e.prevY = e.kind === 'player' ? 59.5 : 145.5;
      }
      data.time = 0.5;
      data.elapsedMs = 0;
      localStorage.setItem('forestrpg.v2.save.visibility-fixture', JSON.stringify(data));
      return g.loadGame('visibility-fixture');
    }),
  ).toBe(true);
  await page.clock.runFor(800);
  return errors;
}

async function move(page: Page, x: number, y: number, ms = 800) {
  await page.evaluate((p) => window.__GAME__!.setPlayerPosition(p.x, p.y), { x, y });
  await page.clock.runFor(ms);
}

test('native broad tree retains actual pixels while partially outside every viewport edge', async ({
  page,
}, info) => {
  const errors = await fixture(page);
  const tree = (await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo())).worldObjects!.find(
    (r) => r.id === 900,
  )!;
  expect(tree).toMatchObject({ width: 96, height: 128 });
  const source = await sharp('public/assets/images/environment/lpc/trees-pale.png')
    .extract({ left: 160, top: 224, width: 96, height: 128 })
    .ensureAlpha()
    .raw()
    .toBuffer();
  for (const [name, x, y] of [
    ['top', 50.5, 61.25],
    ['bottom', 50.5, 36.5625],
    ['left', 70.875, 50.5],
    ['right', 29.875, 50.5],
  ] as const) {
    await move(page, x, y);
    const state = await page.evaluate(() => window.__GAME__!.getState());
    const actual = (
      await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo())
    ).worldObjects!.find((r) => r.id === 900)!;
    expect(actual.visible).toBe(true);
    const screenX = Math.round(tree.x - state.camera.x + 640),
      screenY = Math.round(tree.y - state.camera.y + 360);
    const png = await page.screenshot({ path: info.outputPath(`${name}-partial-tree.png`) });
    const pixels = await sharp(png).ensureAlpha().raw().toBuffer();
    let checked = 0;
    for (let sy = 0; sy < 128; sy++)
      for (let sx = 0; sx < 96; sx++) {
        const x = screenX + sx,
          y = screenY + sy,
          sourceOffset = (sy * 96 + sx) * 4;
        if (x < 0 || x >= 1280 || y < 0 || y >= 720 || source[sourceOffset + 3] !== 255) continue;
        const offset = (y * 1280 + x) * 4;
        expect([...pixels.subarray(offset, offset + 3)]).toEqual([
          ...source.subarray(sourceOffset, sourceOffset + 3),
        ]);
        checked++;
      }
    expect(checked).toBeGreaterThan(5);
  }
  expect(errors).toEqual([]);
});

test('eviction, revisits, mutation and save restoration retain authoritative scenery', async ({
  page,
}, info) => {
  const errors = await fixture(page);
  const before = (await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo())).worldObjects!;
  await move(page, 130, 130, 6500);
  let debug = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo());
  expect(debug.worldObjects!.find((r) => r.id === 900)?.resident).toBe(false);
  expect(debug.residency!.evictions).toBeGreaterThan(0);
  await move(page, 50.5, 59.5);
  debug = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo());
  const identity = (records: typeof before) =>
    records.map(({ key, x, y, width, height, depth, assetId }) => ({
      key,
      x,
      y,
      width,
      height,
      depth,
      assetId,
    }));
  expect(identity(debug.worldObjects!)).toEqual(identity(before));
  await move(page, 50.5, 60.5);
  await page.keyboard.down('KeyD');
  await page.clock.runFor(34);
  await page.keyboard.up('KeyD');
  await page.keyboard.press('KeyE');
  await page.clock.runFor(500);
  expect(
    (await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo())).worldObjects!.some(
      (r) => r.id === 901,
    ),
  ).toBe(false);
  expect(await page.evaluate(() => window.__GAME__!.saveGame('visibility-cut'))).toBe(true);
  await move(page, 130, 130, 6500);
  expect(await page.evaluate(() => window.__GAME__!.loadGame('visibility-cut'))).toBe(true);
  await page.clock.runFor(500);
  expect(
    (await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo())).worldObjects!.some(
      (r) => r.id === 901,
    ),
  ).toBe(false);
  await page.screenshot({ path: info.outputPath('restored-boundary.png') });
  expect(errors).toEqual([]);
});

test('continuous movement, reversals, zoom, resize and world corners remain prepared', async ({
  page,
}, info) => {
  const errors = await fixture(page, false, 10);
  await move(page, 75, 75);
  await page.evaluate(() => window.__GAME__!.executeCommand('/give speed 20'));
  for (const keys of [
    ['KeyD'],
    ['KeyS'],
    ['KeyA'],
    ['KeyW'],
    ['KeyD', 'KeyS'],
    ['KeyA', 'KeyW'],
    ['KeyA', 'KeyS'],
    ['KeyD', 'KeyW'],
  ]) {
    await page.evaluate(() => window.__GAME__!.setPlayerStamina(100));
    await page.keyboard.press('Digit2');
    await page.keyboard.down('ShiftLeft');
    for (const key of keys) await page.keyboard.down(key);
    await page.clock.runFor(2400);
    for (const key of keys) await page.keyboard.up(key);
    await page.keyboard.up('ShiftLeft');
  }
  expect(
    (await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo())).residency!.urgentMisses,
  ).toBe(0);
  for (const [width, height] of [
    [390, 844],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.clock.runFor(100);
    for (const zoom of [1, 2, 'auto'] as const) {
      await page.evaluate((z) => window.__RENDER_DEBUG__!.setZoom(z), zoom);
      await page.clock.runFor(100);
      const r = (await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo())).residency!;
      expect(r.resourceBytes! + r.stagingBytes!).toBeLessThanOrEqual(r.budgetBytes!);
    }
  }
  for (const [x, y] of [
    [1, 1],
    [149, 1],
    [149, 149],
    [1, 149],
  ])
    await move(page, x!, y!);
  await page.screenshot({ path: info.outputPath('large-viewport-corner.png') });
  expect(errors).toEqual([]);
});

test('clouds enter offscreen and keep their shadows aligned during camera movement', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors = await fixture(page, true);
  await page.screenshot({ path: info.outputPath('clouds-initial.png') });
  await page.clock.runFor(9000);
  await page.screenshot({ path: info.outputPath('clouds-drifted.png') });
  const atmosphere = (await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo())).atmosphere!;
  expect(atmosphere.births.length).toBeGreaterThan(0);
  const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  for (const birth of atmosphere.births) {
    expect(overlaps(birth.cloud, birth.guard)).toBe(false);
    expect(overlaps(birth.shadow, birth.guard)).toBe(false);
  }
  for (const formation of atmosphere.formations) {
    expect(formation.shadowX - formation.x).toBeCloseTo(70);
    expect(formation.shadowY - formation.y).toBeCloseTo(160);
  }
  await move(page, 25, 59.5, 5000);
  expect(
    (await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo())).clouds,
  ).toBeLessThanOrEqual(64);
  await page.screenshot({ path: info.outputPath('clouds-recycled.png') });
  expect(errors).toEqual([]);
});

test('two minutes of continuous keyboard movement repeatedly evicts and revisits scenery', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const errors = await fixture(page);
  await page.evaluate(() => window.__RENDER_DEBUG__!.setWeatherPreview('clear'));
  await move(page, 40.5, 40.5);
  const before = (await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo())).worldObjects!;
  // Four 50-tile circuits use the production input, movement and collision path.
  for (let lap = 0; lap < 4; lap++) {
    for (const key of ['KeyD', 'KeyS', 'KeyA', 'KeyW']) {
      await page.keyboard.down(key);
      await page.clock.runFor(8000);
      await page.keyboard.up(key);
    }
  }
  const state = await page.evaluate(() => window.__GAME__!.getState());
  expect(state.player.x).toBeCloseTo(40.5, 1);
  expect(state.player.y).toBeCloseTo(40.5, 1);
  const debug = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo());
  expect(debug.residency!.urgentMisses).toBe(0);
  expect(debug.residency!.evictions).toBeGreaterThan(0);
  expect(debug.residency!.resourceBytes! + debug.residency!.stagingBytes!).toBeLessThanOrEqual(
    debug.residency!.budgetBytes!,
  );
  expect(debug.worldObjects!.map((r) => [r.key, r.x, r.y, r.depth])).toEqual(
    before.map((r) => [r.key, r.x, r.y, r.depth]),
  );
  await page.screenshot({ path: info.outputPath('continuous-keyboard-return.png') });
  expect(errors).toEqual([]);
});

for (const seed of [1, 42, 123, 1337])
  test(`seed ${seed}: residency never changes saved world records`, async ({ page }) => {
    test.setTimeout(60000);
    await page.clock.install();
    await page.goto(`/?world=finite&debug=1&autostart=1&seed=${seed}&tutorial=0`);
    await page.waitForFunction(() => !!window.__RENDER_DEBUG__);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 5000));
    const saveWorld = () =>
      page.evaluate(() => {
        window.__GAME__!.saveGame('visibility-seed');
        return JSON.parse(localStorage.getItem('forestrpg.v2.save.visibility-seed')!).world;
      });
    const before = await saveWorld();
    for (const [x, y] of [
      [10, 10],
      [130, 130],
      [75, 75],
    ])
      await move(page, x!, y!, 5500);
    expect(await saveWorld()).toEqual(before);
    expect(await page.evaluate(() => window.__GAME__!.loadGame('visibility-seed'))).toBe(true);
    await page.clock.runFor(100);
    expect(await saveWorld()).toEqual(before);
  });
