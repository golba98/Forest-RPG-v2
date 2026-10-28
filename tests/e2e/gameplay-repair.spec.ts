import { expect, test, type Page } from '@playwright/test';
import { PLAYER_FOOTPRINT } from '../../src/systems/EntityFootprint';

/** Save import sets up a deterministic world; movement/combat use actual browser input. */
async function fixture(page: Page, combat = false): Promise<void> {
  await page.goto('/?debug=1&autostart=1&tutorial=0&seed=123');
  await page.waitForFunction(() => !!window.__GAME__);
  await page.evaluate(
    ({ combat }) => {
      const g = window.__GAME__!;
      g.pauseSimulation();
      g.saveGame('fixture');
      const data = JSON.parse(localStorage.getItem('forestrpg.v2.save.fixture')!);
      const player = data.entities.find((e: { kind: string }) => e.kind === 'player');
      const portal = data.entities.find((e: { kind: string }) => e.kind === 'portal');
      const enemy = data.entities.find(
        (e: { kind: string }) => e.kind === 'enemy' && 'enemyType' in e,
      );
      const coin = data.entities.find(
        (e: { kind: string; pickupType?: string }) =>
          e.kind === 'pickup' && e.pickupType === 'coin',
      );
      const tiles = new Array<number>(24 * 24).fill(1);
      for (let n = 0; n < 24; n++) {
        tiles[n] = 12;
        tiles[23 * 24 + n] = 12;
        tiles[n * 24] = 12;
        tiles[n * 24 + 23] = 12;
      }
      // A 5×5 hill: cliff edges (HILL_*) around a walkable top (PLATEAU).
      for (let y = 8; y <= 12; y++)
        for (let x = 10; x <= 14; x++) {
          const n = y === 8, so = y === 12, w = x === 10, e = x === 14;
          tiles[y * 24 + x] = n && w ? 20 : n && e ? 14 : so && w ? 18 : so && e ? 16 : n ? 13 : so ? 17 : w ? 19 : e ? 15 : 21;
        }
      for (let x = 1; x < 23; x++) tiles[15 * 24 + x] = 11;
      tiles[15 * 24 + 5] = 7;
      data.world = {
        ...data.world,
        meta: { ...data.world.meta, width: 24, height: 24, isTutorial: false, seed: 123 },
        tiles,
        bridges: [],
        props: [
          { id: 1, kind: 'tree', tileX: 4, tileY: 4, solid: true },
          { id: 2, kind: 'rock_boulder', tileX: 8, tileY: 4, solid: false },
        ],
        spawn: { x: 2, y: 4 },
        portal: { x: 20, y: 20 },
        enemySpawns: [],
        pickupSpawns: [],
      };
      Object.assign(player, { x: 2.5, y: 4.5, prevX: 2.5, prevY: 4.5 });
      Object.assign(portal, {
        x: 20.5,
        y: 20.5,
        prevX: 20.5,
        prevY: 20.5,
        active: false,
        portalState: 'locked',
        roundComplete: false,
      });
      Object.assign(coin, { x: 19.5, y: 20.5, prevX: 19.5, prevY: 20.5 });
      Object.assign(enemy, {
        enemyType: 'mantis',
        x: combat ? 6.5 : 21.5,
        y: combat ? 4.5 : 21.5,
        prevX: combat ? 6.5 : 21.5,
        prevY: combat ? 4.5 : 21.5,
        health: 3,
        maxHealth: 3,
        aiState: 'idle',
        aggressive: combat,
      });
      data.entities = [player, portal, coin, enemy];
      data.elapsedMs = 0;
      data.time = 0.3;
      localStorage.setItem('forestrpg.v2.save.fixture', JSON.stringify(data));
      if (!g.loadGame('fixture')) throw new Error('Gameplay fixture save failed to load');
      g.resumeSimulation();
    },
    { combat },
  );
}
async function hold(page: Page, keys: string[], ms: number): Promise<void> {
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  for (const key of keys) await page.keyboard.up(key);
}
async function position(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(({ x, y }) => window.__GAME__!.setPlayerPosition(x, y), { x, y });
}
function intersects(
  x: number,
  y: number,
  c: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return (
    x + PLAYER_FOOTPRINT.offsetX + PLAYER_FOOTPRINT.halfWidth > c.minX + 1e-8 &&
    x + PLAYER_FOOTPRINT.offsetX - PLAYER_FOOTPRINT.halfWidth < c.maxX - 1e-8 &&
    y + PLAYER_FOOTPRINT.offsetY + PLAYER_FOOTPRINT.halfHeight > c.minY + 1e-8 &&
    y + PLAYER_FOOTPRINT.offsetY - PLAYER_FOOTPRINT.halfHeight < c.maxY - 1e-8
  );
}

