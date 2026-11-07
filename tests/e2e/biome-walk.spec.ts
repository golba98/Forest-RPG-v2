import { test, expect } from '@playwright/test';
import { BiomeGeography } from '../../src/world/infinite/BiomeGeography';
import { walk } from './helpers/walk';

test.use({ video: 'on' });
const biomes = ['forest', 'meadow', 'highlands', 'wetlands', 'autumn'] as const;

test('Play opens five real biomes in one world and preserves the adventure save', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      'forestrpg.v2.settings',
      JSON.stringify({ tutorials: false, clouds: false }),
    ),
  );
  await page.goto('/?debug=1&seed=42');
  await page.getByTestId('developer-button').click();
  await page.getByRole('button', { name: 'Biomes', exact: true }).click();
  await expect(page.locator('.biome-card')).toHaveCount(5);
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLImageElement>('.biome-card img')].every(
      (i) => i.complete && i.naturalWidth > 0,
    ),
  );
  await page.screenshot({ path: info.outputPath('biome-selection.png') });
  let worldId: string | undefined;
  for (const [index, id] of biomes.entries()) {
    if (index) await page.getByRole('button', { name: 'Change Biome', exact: true }).click();
    await page.getByTestId(`explore-${id}`).click();
    await expect(page.getByTestId('biome-walk-hud')).toBeVisible({ timeout: 60000 });
    await page.waitForTimeout(250);
    const status = await page.evaluate(() => window.__GAME__!.getStreamingDebug()!);
    worldId ??= status.worldId;
    expect(status.worldId).toBe(worldId);
    expect(status.mode).toBe('biome-walk');
    expect(status.generatorVersion).toBe(16);
    expect(status.biome).toBe(index);
    expect(status.error).toBeNull();
    expect(status.residentChunks).toBeLessThanOrEqual(128);
    expect(await page.evaluate(() => window.__GAME__!.getState().world.activeEnemiesCount)).toBe(0);
    expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().placeholderSprites)).toBe(
      0,
    );
    await page.screenshot({ path: info.outputPath(`${id}.png`) });
    await info.attach(`${id}-stream-and-assets`, {
      body: JSON.stringify(
        await page.evaluate(() => ({
          stream: window.__GAME__!.getStreamingDebug(),
          render: window.__RENDER_DEBUG__!.getResidency(),
          environment: window.__RENDER_DEBUG__!.getInfo().environment,
        })),
      ),
      contentType: 'application/json',
    });
    const before = status.globalPosition;
    let moved = false;
    for (const key of ['KeyD', 'KeyS', 'KeyA', 'KeyW']) {
      await page.keyboard.down(key);
      await page.waitForTimeout(200);
      await page.keyboard.up(key);
      const after = await page.evaluate(() => window.__GAME__!.getStreamingDebug()!.globalPosition);
      if (Math.hypot(after.x - before.x, after.y - before.y) > 0.2) {
        moved = true;
        break;
      }
    }
    expect(moved, `${id} landing must allow movement`).toBe(true);
  }
  expect(await page.evaluate(() => localStorage.getItem('forestrpg.v3.slot.auto'))).toBeNull();
  await page.getByRole('button', { name: 'Return to Menu', exact: true }).click();
  await page.getByTestId('new-game-button').click();
  await page.getByTestId('create-world-button').click();
  await page.getByRole('button', { name: 'Create and Play', exact: true }).click();
  await page.waitForFunction(
    () =>
      window.__GAME__?.getState().ui.currentMenu === null &&
      window.__GAME__.getStreamingDebug()?.mode === 'adventure',
    {},
    { timeout: 60000 },
  );
  expect(await page.evaluate(() => window.__GAME__!.saveGame('auto'))).toBe(true);
  const adventure = await page.evaluate(() => window.__GAME__!.getStreamingDebug()!.globalPosition);
  await page.keyboard.press('Escape');
  await page.getByTestId('main-menu-button').click();
  await page.getByTestId('developer-button').click();
  await page.getByRole('button', { name: 'Biomes', exact: true }).click();
  await page.getByTestId('explore-forest').click();
  await expect(page.getByTestId('biome-walk-hud')).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Return to Menu', exact: true }).click();
  await page.getByTestId('new-game-button').click();
  await page.getByRole('button', { name: 'Play / Resume', exact: true }).first().click();
  await page.waitForFunction(
    () => window.__GAME__?.getStreamingDebug()?.mode === 'adventure',
    {},
    { timeout: 60000 },
  );
  expect((await page.evaluate(() => window.__GAME__!.getStreamingDebug()!)).globalPosition).toEqual(
    adventure,
  );
  expect(errors).toEqual([]);
});

