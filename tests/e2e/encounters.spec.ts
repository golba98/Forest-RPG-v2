import { expect, test, type Page } from '@playwright/test';
import { EncounterDirector } from '../../src/systems/EncounterDirector';
import { encounterFixture } from '../fixtures/encounter-world';
import { generateWorld } from '../../src/world/WorldGenerator';
import type { WorldData } from '../../src/types/world';
import { Rng } from '../../src/world/Rng';
import { siteId } from '../../src/world/EncounterPlacement';
import { nestLayout, nestBaseBounds } from '../../src/world/NestGeometry';
import { Tile } from '../../src/types/tiles';

test.setTimeout(90000);
test.use({ video: 'on' });
async function boot(page: Page, world: WorldData, introComplete = false) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      'forestrpg.v2.settings',
      JSON.stringify({ masterVolume: 0, clouds: false }),
    ),
  );
  await page.clock.install();
  await page.goto('/?debug=1&autostart=1&tutorial=0&seed=123');
  await page.waitForFunction(
    () => !!window.__RENDER_DEBUG__ && window.__GAME__?.getState().ui.currentMenu === null,
  );
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const state = new EncounterDirector(world, () => {
    throw new Error('Initial state must not spawn enemies');
  }).state;
  expect(
    await page.evaluate(
      ({ w, state, introComplete }) => {
        const g = window.__GAME__!;
        g.saveGame('encounter-fixture');
        const data = JSON.parse(localStorage.getItem('forestrpg.v2.save.encounter-fixture')!);
        delete data.runtime.moisture;
        data.world = w;
        data.runtime = { rngState: 123, encounters: state };
        data.entities = data.entities.filter(
          (e: { kind: string }) => e.kind === 'player' || e.kind === 'portal',
        );
        for (const e of data.entities) {
          const p = e.kind === 'player' ? w.spawn : w.portal;
          Object.assign(e, { x: p.x + 0.5, y: p.y + 0.5, prevX: p.x + 0.5, prevY: p.y + 0.5 });
          if (e.kind === 'player') {
            Object.assign(e.stats, {
              health: 20,
              maxHealth: 20,
              mana: 1000,
              maxMana: 1000,
              baseDamage: 1,
            });
            e.hauntedIntroComplete = introComplete;
          } else Object.assign(e, { roundComplete: false, active: false, portalState: 'locked' });
        }
        localStorage.setItem('forestrpg.v2.save.encounter-fixture', JSON.stringify(data));
        return g.loadGame('encounter-fixture');
      },
      { w: { ...world, tiles: Array.from(world.tiles) }, state, introComplete },
    ),
  ).toBe(true);
  await page.locator('canvas').evaluate((canvas) => {
    canvas.tabIndex = 0;
    canvas.focus();
  });
  await page.evaluate(() => window.__GAME__!.setDaylightRatio(0.5));
  await page.clock.runFor(300);
  return errors;
}
async function tap(page: Page, key: string) {
  await page.keyboard.down(key);
  await page.clock.runFor(20);
  await page.keyboard.up(key);
}
async function debug(page: Page) {
  return page.evaluate(() => window.__GAME__!.getGameplayDebug()!.encounters!);
}
async function atNest(page: Page, x = 15.8, y = 12.2875) {
  await page.evaluate(({ x, y }) => window.__GAME__!.setPlayerPosition(x, y), { x, y });
  await page.clock.runFor(300);
}

