import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { bridgeFixture } from '../fixtures/bridge-world';
import type { Entity } from '../../src/types/entities';
import type { WorldData } from '../../src/types/world';

const phase = process.env.PLAYER_ART_PHASE ?? 'after';

// Render original pixels through the same application/scene/camera. Original
// baseline motion recordings are captured separately before integration.
async function originalStrip(anim: string, direction: string): Promise<Buffer> {
  const state = anim.startsWith('attack') ? 'attack' : anim;
  const swapped: Record<string, string> = { northeast: 'northwest', northwest: 'northeast', southeast: 'southwest', southwest: 'southeast' };
  const sourceDirection = state === 'attack' ? swapped[direction] ?? direction : direction;
  const file = `docs/assets/source/player-remaster/original/${state}/${state}_${sourceDirection}.png`;
  const m = await sharp(file).metadata();
  const oldCount = state === 'run' ? 6 : state === 'jump' ? 5 : 4;
  const newCount = state === 'idle' ? 6 : state === 'attack' ? 9 : 8;
  const scale = state === 'attack' ? .34 : 2;
  const frames = [];
  for (let column = 0; column < newCount; column++) {
    const old = Math.min(oldCount - 1, Math.floor(column * oldCount / newCount));
    const x = Math.floor(old * m.width! / oldCount), width = Math.floor((old + 1) * m.width! / oldCount) - x;
    const w = Math.round(width * scale), h = Math.round(m.height! * scale);
    let crop = sharp(file).extract({ left: x, top: 0, width, height: m.height! });
    if (state === 'run' && direction === 'southwest') crop = crop.flop();
    frames.push({ input: await crop.resize(w, h, { kernel: 'nearest' }).png().toBuffer(), left: column * 64 + 32 - Math.floor(w / 2), top: 54 - h });
  }
  return sharp({ create: { width: newCount * 64, height: 64, channels: 4, background: '#00000000' } }).composite(frames).png().toBuffer();
}

test('player art beside trees, rocks, bridges and shadows', async ({ page }, info) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  if (phase === 'before') await page.route('**/assets/images/characters/player/**/*.png', async route => {
    const match = /\/player\/(\w+)\/\w+_(\w+)\.png/.exec(route.request().url());
    if (!match) return route.continue();
    await route.fulfill({ body: await originalStrip(match[1]!, match[2]!), contentType: 'image/png' });
  });
  await page.addInitScript(() => localStorage.setItem('forestrpg.v2.settings', JSON.stringify({ clouds: false, particles: false, lighting: true, shake: false, tutorials: false })));
  await page.clock.install();
  await page.goto('/?world=finite&debug=1&autostart=1&seed=42');
  await page.waitForFunction(() => !!window.__GAME__ && !!window.__RENDER_DEBUG__);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 5000));
  const { world } = bridgeFixture();
  const props: WorldData['props'] = [
    { id: 10, kind: 'tree', tileX: 16, tileY: 14, solid: true },
    { id: 11, kind: 'tree', tileX: 13, tileY: 19, solid: true },
    { id: 12, kind: 'rock_boulder', tileX: 18, tileY: 16, solid: true },
    { id: 13, kind: 'log_horizontal', tileX: 15, tileY: 21, solid: true },
  ];
  await page.evaluate(w => {
    const g = window.__GAME__!;
    g.saveGame('player-art-scenes');
    const save = JSON.parse(localStorage.getItem('forestrpg.v2.save.player-art-scenes')!);
    save.world = w; delete save.runtime.encounters; delete save.runtime.moisture;
    save.entities = save.entities.filter((e: Entity) => e.kind === 'player' || e.kind === 'portal');
    for (const e of save.entities) { e.x = e.prevX = e.kind === 'player' ? 16.5 : 35.5; e.y = e.prevY = e.kind === 'player' ? 15.8 : 35.5; e.facing = 'S'; e.anim = 'idle'; e.animTimeMs = 0; }
    save.time = .3;
    localStorage.setItem('forestrpg.v2.save.player-art-scenes', JSON.stringify(save));
    if (!g.loadGame('player-art-scenes')) throw new Error('Cannot load player art scene');
    g.setDaylightRatio(.5);
  }, { ...world, props, tiles: Array.from(world.tiles) });
  for (const [name, x, y, time] of [
    ['tree-front', 16.5, 15.8, .5], ['tree-overlap', 15.5, 14.3, .5],
    ['rock', 18.5, 17.5, .5], ['bridge', 22, 18.8, .5],
    ['shadow', 16.5, 15.8, .02], ['log-overlap', 15.5, 21.1, .5],
  ] as const) {
    await page.evaluate(([x, y, time]) => { window.__GAME__!.setPlayerPosition(x!, y!); window.__GAME__!.setDaylightRatio(time!); }, [x, y, time]);
    await page.clock.runFor(1200);
    await page.screenshot({ path: info.outputPath(`${phase}-${name}.png`) });
    expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().placeholderSprites)).toBe(0);
  }
  expect(errors).toEqual([]);
});