test('runtime streaming reaches distant signed coordinates, unloads and reloads without terrain changes', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug=1&autostart=1&seed=42');
  await page.waitForFunction(() => !!window.__GAME__?.getStreamingDebug(), {}, { timeout: 60000 });
  await page.evaluate(() => window.__GAME__!.setTimeScale(0));
  const targets = [
    [0, 0],
    [150, 150],
    [500, 500],
    [2000, 2000],
    [10000, 10000],
    [-2000, -2000],
    [-10000, 10000],
    [1000000000, -1000000000],
  ];
  const first = new Map<string, unknown>();
  for (const [x, y] of [...targets, ...targets.slice().reverse()]) {
    await page.evaluate(
      ([x, y]) => window.__GAME__!.setGlobalPosition(x! + 0.5, y! + 0.5),
      [x!, y!],
    );
    await page.waitForTimeout(80);
    const s = await page.evaluate(() => ({
      stream: window.__GAME__!.getStreamingDebug()!,
      objects: window
        .__RENDER_DEBUG__!.getInfo()
        .worldObjects!.map((o) => ({ key: o.key, asset: o.assetId }))
        .sort((a, b) => a.key.localeCompare(b.key)),
      missing: window.__RENDER_DEBUG__!.getInfo().placeholderSprites,
    }));
    expect(Math.abs(s.stream.globalPosition.x - x!)).toBeLessThan(50);
    expect(Math.abs(s.stream.globalPosition.y - y!)).toBeLessThan(50);
    expect(s.stream.residentChunks).toBeLessThanOrEqual(128);
    expect(s.stream.error).toBeNull();
    expect(s.missing).toBe(0);
    const key = `${x},${y}`;
    if (first.has(key)) expect(s.objects).toEqual(first.get(key));
    else first.set(key, s.objects);
  }
  await page.evaluate(() => window.__GAME__!.setGlobalPosition(-10000.5, 10000.5));
  const position = await page.evaluate(() => window.__GAME__!.getStreamingDebug()!.globalPosition);
  expect(await page.evaluate(() => window.__GAME__!.saveGame('distant-walk'))).toBe(true);
  await page.reload();
  await page.waitForFunction(() => !!window.__GAME__, {}, { timeout: 60000 });
  expect(await page.evaluate(() => window.__GAME__!.loadGame('distant-walk'))).toBe(true);
  expect((await page.evaluate(() => window.__GAME__!.getStreamingDebug()!)).globalPosition).toEqual(
    position,
  );
  await page.screenshot({ path: info.outputPath('distant-reload.png') });
  expect(errors).toEqual([]);
});