test('discover, warn, emerge, retreat across chunks, return, defeat and reload the boss', async ({
  page,
}, info) => {
  const errors = await boot(page, encounterFixture());
  await atNest(page);
  expect((await debug(page)).bosses[0]?.phase).toBe('dormant');
  expect(
    await page.evaluate(
      () =>
        window.__GAME__!.getState().enemies.filter((e) => e.type === 'beetle' && e.health > 0)
          .length,
    ),
  ).toBe(0);
  await page.screenshot({ path: info.outputPath('boss-nest.png') });
  await tap(page, 'KeyG');
  await page.clock.runFor(900);
  expect((await debug(page)).bosses[0]?.phase).toBe('warning');
  await page.screenshot({ path: info.outputPath('boss-warning.png') });
  await page.clock.runFor(1450);
  expect((await debug(page)).bosses[0]?.phase).toBe('emerging');
  await tap(page, 'KeyQ');
  expect((await debug(page)).bosses[0]?.health).toBe(15);
  await page.screenshot({ path: info.outputPath('boss-emerging.png') });
  await page.clock.runFor(600);
  await tap(page, 'KeyG');
  expect((await debug(page)).bosses[0]?.phase).toBe('fighting');
  expect(
    await page.evaluate(
      () =>
        window.__GAME__!.getState().enemies.filter((e) => e.type === 'beetle' && e.health > 0)
          .length,
    ),
  ).toBe(1);
  await page.screenshot({ path: info.outputPath('boss-fight.png') });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.clock.runFor(100);
  expect((await debug(page)).bosses[0]?.phase).toBe('fighting');
  await page.screenshot({ path: info.outputPath('boss-compact.png') });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.clock.runFor(100);
  await page.keyboard.down('KeyD');
  await page.clock.runFor(4000);
  await page.keyboard.up('KeyD');
  expect((await debug(page)).bosses[0]?.phase).toBe('fighting');
  await page.clock.runFor(18000);
  expect((await debug(page)).bosses[0]?.phase).toBe('dormant');
  await page.keyboard.down('KeyA');
  await page.clock.runFor(4000);
  await page.keyboard.up('KeyA');
  await page.clock.runFor(100);
  await tap(page, 'KeyG');
  await page.clock.runFor(3000);
  expect((await debug(page)).bosses[0]?.phase).toBe('fighting');
  for (let i = 0; i < 10 && (await debug(page)).bosses[0]?.phase !== 'defeated'; i++) {
    await tap(page, 'KeyQ');
    await page.clock.runFor(850);
  }
  expect((await debug(page)).bosses[0]?.phase).toBe('defeated');
  const progress = await page.evaluate(() => window.__GAME__!.getState().player.level);
  expect(progress).toBe(2);
  await page.clock.runFor(600);
  await page.screenshot({ path: info.outputPath('boss-cleared.png') });
  expect(await page.evaluate(() => window.__GAME__!.saveGame('boss-cleared'))).toBe(true);
  await page.reload();
  await page.waitForFunction(() => !!window.__GAME__);
  expect(await page.evaluate(() => window.__GAME__!.loadGame('boss-cleared'))).toBe(true);
  await page.clock.runFor(400);
  expect((await debug(page)).bosses[0]?.phase).toBe('defeated');
  expect(await page.evaluate(() => window.__GAME__!.getState().player.level)).toBe(progress);
  expect(errors).toEqual([]);
});

test('first ghost forms alone, survives dawn, clears finitely and preserves cooldown on reload', async ({
  page,
}, info) => {
  const errors = await boot(page, encounterFixture());
  await page.evaluate(() => {
    window.__GAME__!.setDaylightRatio(0.95);
    window.__GAME__!.setPlayerPosition(33, 39.2875);
  });
  await page.clock.runFor(450);
  let g = (await debug(page)).groves[0]!;
  expect(g.members).toHaveLength(1);
  expect(g.members[0]?.status).toBe('forming');
  await page.screenshot({ path: info.outputPath('ghost-intro-formation.png') });
  expect(await page.evaluate(() => window.__GAME__!.saveGame('ghost-forming'))).toBe(true);
  expect(await page.evaluate(() => window.__GAME__!.loadGame('ghost-forming'))).toBe(true);
  await page.clock.runFor(700);
  g = (await debug(page)).groves[0]!;
  expect(g.members).toHaveLength(1);
  expect(g.members[0]?.status).toBe('active');
  await page.evaluate(() => window.__GAME__!.setDaylightRatio(0.4));
  await page.clock.runFor(300);
  expect((await debug(page)).groves[0]?.members[0]?.status).toBe('active');
  const member = (await debug(page)).groves[0]!.members[0]!;
  await page.evaluate((m) => window.__GAME__!.setPlayerPosition(m.x, m.y), member);
  await page.locator('canvas').focus();
  for (let i = 0; i < 3; i++) {
    await tap(page, 'KeyQ');
    await page.clock.runFor(300);
  }
  g = (await debug(page)).groves[0]!;
  expect(g.phase).toBe('cooldown');
  expect(g.cooldownMs).toBeGreaterThan(88000);
  expect(await page.evaluate(() => window.__GAME__!.saveGame('ghost-cooldown'))).toBe(true);
  const cooldown = g.cooldownMs;
  await page.reload();
  await page.waitForFunction(() => !!window.__GAME__);
  expect(await page.evaluate(() => window.__GAME__!.loadGame('ghost-cooldown'))).toBe(true);
  expect((await debug(page)).groves[0]?.cooldownMs).toBeCloseTo(cooldown);
  await page.clock.runFor(500);
  expect((await debug(page)).groves[0]?.members[0]?.status).toBe('killed');
  expect(errors).toEqual([]);
});

