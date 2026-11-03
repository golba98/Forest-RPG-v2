import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ForestGenerator } from '../../src/world/infinite/ForestGenerator';
import { infiniteDescriptor } from '../../src/world/infinite/InfiniteSession';
import { Tile } from '../../src/types/tiles';
import type { WorldCheckpoint } from '../../src/persistence/WorldRepository';

const ids = ['forest', 'meadow', 'highlands', 'wetlands', 'autumn'] as const;
async function choose(page: Page, id: (typeof ids)[number]) {
  await page.getByTestId(`explore-${id}`).click();
  await expect(page.getByTestId('biome-walk-hud')).toBeVisible({ timeout: 60000 });
}
async function playMenu(page: Page) {
  await page.getByTestId('developer-button').click();
  await page.getByRole('button', { name: 'Biomes', exact: true }).click();
}
test('every biome has visible high ground, walkable slopes and solid cliff faces', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      'forestrpg.v2.settings',
      JSON.stringify({ clouds: false, tutorials: false }),
    ),
  );
  await page.goto('/?debug=1&seed=42');
  await playMenu(page);
  const generator = new ForestGenerator(
    infiniteDescriptor({ seed: 42, level: 1, difficulty: 'normal' }),
  );
  for (const [index, id] of ids.entries()) {
    if (index) await page.getByRole('button', { name: 'Change Biome', exact: true }).click();
    await choose(page, id);
    await page.evaluate(() => {
      window.__GAME__!.setDaylightRatio(0.5);
      window.__RENDER_DEBUG__!.setWeatherPreview('clear');
    });
    await page.waitForTimeout(100);
    const landing = await page.evaluate(() => window.__GAME__!.getStreamingDebug()!.globalPosition);
    const slopes: { x: number; y: number; nx: number; ny: number; distance: number }[] = [];
    for (let y = Math.floor(landing.y) - 12; y <= landing.y + 12; y++)
      for (let x = Math.floor(landing.x) - 12; x <= landing.x + 12; x++) {
        if (generator.tileAt(x, y) !== Tile.STAIRS) continue;
        const raised = (dx: number, dy: number) => {
          return generator.heightAt(x + dx, y + dy) >= generator.heightAt(x, y);
        };
        const [nx, ny] = !raised(0, 1)
          ? [0, 1]
          : !raised(0, -1)
            ? [0, -1]
            : !raised(1, 0)
              ? [1, 0]
              : [-1, 0];
        slopes.push({
          x: x + 0.5,
          y: y + 0.5,
          nx: nx!,
          ny: ny!,
          distance: Math.hypot(x - landing.x, y - landing.y),
        });
      }
    slopes.sort((a, b) => a.distance - b.distance);
    expect(slopes.length, `${id} should show an accessible hill at entry`).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath(`${id}-hill.png`) });
    const slope = slopes[0]!;
    const low = { x: slope.x + slope.nx * 1.35, y: slope.y + slope.ny * 1.35 };
    await page.evaluate((p) => window.__GAME__!.setGlobalPosition(p.x, p.y), low);
    const position = await page.evaluate(
      () => window.__GAME__!.getStreamingDebug()!.globalPosition,
    );
    expect(Math.hypot(position.x - low.x, position.y - low.y)).toBeLessThan(0.05);
    const inward = slope.nx > 0 ? 'KeyA' : slope.nx < 0 ? 'KeyD' : slope.ny > 0 ? 'KeyW' : 'KeyS';
    const outward = slope.nx > 0 ? 'KeyD' : slope.nx < 0 ? 'KeyA' : slope.ny > 0 ? 'KeyS' : 'KeyW';
    await page.keyboard.down(inward);
    await page.waitForFunction(
      ({ slope }) => {
        const p = window.__GAME__!.getStreamingDebug()!.globalPosition;
        return (p.x - slope.x) * slope.nx + (p.y - slope.y) * slope.ny < -1;
      },
      { slope },
      { timeout: 3000 },
    );
    await page.keyboard.up(inward);
    const elevation = () =>
      page.evaluate(() => {
        const s = window.__GAME__!.getStreamingDebug()!;
        return window.__GAME__!.getLandscapeDebug(
          s.globalPosition.x - s.origin.x,
          s.globalPosition.y - s.origin.y,
        ).surface.elevation;
      });
    expect(await elevation(), `${id} walking onto the plateau`).toBe(
      generator.heightAt(Math.floor(slope.x), Math.floor(slope.y)),
    );
    await page.screenshot({ path: info.outputPath(`${id}-summit.png`) });
    await page.keyboard.down(outward);
    await page.waitForFunction(
      ({ slope }) => {
        const p = window.__GAME__!.getStreamingDebug()!.globalPosition;
        return (p.x - slope.x) * slope.nx + (p.y - slope.y) * slope.ny > 1.1;
      },
      { slope },
      { timeout: 3000 },
    );
    await page.keyboard.up(outward);
    expect(await elevation(), `${id} descending to low ground`).toBe(
      generator.heightAt(Math.floor(slope.x), Math.floor(slope.y)) - 1,
    );
    const wall = [-1, 1]
      .map((side) => ({ x: slope.x - slope.ny * side, y: slope.y + slope.nx * side }))
      .find((p) => {
        const t = generator.tileAt(Math.floor(p.x), Math.floor(p.y));
        return t >= Tile.HILL_N && t <= Tile.HILL_NW;
      });
    expect(wall, `${id} slope retains solid shoulders`).toBeDefined();
    await page.evaluate((p) => window.__GAME__!.setGlobalPosition(p.x, p.y), {
      x: wall!.x + slope.nx * 1.35,
      y: wall!.y + slope.ny * 1.35,
    });
    await page.keyboard.down(inward);
    await page.waitForTimeout(500);
    await page.keyboard.up(inward);
    const stopped = await page.evaluate(() => window.__GAME__!.getStreamingDebug()!.globalPosition);
    const distance = (stopped.x - wall!.x) * slope.nx + (stopped.y - wall!.y) * slope.ny;
    expect(distance, `${id} cliff blocks walking onto the summit`).toBeGreaterThan(-0.4);
    expect(distance).toBeLessThan(1.3);
    expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().placeholderSprites)).toBe(
      0,
    );
  }
  expect(errors).toEqual([]);
});

