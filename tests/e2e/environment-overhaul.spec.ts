import { expect, test } from '@playwright/test';
import type { WorldData } from '../../src/types/world';
import { BIOME_IDS } from '../../src/world/Biomes';
import { canOccupy, hasClearPath } from '../../src/systems/CollisionSystem';
import { PLAYER_FOOTPRINT } from '../../src/systems/EntityFootprint';
import { settleEnvironment } from './helpers/environment';

test.use({ video: 'on' });

test('five live biomes, traversal, resident caches and persistent environment', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem('forestrpg.v2.settings', JSON.stringify({ clouds: false })),
  );
  await page.goto('/?world=finite&debug=1&autostart=1&seed=42');
  await page.waitForFunction(() => window.__GAME__?.getState().ui.currentMenu === null);
  await page.evaluate(() => {
    window.__GAME__!.setDaylightRatio(0.5);
    window.__RENDER_DEBUG__!.setWeatherPreview('clear');
    window.__GAME__!.saveGame('biome-qa');
  });
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('forestrpg.v2.save.biome-qa')!),
  );
  const w = saved.world as WorldData;
  expect(new Set(w.environment!.biome).size).toBe(5);
  for (let biome = 0; biome < 5; biome++) {
    const candidates = w
      .environment!.biome.map((b, i) => ({ b, i }))
      .filter(
        (v) =>
          v.b === biome &&
          w.environment!.blend[v.i] === 0 &&
          w.tiles[v.i] === 1 &&
          v.i % 150 > 12 &&
          v.i % 150 < 138 &&
          v.i / 150 > 12 &&
          v.i / 150 < 138,
      );
    const p = candidates[Math.floor(candidates.length / 2)]!;
    await page.evaluate(
      ([x, y]) => {
        window.__GAME__!.setPlayerPosition(x!, y!);
        window.__GAME__!.setPlayerHealth(7);
      },
      [(p.i % 150) + 0.5, Math.floor(p.i / 150) + 0.5],
    );
    await page.waitForTimeout(200);
    await page.waitForFunction(
      () => window.__RENDER_DEBUG__!.getInfo().environment?.ready === true,
    );
    await page.waitForTimeout(300);
    await page.screenshot({ path: info.outputPath(`${BIOME_IDS[biome]}.png`) });
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(400);
    await page.keyboard.up('KeyD');
    expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().placeholderSprites)).toBe(
      0,
    );
  }

  const env = w.environment!,
    width = w.meta.width;
  const cell = (predicate: (i: number) => boolean) =>
    env.biome.findIndex(
      (_, i) =>
        i % width > 14 &&
        i % width < width - 14 &&
        i / width > 14 &&
        i / width < w.meta.height - 14 &&
        w.tiles[i] === 1 &&
        predicate(i),
    );
  const scenes: [string, number][] = [
    ['sparse-woodland', cell((i) => env.biome[i] === 0 && env.cover[i]! < 45)],
    ['dense-forest', cell((i) => env.biome[i] === 0 && env.cover[i]! > 90)],
    ['old-growth', cell((i) => env.biome[i] === 0 && env.cover[i]! > 85 && env.moisture[i]! > 130)],
    ['forest-clearing', cell((i) => env.biome[i] === 0 && env.cover[i]! < 20)],
    ['biome-transition', cell((i) => env.blend[i]! > 100)],
    ['chunk-boundary', cell((i) => (i % width) % 16 === 0)],
    ['rolling-hills', w.tiles.findIndex((t, i) => t === 23 && i % width > 14 && i / width > 14)],
  ];
  for (const [name, index] of scenes) {
    expect(index, name).toBeGreaterThanOrEqual(0);
    await page.evaluate(
      ([x, y]) => window.__GAME__!.setPlayerPosition(x!, y!),
      [(index % width) + 0.5, Math.floor(index / width) + 0.5],
    );
    await page.waitForTimeout(200);
    await page.waitForFunction(
      () => window.__RENDER_DEBUG__!.getInfo().environment?.ready === true,
    );
    await page.waitForTimeout(300);
    await page.screenshot({ path: info.outputPath(`${name}.png`) });
    const status = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo());
    expect(status.placeholderSprites).toBe(0);
    expect(status.environment!.residentChunks).toBeLessThan(100);
  }
  const bridge = w.bridges![0]!;
  await page.evaluate(
    ([x, y]) => window.__GAME__!.setPlayerPosition(x!, y!),
    [bridge.x + 1, bridge.y + 1],
  );
  await page.waitForTimeout(600);
  await page.waitForFunction(() => window.__RENDER_DEBUG__!.getInfo().environment?.ready === true);
  await page.screenshot({ path: info.outputPath('river-crossing.png') });
  const before = await page.evaluate(() => window.__GAME__!.getState().player);
  const key = bridge.orientation === 'horizontal' ? 'KeyD' : 'KeyS';
  await page.keyboard.down(key);
  await page.waitForTimeout(700);
  await page.keyboard.up(key);
  const moved = await page.evaluate(() => window.__GAME__!.getState().player);
  expect(
    bridge.orientation === 'horizontal' ? moved.x - before.x : moved.y - before.y,
  ).toBeGreaterThan(1);
  await page.evaluate(() => window.__GAME__!.saveGame('biome-after'));
  expect(await page.evaluate(() => window.__GAME__!.loadGame('biome-after'))).toBe(true);
  const after = await page.evaluate(() => {
    window.__GAME__!.saveGame('biome-after');
    return JSON.parse(localStorage.getItem('forestrpg.v2.save.biome-after')!).world;
  });
  expect(after.environment).toEqual(w.environment);
  expect(after.tiles).toEqual(w.tiles);
  expect(errors).toEqual([]);
});