// Choose a seeded rare case once; assertions still exercise the real activation flow.
const rareSeed = Array.from({ length: 100 }, (_, i) => i + 1).find((seed) =>
  Rng.derive(seed, `${siteId(seed, 1, 'grove', 0)}:visit:0`).chance(0.2),
)!;
test('later night encounters stagger three ghosts and overlapping groves respect the shared cap', async ({
  page,
}, info) => {
  const errors = await boot(page, encounterFixture(rareSeed), true);
  await page.evaluate(() => {
    window.__GAME__!.setDaylightRatio(0.95);
    window.__GAME__!.setPlayerPosition(37, 39.2875);
  });
  await page.clock.runFor(850);
  let groups = (await debug(page)).groves;
  expect(groups.filter((g) => g.phase === 'active')).toHaveLength(1);
  expect(groups.flatMap((g) => g.members)).toHaveLength(3);
  expect(groups.flatMap((g) => g.members).filter((m) => m.status === 'active')).toHaveLength(0);
  await page.screenshot({ path: info.outputPath('ghost-night-stagger.png') });
  await page.clock.runFor(300);
  groups = (await debug(page)).groves;
  expect(groups.flatMap((g) => g.members).filter((m) => m.status === 'active')).toHaveLength(1);
  await page.clock.runFor(700);
  groups = (await debug(page)).groves;
  expect(groups.flatMap((g) => g.members).filter((m) => m.status === 'active')).toHaveLength(2);
  await page.clock.runFor(700);
  groups = (await debug(page)).groves;
  expect(groups.flatMap((g) => g.members).filter((m) => m.status === 'active')).toHaveLength(3);
  expect(errors).toEqual([]);
});

test('daylight manifestation is solitary and its grove remains recognisable', async ({
  page,
}, info) => {
  const errors = await boot(page, encounterFixture(rareSeed));
  await page.evaluate(() => window.__GAME__!.setPlayerPosition(33, 39.2875));
  await page.clock.runFor(550);
  expect((await debug(page)).groves.flatMap((g) => g.members)).toHaveLength(1);
  await page.screenshot({ path: info.outputPath('ghost-daylight.png') });
  expect(errors).toEqual([]);
});

test('generated forest has a discoverable nest with its environmental approach', async ({
  page,
}, info) => {
  const world = generateWorld({ seed: 42, level: 1, difficulty: 'normal' });
  const errors = await boot(page, world),
    nest = world.encounterSites!.find((s) => s.kind === 'nest')!;
  await atNest(page, nest.x + 3.3, nest.y - 0.2125);
  expect((await debug(page)).bosses[0]?.discovered).toBe(true);
  await page.screenshot({ path: info.outputPath('boss-nest-natural.png') });
  expect(errors).toEqual([]);
});

test('a dry player above an impassable cliff cannot leave the boss stuck in combat', async ({
  page,
}) => {
  const world = encounterFixture();
  for (let y = 1; y < 63; y++)
    for (let x = 18; x < 63; x++) world.tiles[y * 64 + x] = x === 18 ? Tile.HILL_W : Tile.PLATEAU;
  const errors = await boot(page, world);
  await atNest(page);
  await tap(page, 'KeyG');
  await page.clock.runFor(3000);
  expect((await debug(page)).bosses[0]?.phase).toBe('fighting');
  await page.evaluate(() => window.__GAME__!.setPlayerPosition(22.5, 12.5));
  await page.clock.runFor(12000);
  expect((await debug(page)).bosses[0]?.phase).toBe('dormant');
  expect(errors).toEqual([]);
});

test.describe('stump nest presentation', () => {
  test('native-size nest, occluded crawl, reload and front/back depth', async ({ page }, info) => {
    const w = generateWorld({ seed: 42, level: 1, difficulty: 'normal' });
    const errors = await boot(page, w);
    const nest = w.encounterSites!.find((s) => s.kind === 'nest')!;
    await atNest(page, nest.x + 3.3, nest.y - 0.2125);
    await page.screenshot({ path: info.outputPath('stump-forest.png') });
    await tap(page, 'KeyG');
    await page.clock.runFor(1000);
    await page.screenshot({ path: info.outputPath('stump-warning.png') });
    await page.clock.runFor(1120);
    expect((await debug(page)).bosses[0]?.phase).toBe('emerging');
    await page.screenshot({ path: info.outputPath('stump-emerge-early.png') });
    expect(await page.evaluate(() => window.__GAME__!.saveGame('stump-crawl'))).toBe(true);
    expect(await page.evaluate(() => window.__GAME__!.loadGame('stump-crawl'))).toBe(true);
    await page.clock.runFor(280);
    await page.screenshot({ path: info.outputPath('stump-emerge-middle.png') });
    await page.clock.runFor(400);
    expect((await debug(page)).bosses[0]?.phase).toBe('fighting');
    await page.screenshot({ path: info.outputPath('stump-exit.png') });
    await page.clock.runFor(500);
    await atNest(page, nest.x, nest.y - 1.5);
    await page.screenshot({ path: info.outputPath('stump-player-behind.png') });
    await atNest(page, nest.x, nest.y + 0.5);
    await page.screenshot({ path: info.outputPath('stump-player-front.png') });
    await page.evaluate(() => window.__GAME__!.setDaylightRatio(0.95));
    await page.clock.runFor(200);
    await page.screenshot({ path: info.outputPath('stump-night.png') });
    expect(errors).toEqual([]);
  });
});