for (const legacyVersion of [14, 15] as const)
  test(`opening the new hills keeps v${legacyVersion} exploration and its saved edits available`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto('/?debug=1&seed=42');
    await playMenu(page);
    await choose(page, 'forest');
    await page.keyboard.press('Escape');
    const downloading = page.waitForEvent('download');
    await page.getByTestId('export-button').click();
    const downloaded = await downloading;
    const header = JSON.parse(
      (await readFile((await downloaded.path())!, 'utf8')).split('\n')[0]!,
    ) as { checkpoint: WorldCheckpoint };
    // Rebuild an older baseline with one explicit changed cell. Procedural
    // chunks and region pins from the new world are never reinterpreted.
    const state = header.checkpoint;
    header.checkpoint = {
      ...state,
      descriptor: { ...state.descriptor, generatorVersion: legacyVersion },
      revision: 1,
      exploration: { home: { x: 0.5, y: 0.5 }, landings: {} },
      entities: state.entities.map((e) => ({ ...e, x: 0.5, y: 0.5, prevX: 0.5, prevY: 0.5 })),
    };
    const records = [
      header,
      {
        key: '0,0',
        delta: {
          tiles: { '264': Tile.MUD },
          removed: [],
          added: [],
          entities: [],
          activated: true,
        },
      },
    ];
    const body = records.map((r) => JSON.stringify(r) + '\n').join('');
    let hash = 2166136261;
    for (let i = 0; i < body.length; i++) hash = Math.imul(hash ^ body.charCodeAt(i), 16777619);
    const archive = body + JSON.stringify({ end: 1, checksum: hash >>> 0 }) + '\n';
    await page.getByTestId('main-menu-button').click();
    const choosing = page.waitForEvent('filechooser');
    await page.getByTestId('import-button').click();
    await (
      await choosing
    ).setFiles({
      name: 'previous-walk.jsonl',
      mimeType: 'application/x-ndjson',
      buffer: Buffer.from(archive),
    });
    await expect(page.getByTestId('biome-walk-hud')).toBeVisible({ timeout: 60000 });
    const version = () =>
      page.evaluate(() => window.__GAME__!.getStreamingDebug()!.generatorVersion);
    expect(await version()).toBe(legacyVersion);
    await page.getByRole('button', { name: 'Return to Menu', exact: true }).click();
    await playMenu(page);
    await choose(page, 'forest');
    expect(await version()).toBe(16);
    await page.evaluate(() => window.__GAME__!.executeCommand('/give health 3'));
    await page.getByRole('button', { name: 'Return to Menu', exact: true }).click();
    await playMenu(page);
    await page.getByTestId(`previous-landscape-v${legacyVersion}`).click();
    await expect(page.getByTestId('biome-walk-hud')).toBeVisible({ timeout: 60000 });
    expect(await version()).toBe(legacyVersion);
    expect(
      await page.evaluate(() => {
        const s = window.__GAME__!.getStreamingDebug()!;
        return window.__GAME__!.getLandscapeDebug(8.5 - s.origin.x, 8.5 - s.origin.y).surface.tile;
      }),
    ).toBe(Tile.MUD);
    await page.getByRole('button', { name: 'Return to Menu', exact: true }).click();
    await page.reload();
    await playMenu(page);
    await choose(page, 'meadow');
    expect(await version()).toBe(16);
    expect((await page.evaluate(() => window.__GAME__!.getState().player)).potions.health).toBe(3);
  });