test('keyboard exploration crosses render chunks along a generated walking route', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.clock.install();
  await page.goto('/?world=finite&debug=1&autostart=1&seed=42');
  await page.waitForFunction(() => window.__GAME__?.getState().ui.currentMenu === null);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const saved = await page.evaluate(() => {
    window.__GAME__!.executeCommand('/kill all');
    window.__GAME__!.saveGame('walking-route');
    return JSON.parse(localStorage.getItem('forestrpg.v2.save.walking-route')!);
  });
  const world = saved.world as WorldData,
    width = world.meta.width;
  const start = world.spawn.y * width + world.spawn.x;
  const parents = new Map<number, number>([[start, -1]]),
    queue = [start];
  let target = -1;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!,
      x = i % width,
      y = Math.floor(i / width);
    if (Math.abs(x - world.spawn.x) + Math.abs(y - world.spawn.y) >= 50) {
      target = i;
      break;
    }
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const) {
      const nx = x + dx,
        ny = y + dy,
        ni = ny * width + nx;
      if (nx < 1 || ny < 1 || nx >= width - 1 || ny >= world.meta.height - 1 || parents.has(ni))
        continue;
      if (
        !canOccupy(world, nx + 0.5, ny + 0.5, PLAYER_FOOTPRINT) ||
        !hasClearPath(world, x + 0.5, y + 0.5, nx + 0.5, ny + 0.5, PLAYER_FOOTPRINT)
      )
        continue;
      parents.set(ni, i);
      queue.push(ni);
    }
  }
  expect(target).toBeGreaterThanOrEqual(0);
  const route: number[] = [];
  for (let i = target; i !== start; i = parents.get(i)!) route.push(i);
  route.reverse();
  const chunks = new Set<string>();
  for (const i of route) {
    const x = (i % width) + 0.5,
      y = Math.floor(i / width) + 0.5;
    for (let step = 0; step < 35; step++) {
      const p = await page.evaluate(() => window.__GAME__!.getState().player);
      if (Math.hypot(x - p.x, y - p.y) < 0.1) break;
      const key =
        Math.abs(x - p.x) > Math.abs(y - p.y)
          ? x > p.x
            ? 'KeyD'
            : 'KeyA'
          : y > p.y
            ? 'KeyS'
            : 'KeyW';
      await page.keyboard.down(key);
      await page.clock.runFor(17);
      await page.keyboard.up(key);
      await settleEnvironment(page);
    }
    const p = await page.evaluate(() => window.__GAME__!.getState().player);
    expect(Math.hypot(x - p.x, y - p.y)).toBeLessThan(0.1);
    chunks.add(`${Math.floor(p.x / 16)},${Math.floor(p.y / 16)}`);
    expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().placeholderSprites)).toBe(
      0,
    );
  }
  expect(chunks.size).toBeGreaterThanOrEqual(4);
});