test('keyboard walking crosses the former map edge and a natural biome boundary', async ({
  page,
}, info) => {
  test.setTimeout(300000);
  await page.clock.install();
  await page.addInitScript(() =>
    localStorage.setItem(
      'forestrpg.v2.settings',
      JSON.stringify({ tutorials: false, clouds: false }),
    ),
  );
  await page.goto('/?debug=1&seed=42');
  await page.getByTestId('developer-button').click();
  await page.getByRole('button', { name: 'Biomes', exact: true }).click();
  await page.getByTestId('explore-forest').click();
  await expect(page.getByTestId('biome-walk-hud')).toBeVisible({ timeout: 60000 });
  // Keep timers running while streaming prepares a diagnostic approach. A paused
  // fake clock can otherwise deadlock an in-flight cooperative preparation slice.
  // All boundary crossings below still use real keyboard input.
  await page.evaluate(() => window.__GAME__!.setGlobalPosition(140.5, 0.5));
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  expect(
    (await page.evaluate(() => window.__GAME__!.getStreamingDebug()!)).globalPosition.x,
  ).toBeLessThan(150);
  await walk(page, 24, 0);
  expect(
    (await page.evaluate(() => window.__GAME__!.getStreamingDebug()!)).globalPosition.x,
  ).toBeGreaterThan(150);
  await page.screenshot({ path: info.outputPath('past-150-on-foot.png') });
  await walk(page, -24, 0);
  expect(
    (await page.evaluate(() => window.__GAME__!.getStreamingDebug()!)).globalPosition.x,
  ).toBeLessThan(150);
  const geography = new BiomeGeography(42),
    meadow = geography.anchors.find((a) => a.biome === 1)!;
  const length = Math.hypot(meadow.x, meadow.y),
    dx = meadow.x / length,
    dy = meadow.y / length;
  let boundary = 0;
  for (let t = 30; t < length; t++)
    if (geography.sample(Math.round(dx * t), Math.round(dy * t)).biome === 1) {
      boundary = t;
      break;
    }
  expect(boundary).toBeGreaterThan(0);
  await page.clock.resume();
  await page.evaluate((p) => window.__GAME__!.setGlobalPosition(p.x, p.y), {
    x: dx * (boundary - 12) + 0.5,
    y: dy * (boundary - 12) + 0.5,
  });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  const before = await page.evaluate(() => window.__GAME__!.getStreamingDebug()!);
  expect(before.biome).not.toBe(1);
  await page.clock.runFor(32);
  await page.screenshot({ path: info.outputPath('transition-before.png') });
  await walk(page, dx * 28, dy * 28);
  const after = await page.evaluate(() => window.__GAME__!.getStreamingDebug()!);
  expect(after.biome).toBe(1);
  expect(after.worldId).toBe(before.worldId);
  expect(after.error).toBeNull();
  expect(after.residentChunks).toBeLessThanOrEqual(128);
  expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().placeholderSprites)).toBe(0);
  await page.screenshot({ path: info.outputPath('transition-after.png') });
});

test('failed biome artwork loading keeps the current world intact and allows retry', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto('/?debug=1&seed=42');
  await page.getByTestId('developer-button').click();
  await page.getByRole('button', { name: 'Biomes', exact: true }).click();
  await page.getByTestId('explore-forest').click();
  await expect(page.getByTestId('biome-walk-hud')).toBeVisible({ timeout: 60000 });
  const before = await page.evaluate(() => window.__GAME__!.getStreamingDebug()!);
  const pattern = '**/environment/shared/tree-*.png';
  await page.route(pattern, (route) => route.abort());
  await page.getByRole('button', { name: 'Change Biome', exact: true }).click();
  await page.getByTestId('explore-meadow').click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 30000 });
  const failed = await page.evaluate(() => window.__GAME__!.getStreamingDebug()!);
  expect(failed.worldId).toBe(before.worldId);
  expect(failed.origin).toEqual(before.origin);
  expect(failed.globalPosition).toEqual(before.globalPosition);
  await page.unroute(pattern);
  await page.getByTestId('change-biome-button').click();
  await page.getByTestId('explore-meadow').click();
  await expect(page.getByTestId('biome-walk-hud')).toBeVisible({ timeout: 60000 });
  expect((await page.evaluate(() => window.__GAME__!.getStreamingDebug()!)).biome).toBe(1);
  expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().placeholderSprites)).toBe(0);
});