test('nest blocks walking and running approaches from every direction, persists and lets the bug exit', async ({
  page,
}, info) => {
  const world = generateWorld({ seed: 42, level: 1, difficulty: 'normal' });
  const errors = await boot(page, world);
  const site = world.encounterSites!.find((s) => s.kind === 'nest')!;
  const layout = nestLayout(world, site),
    bounds = nestBaseBounds(world, site);
  const cy = (layout.originY + 53) / 32 - 0.2125;
  for (const sprint of [false, true])
    for (const [dx, dy, keys] of [
      [0, -1, ['KeyW']],
      [0, 1, ['KeyS']],
      [-1, 0, ['KeyA']],
      [1, 0, ['KeyD']],
      [-1, -1, ['KeyW', 'KeyA']],
      [1, -1, ['KeyW', 'KeyD']],
      [-1, 1, ['KeyS', 'KeyA']],
      [1, 1, ['KeyS', 'KeyD']],
    ] as const) {
      await page.evaluate(({ x, y }) => window.__GAME__!.setPlayerPosition(x, y), {
        x: site.x - dx * 2.5,
        y: cy - dy * 2.5,
      });
      await page.evaluate(() => window.__GAME__!.setPlayerStamina(100));
      await page.locator('canvas').focus();
      if (sprint) await page.keyboard.down('ShiftLeft');
      for (const key of keys) await page.keyboard.down(key);
      await page.clock.runFor(150);
      expect(await page.evaluate(() => window.__GAME__!.getState().player.isSprinting)).toBe(
        sprint,
      );
      await page.clock.runFor(2050);
      for (const key of keys) await page.keyboard.up(key);
      if (sprint) await page.keyboard.up('ShiftLeft');
      const f = await page.evaluate(() => window.__GAME__!.getGameplayDebug()!.playerFootprint);
      for (const b of bounds)
        expect(
          f.maxX <= b.minX + 1e-8 ||
            f.minX >= b.maxX - 1e-8 ||
            f.maxY <= b.minY + 1e-8 ||
            f.minY >= b.maxY - 1e-8,
        ).toBe(true);
    }
  await page.evaluate((n) => window.__GAME__!.setPlayerPosition(n.x, n.y + 2), site);
  await page.keyboard.down('KeyW');
  await page.clock.runFor(1800);
  const held = await page.evaluate(() => window.__GAME__!.getState().player.y);
  await page.clock.runFor(2500);
  await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => window.__GAME__!.getState().player.y)).toBeCloseTo(held, 8);
  await page.screenshot({ path: info.outputPath('nest-front-blocked.png') });
  await page.evaluate(() =>
    window.__RENDER_DEBUG__!.setFlags({ enabled: true, colliders: true, labels: true }),
  );
  await page.clock.runFor(100);
  await page.screenshot({ path: info.outputPath('nest-front-colliders.png') });
  expect(await page.evaluate(() => window.__GAME__!.saveGame('nest-blocked'))).toBe(true);
  expect(await page.evaluate(() => window.__GAME__!.loadGame('nest-blocked'))).toBe(true);
  expect(await page.evaluate(() => window.__GAME__!.getState().player.y)).toBeCloseTo(held, 8);
  await atNest(page, site.x + 3.3, site.y - 0.2125);
  await tap(page, 'KeyG');
  await page.clock.runFor(3000);
  expect((await debug(page)).bosses[0]?.phase).toBe('fighting');
  const bossBefore = await page.evaluate(() =>
    window.__GAME__!.getState().enemies.find((e) => e.type === 'beetle')!,
  );
  await page.clock.runFor(800);
  const bossAfter = await page.evaluate(() =>
    window.__GAME__!.getState().enemies.find((e) => e.type === 'beetle')!,
  );
  expect(Math.hypot(bossAfter.x - bossBefore.x, bossAfter.y - bossBefore.y)).toBeGreaterThan(0.3);
  expect(errors).toEqual([]);
});