test('tree approaches, diagonal rocks, every sprint cliff-edge diagonal, and bridge crossing', async ({
  page,
}, info) => {
  await fixture(page);
  for (const [x, y, key] of [
    [3.3, 4.75, 'KeyD'],
    [5.7, 4.75, 'KeyA'],
    [4.5, 3.4, 'KeyS'],
    [4.5, 5.7, 'KeyW'],
  ] as const) {
    await position(page, x, y);
    await hold(page, [key], 350);
    const state = await page.evaluate(() => window.__GAME__!.getState());
    expect(
      intersects(state.player.x, state.player.y, { minX: 4.25, minY: 4.55, maxX: 4.75, maxY: 5 }),
    ).toBe(false);
  }
  await position(page, 9.6, 5.6);
  await hold(page, ['KeyW', 'KeyA'], 250);
  let state = await page.evaluate(() => window.__GAME__!.getState());
  expect(
    intersects(state.player.x, state.player.y, { minX: 8.1, minY: 4.4, maxX: 8.9, maxY: 5 }),
  ).toBe(false);
  for (const [x, y, keys] of [
    [9.7, 9.5, ['KeyW', 'KeyD']],
    [15.3, 9.5, ['KeyW', 'KeyA']],
    [9.7, 11.5, ['KeyS', 'KeyD']],
    [15.3, 11.5, ['KeyS', 'KeyA']],
  ] as const) {
    await position(page, x, y);
    await hold(page, ['ShiftLeft', ...keys], 250);
    state = await page.evaluate(() => window.__GAME__!.getState());
    expect(
      intersects(state.player.x, state.player.y, { minX: 10, minY: 8, maxX: 15, maxY: 13 }),
    ).toBe(false);
  }
  await position(page, 5.5, 14.2);
  await hold(page, ['KeyS'], 350);
  state = await page.evaluate(() => window.__GAME__!.getState());
  expect(state.player.y).toBeGreaterThan(16);
  await page.screenshot({ path: info.outputPath('collision-and-bridge.png') });
});

test('locked portal reacts, saves completion and transitions once', async ({ page }, info) => {
  await fixture(page);
  await position(page, 20.5, 20.5);
  await expect
    .poll(() => page.evaluate(() => window.__GAME__!.getGameplayDebug()!.portalState))
    .toBe('reacting');
  await page.waitForTimeout(750);
  expect(await page.evaluate(() => window.__GAME__!.getState().world.level)).toBe(1);
  expect(await page.evaluate(() => window.__GAME__!.getGameplayDebug()!.portalState)).toBe(
    'locked',
  );
  await position(page, 17.5, 20.5);
  await page.evaluate(() => {
    window.__GAME__!.executeCommand('/kill all');
    window.__GAME__!.executeCommand('/collect all');
  });
  await expect
    .poll(() => page.evaluate(() => window.__GAME__!.getGameplayDebug()!.portalState))
    .toBe('open');
  await page.evaluate(() => {
    window.__GAME__!.saveGame('completed');
    window.__GAME__!.loadGame('completed');
  });
  expect(await page.evaluate(() => window.__GAME__!.getGameplayDebug()!.portalState)).toBe('open');
  await page.screenshot({ path: info.outputPath('portal-open.png') });
  await position(page, 20.5, 20.5);
  await expect.poll(() => page.evaluate(() => window.__GAME__!.getState().world.level)).toBe(2);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__GAME__!.getState().world.level)).toBe(2);
});

test('multiple enemies navigate around a physical tree without stacking', async ({
  page,
}, info) => {
  await fixture(page, true);
  await position(page, 2.5, 6.5);
  await page.evaluate(() => window.__GAME__!.spawnEnemy('mantis', 6.5, 4.5));
  const initial = await page.evaluate(() =>
    window.__GAME__!.getState().enemies.filter((e) => e.health > 0),
  );
  await page.waitForTimeout(900);
  const after = await page.evaluate(() =>
    window.__GAME__!.getState().enemies.filter((e) => e.health > 0),
  );
  expect(after).toHaveLength(2);
  expect(after.every((e) => e.x < initial[0]!.x)).toBe(true);
  expect(Math.hypot(after[0]!.x - after[1]!.x, after[0]!.y - after[1]!.y)).toBeGreaterThan(0.1);
  for (const e of after)
    expect(intersects(e.x, e.y, { minX: 4.25, minY: 4.55, maxX: 4.75, maxY: 5 })).toBe(false);
  await page.screenshot({ path: info.outputPath('enemy-navigation.png') });
});

test('seed regeneration replaces collision diagnostics and preserves lower terrain data', async ({
  page,
}) => {
  for (const seed of [1, 123, 456, 999, 20261028]) {
    await page.goto(`/?debug=1&autostart=1&tutorial=0&seed=${seed}`);
    await page.waitForFunction(() => !!window.__GAME__);
    const state = await page.evaluate(() => window.__GAME__!.getState());
    expect(state.world.seed).toBe(seed);
    expect(await page.evaluate(() => window.__GAME__!.getGameplayDebug()!.seed)).toBe(seed);
    expect(state.world.activeEnemiesCount).toBe(13);
    await page.evaluate(() => {
      window.__GAME__!.saveGame('seed');
      window.__GAME__!.loadGame('seed');
    });
    expect(await page.evaluate(() => window.__GAME__!.getState().world.seed)).toBe(seed);
    const lower = await page.evaluate(() => {
      window.__GAME__!.saveGame('inspect');
      const d = JSON.parse(localStorage.getItem('forestrpg.v2.save.inspect')!);
      return d.world.tiles.slice(d.world.tiles.length / 2).filter((t: number) => t >= 13 && t <= 21)
        .length;
    });
    expect(lower).toBeGreaterThan(0);
  }
});