test('walks onto a third-tier highland crown and preserves its height after eviction', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const g = new ForestGenerator(infiniteDescriptor({ seed: 42, level: 1, difficulty: 'normal' }));
  const anchor = g.geography!.anchors.find((a) => a.biome === 2)!;
  let stair: { x: number; y: number; nx: number; ny: number } | undefined;
  for (let y = anchor.y - 96; y < anchor.y + 96 && !stair; y++)
    for (let x = anchor.x - 96; x < anchor.x + 96; x++) {
      if (g.heightAt(x, y) !== 3 || g.tileAt(x, y) !== Tile.STAIRS) continue;
      const dir = [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ].find(([nx, ny]) => g.heightAt(x + nx!, y + ny!) === 2)!;
      stair = { x: x + 0.5, y: y + 0.5, nx: dir[0]!, ny: dir[1]! };
      break;
    }
  expect(stair).toBeDefined();
  await page.addInitScript(() =>
    localStorage.setItem(
      'forestrpg.v2.settings',
      JSON.stringify({ clouds: false, tutorials: false }),
    ),
  );
  await page.goto('/?debug=1&seed=42');
  await playMenu(page);
  await choose(page, 'highlands');
  await page.evaluate(() => {
    window.__GAME__!.setDaylightRatio(0.5);
    window.__RENDER_DEBUG__!.setWeatherPreview('clear');
  });
  const s = stair!;
  const start = { x: s.x + s.nx * 1.4, y: s.y + s.ny * 1.4 };
  await page.evaluate((p) => window.__GAME__!.setGlobalPosition(p.x, p.y), start);
  const key = s.nx > 0 ? 'KeyA' : s.nx < 0 ? 'KeyD' : s.ny > 0 ? 'KeyW' : 'KeyS';
  await page.keyboard.down(key);
  await page.waitForFunction(
    (s) => {
      const p = window.__GAME__!.getStreamingDebug()!.globalPosition;
      return (p.x - s.x) * s.nx + (p.y - s.y) * s.ny < -1;
    },
    s,
    { timeout: 3000 },
  );
  await page.keyboard.up(key);
  const state = await page.evaluate(() => {
    const s = window.__GAME__!.getStreamingDebug()!;
    return {
      position: s.globalPosition,
      elevation: window.__GAME__!.getLandscapeDebug(
        s.globalPosition.x - s.origin.x,
        s.globalPosition.y - s.origin.y,
      ).surface.elevation,
    };
  });
  expect(state.elevation).toBe(3);
  await page.screenshot({ path: info.outputPath('highlands-third-tier.png') });
  await page.evaluate(() => window.__GAME__!.setGlobalPosition(-10000, 10000));
  await page.evaluate((p) => window.__GAME__!.setGlobalPosition(p.x, p.y), state.position);
  expect(
    await page.evaluate(() => {
      const s = window.__GAME__!.getStreamingDebug()!;
      return window.__GAME__!.getLandscapeDebug(
        s.globalPosition.x - s.origin.x,
        s.globalPosition.y - s.origin.y,
      ).surface.elevation;
    }),
  ).toBe(3);
  const out = s.nx > 0 ? 'KeyD' : s.nx < 0 ? 'KeyA' : s.ny > 0 ? 'KeyS' : 'KeyW';
  await page.keyboard.down(out);
  await page.waitForFunction(
    (s) => {
      const p = window.__GAME__!.getStreamingDebug()!.globalPosition;
      return (p.x - s.x) * s.nx + (p.y - s.y) * s.ny > 1.1;
    },
    s,
    { timeout: 3000 },
  );
  await page.keyboard.up(out);
  expect(
    await page.evaluate(() => {
      const s = window.__GAME__!.getStreamingDebug()!;
      return window.__GAME__!.getLandscapeDebug(
        s.globalPosition.x - s.origin.x,
        s.globalPosition.y - s.origin.y,
      ).surface.elevation;
    }),
  ).toBe(2);
});
