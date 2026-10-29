import { expect, test, type Page } from '@playwright/test';
import { PLAYER_FOOTPRINT as F } from '../../src/systems/EntityFootprint';
import { propFootprint } from '../../src/world/ObjectSemantics';
import type { WorldProp } from '../../src/types/world';

async function position(page: Page, x: number, y: number) {
  await page.evaluate(({ x, y }) => window.__GAME__!.setPlayerPosition(x, y), { x, y });
  await page.waitForTimeout(150);
}
async function walk(page: Page, keys: string[], ms = 160) {
  // Deliver the whole chord before physics advances; Playwright key events
  // may otherwise straddle a frame and legitimately slide around a corner.
  await page.evaluate(() => window.__GAME__!.setTimeScale(0));
  for (const key of keys) await page.keyboard.down(key);
  await page.evaluate(() => window.__GAME__!.setTimeScale(1));
  await page.waitForTimeout(ms);
  await page.evaluate(() => window.__GAME__!.setTimeScale(0));
  for (const key of keys) await page.keyboard.up(key);
  await page.evaluate(() => window.__GAME__!.setTimeScale(1));
}

test('seed 42: hill/ground blocking, corners, depth, stair access and old-save reload', async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?debug=1&autostart=1&tutorial=0&seed=42');
  await page.waitForFunction(() => window.__GAME__?.getState().ui.currentMenu === null);
  await page.evaluate(() => {
    window.__GAME__!.setDaylightRatio(0.5);
    window.__RENDER_DEBUG__!.setWeatherPreview('clear');
  });
  const save = await page.evaluate(() => {
    window.__GAME__!.saveGame('hilltop');
    return JSON.parse(localStorage.getItem('forestrpg.v2.save.hilltop')!);
  });
  const rock: WorldProp = save.world.props.find(
    (p: WorldProp) => p.hilltop?.sourceX === 70 && p.hilltop.sourceY === 96,
  );
  expect(rock).toMatchObject({ tileX: 70, tileY: 96 });
  const b = propFootprint(rock)!;
  await position(page, 69.5, 96.2875);
  await walk(page, ['KeyD'], 450);
  let player = await page.evaluate(() => window.__GAME__!.getState().player);
  expect(player.x).toBeCloseTo(70 + b.minX - F.halfWidth);
  expect(player.isJumping).toBe(false);
  await page.screenshot({ path: info.outputPath('01-hill-blocked.png') });
  // Approach each face and each expanded corner through actual browser input.
  for (const [dx, dy] of [
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
  ]) {
    const x =
      dx === 0
        ? 70 + (b.minX + b.maxX) / 2
        : 70 + (dx! > 0 ? b.minX - F.halfWidth - 0.1 : b.maxX + F.halfWidth + 0.1);
    const y =
      dy === 0
        ? 96 + (b.minY + b.maxY) / 2 - F.offsetY
        : 96 +
          (dy! > 0
            ? b.minY - F.halfHeight - F.offsetY - 0.1
            : b.maxY + F.halfHeight - F.offsetY + 0.1);
    await position(page, x, y);
    await walk(page, [
      ...(dx ? [dx > 0 ? 'KeyD' : 'KeyA'] : []),
      ...(dy ? [dy > 0 ? 'KeyS' : 'KeyW'] : []),
    ]);
    player = await page.evaluate(() => window.__GAME__!.getState().player);
    expect(player.x).toBeCloseTo(x + dx! * 0.1, 3);
    expect(player.y).toBeCloseTo(y + dy! * 0.1, 3);
    expect(player.isJumping).toBe(false);
  }
  // A continuous keyboard-driven circuit, including the narrow southern rim.
  const left = 70 + b.minX - F.halfWidth - 0.125,
    right = 70 + b.maxX + F.halfWidth + 0.125;
  const top = 96 + b.minY - F.halfHeight - F.offsetY - 0.125,
    bottom = 96 + b.maxY + F.halfHeight - F.offsetY + 0.125;
  await position(page, left, top);
  // Slow simulation time permits precise input release at each waypoint. Physics
  // and input remain the production movement path, with no intermediate warps.
  await page.evaluate(() => window.__GAME__!.setTimeScale(0.25));
  for (const [key, axis, target, sign] of [
    ['KeyD', 'x', right, 1],
    ['KeyS', 'y', bottom, 1],
    ['KeyA', 'x', left, -1],
    ['KeyW', 'y', top, -1],
  ] as const) {
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(
        ({ axis, target, sign }) => (window.__GAME__!.getState().player[axis] - target) * sign >= 0,
        { axis, target, sign },
        { timeout: 3000 },
      );
    } finally {
      await page.keyboard.up(key);
    }
  }
  await page.evaluate(() => window.__GAME__!.setTimeScale(1));
  player = await page.evaluate(() => window.__GAME__!.getState().player);
  expect(Math.hypot(player.x - left, player.y - top)).toBeLessThan(0.1);
  expect(player.isJumping).toBe(false);
  await position(page, 70.5, 96 + b.minY - F.halfHeight - F.offsetY - 0.01);
  await page.waitForTimeout(500);
  let debug = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo());
  expect(debug.playerDepth!).toBeLessThan(debug.hilltopViews!.find((p) => p.id === rock.id)!.depth);
  await page.screenshot({ path: info.outputPath('02-player-behind.png') });
  await position(page, 70.5, 96 + b.maxY + F.halfHeight - F.offsetY + 0.01);
  await page.waitForTimeout(500);
  debug = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo());
  expect(debug.playerDepth!).toBeGreaterThan(
    debug.hilltopViews!.find((p) => p.id === rock.id)!.depth,
  );
  await page.screenshot({ path: info.outputPath('03-player-in-front.png') });
  await position(page, 86.2, 37.4875);
  await walk(page, ['KeyD'], 450);
  expect((await page.evaluate(() => window.__GAME__!.getState().player)).x).toBeCloseTo(86.88);
  await page.screenshot({ path: info.outputPath('04-ground-blocked.png') });
  // Existing seed-42 stairs: choose a south-facing flight with a clear landing.
  const { width: w, height: h } = save.world.meta;
  let stair: { x: number; y: number } | undefined;
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++) {
      const t = save.world.tiles;
      if (
        t[y * w + x] === 23 &&
        t[(y + 1) * w + x] === 1 &&
        t[(y - 1) * w + x] === 21 &&
        t[(y - 2) * w + x] === 21 &&
        (!stair || Math.hypot(x - 70, y - 96) < Math.hypot(stair.x - 70, stair.y - 96))
      )
        stair = { x, y };
    }
  expect(stair).toBeDefined();
  await position(page, stair!.x + 0.5, stair!.y + 1.5 - F.offsetY);
  await walk(page, ['KeyW'], 350);
  player = await page.evaluate(() => window.__GAME__!.getState().player);
  expect(player.y).toBeLessThan(stair!.y - 0.3);
  expect(player.isJumping).toBe(false);
  await page.screenshot({ path: info.outputPath('05-stairs-usable.png') });
  // View culling is this renderer's chunk unload/reload equivalent. Return,
  // rebuild on save load, and verify one sprite per authoritative placement.
  await position(page, 10, 10);
  await page.waitForTimeout(500);
  expect(
    (await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo())).hilltopViews!.find(
      (p) => p.id === rock.id,
    )!.visible,
  ).toBe(false);
  await position(page, 69.5, 96.2875);
  await page.waitForTimeout(500);
  const count = save.world.props.filter((p: WorldProp) => p.hilltop).length;
  expect((await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo())).hilltopViews).toHaveLength(
    count,
  );
  // Convert the generated payload to the old render-only representation and
  // place the saved player inside the former decoration.
  save.world.props = save.world.props.filter((p: WorldProp) => !p.hilltop);
  delete save.world.meta.hilltopObjectsVersion;
  save.world.meta.riverRepairVersion = 1;
  const savedPlayer = save.entities.find((e: { kind: string }) => e.kind === 'player');
  Object.assign(savedPlayer, { x: 70.5, y: 96.2875, prevX: 70.5, prevY: 96.2875 });
  savedPlayer.stats.coins = 987;
  await page.evaluate((data) => {
    localStorage.setItem('forestrpg.v2.save.hilltop-old', JSON.stringify(data));
    if (!window.__GAME__!.loadGame('hilltop-old')) throw new Error('Load failed');
    window.__GAME__!.saveGame('hilltop-converted');
  }, save);
  player = await page.evaluate(() => window.__GAME__!.getState().player);
  expect(Math.hypot(player.x - 70.5, player.y - 96.2875)).toBeLessThan(2);
  expect(player.coins).toBe(987);
  await page.waitForTimeout(500);
  await page.screenshot({ path: info.outputPath('06-old-save-recovered.png') });
  for (let i = 0; i < 3; i++) {
    expect(await page.evaluate(() => window.__GAME__!.loadGame('hilltop-converted'))).toBe(true);
    await page.waitForTimeout(100);
    debug = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo());
    expect(debug.hilltopViews).toHaveLength(count);
    expect(new Set(debug.hilltopViews!.map((p) => p.id)).size).toBe(count);
    expect(debug.propViews).toBe(save.world.props.length + count);
  }
  await info.attach('verified-positions', {
    body: JSON.stringify(
      { hill: rock, footprint: b, stair, oldSaveRecovery: player, render: debug },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  expect(errors).toEqual([]);
});
