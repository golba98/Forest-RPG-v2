import { expect, test } from '@playwright/test';

test('shared landscape inspector, required access, terminal and cached-chunk/reload equivalence', async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug=1&autostart=1&tutorial=0&seed=42');
  await page.waitForFunction(() => window.__GAME__?.getState().ui.currentMenu === null);
  const initial = await page.evaluate(() => {
    window.__GAME__!.setDaylightRatio(0.5);
    window.__RENDER_DEBUG__!.setWeatherPreview('clear');
    window.__GAME__!.setPlayerPosition(69.5, 96.2875);
    return window.__GAME__!.getLandscapeDebug(70.5, 96.5, true);
  });
  expect(initial.units).toBe('tiles');
  expect(initial.generatorVersion).toBe(10);
  expect(initial.surface.elevation).toBe(1);
  expect(initial.surface.plateau?.id).toMatch(/^plateau:/);
  expect(initial.placement.hilltop.accepted).toBe(true);
  expect(initial.trace?.counts.hilltop).toEqual({ accepted: 79, relocated: 8, rejected: 0 });
  expect(initial.requiredAccess?.bridges.every((b) => b.ok)).toBe(true);
  expect(initial.requiredAccess?.nests.every((n) => n.ok)).toBe(true);
  expect(initial.requiredAccess?.objectives.every((p) => p.reachable)).toBe(true);
  await page.waitForTimeout(300);
  await page.screenshot({ path: info.outputPath('01-shared-landscape-hill.png') });
  const world = await page.evaluate(() => {
    window.__GAME__!.saveGame('landscape');
    return JSON.parse(localStorage.getItem('forestrpg.v2.save.landscape')!).world;
  });
  const bridge = world.bridges[0];
  const bx = bridge.x + (bridge.orientation === 'horizontal' ? 1.5 : 1);
  const by = bridge.y + (bridge.orientation === 'horizontal' ? 1 : 1.5);
  const water = await page.evaluate(({ x, y }) => window.__GAME__!.getLandscapeDebug(x, y), {
    x: bx,
    y: by,
  });
  expect(water.surface.kind).toBe('deck');
  expect(water.surface.water?.id).toMatch(/^water:/);
  expect(water.reservations.some((r) => r.kind === 'bridge')).toBe(true);
  for (const [x, y] of [
    [10, 10],
    [130, 130],
    [69.5, 96.2875],
  ]) {
    await page.evaluate(({ x, y }) => window.__GAME__!.setPlayerPosition(x, y), { x: x!, y: y! });
    await page.waitForTimeout(120);
    const current = await page.evaluate(() => window.__GAME__!.getLandscapeDebug(70.5, 96.5));
    expect(current.surface).toEqual(initial.surface);
    expect(current.reservations).toEqual(initial.reservations);
  }
  await page.keyboard.press('Backquote');
  const terminal = page.locator('#debug-terminal');
  await expect(terminal).toBeVisible();
  await terminal.locator('input').fill('/landscape 70.5 96.5');
  await terminal.locator('input').press('Enter');
  await expect(terminal.locator('pre')).toContainText(initial.surface.plateau!.id);
  await expect(terminal.locator('pre')).toContainText('hilltop-objects:1');
  await page.screenshot({ path: info.outputPath('02-landscape-terminal.png') });
  await terminal.locator('input').press('Escape');
  expect(await page.evaluate(() => window.__GAME__!.loadGame('landscape'))).toBe(true);
  const loaded = await page.evaluate(() => window.__GAME__!.getLandscapeDebug(70.5, 96.5));
  expect(loaded.surface).toEqual(initial.surface);
  expect(loaded.reservations).toEqual(initial.reservations);
  expect(loaded.placement).toEqual(initial.placement);
  const before = await page.evaluate(() => window.__GAME__!.getState().world);
  const rejected = await page.evaluate(() => {
    const bad = JSON.parse(localStorage.getItem('forestrpg.v2.save.landscape')!);
    bad.world.meta.generatorVersion = 11;
    localStorage.setItem('forestrpg.v2.save.landscape-future', JSON.stringify(bad));
    return window.__GAME__!.loadGame('landscape-future');
  });
  expect(rejected).toBe(false);
  expect((await page.evaluate(() => window.__GAME__!.getState().world)).seed).toBe(before.seed);
  expect(errors).toEqual([]);
  await info.attach('landscape-inspection', {
    body: JSON.stringify({ initial, water, loaded }, null, 2),
    contentType: 'application/json',
  });
});
