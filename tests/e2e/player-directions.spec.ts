import { expect, test, type Page, type TestInfo } from '@playwright/test';
import sharp from 'sharp';
import type { Entity, EnemyEntity, PlayerEntity, PortalEntity } from '../../src/types/entities';
import type { WorldData } from '../../src/types/world';

// Reviewed against the actual PNGs, independently of AnimationDefs. Diagonal
// punch filenames face horizontally opposite the compass direction they draw.
const directions = [
  { facing: 'N', keys: ['KeyW'], dx: 0, dy: -1, art: 'north', punch: 'north' },
  { facing: 'NE', keys: ['KeyW', 'KeyD'], dx: 1, dy: -1, art: 'northeast', punch: 'northwest' },
  { facing: 'E', keys: ['KeyD'], dx: 1, dy: 0, art: 'east', punch: 'east' },
  { facing: 'SE', keys: ['KeyS', 'KeyD'], dx: 1, dy: 1, art: 'southeast', punch: 'southwest' },
  { facing: 'S', keys: ['KeyS'], dx: 0, dy: 1, art: 'south', punch: 'south' },
  { facing: 'SW', keys: ['KeyS', 'KeyA'], dx: -1, dy: 1, art: 'southwest', punch: 'southeast' },
  { facing: 'W', keys: ['KeyA'], dx: -1, dy: 0, art: 'west', punch: 'west' },
  { facing: 'NW', keys: ['KeyW', 'KeyA'], dx: -1, dy: -1, art: 'northwest', punch: 'northeast' },
] as const;

type FixtureSave = {
  entities: Entity[];
  world: Omit<WorldData, 'tiles'> & { tiles: number[] };
  runtime: { encounters?: unknown; moisture?: unknown };
  time: number;
  elapsedMs: number;
};

async function boot(page: Page, enemyOffsets: readonly (readonly [number, number])[] = []) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('forestrpg.v2.settings', JSON.stringify({
    clouds: false, particles: false, lighting: false, shake: false, tutorials: false,
  })));
  // The clock must own the RAF scheduled during boot, not just later timers.
  await page.clock.install();
  await page.goto('/?debug=1&autostart=1&tutorial=0&seed=42');
  await page.waitForFunction(() => !!window.__GAME__ && !!window.__RENDER_DEBUG__);
  // Leave ample headroom for the cross-process call on a busy test host. The
  // fixture is loaded afterward, so advancing boot time cannot affect the case.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  await page.evaluate(offsets => {
    const g = window.__GAME__!;
    g.pauseSimulation();
    g.saveGame('directions');
    const data = JSON.parse(localStorage.getItem('forestrpg.v2.save.directions')!) as FixtureSave;
    const p = data.entities.find((e): e is PlayerEntity => e.kind === 'player')!;
    const portal = data.entities.find((e): e is PortalEntity => e.kind === 'portal')!;
    const baseEnemy = data.entities.find((e): e is EnemyEntity => e.kind === 'enemy')!;
    delete data.runtime.encounters;
    delete data.runtime.moisture;
    data.world = {
      ...data.world, meta: { ...data.world.meta, width: 40, height: 40, isTutorial: false },
      tiles: Array<number>(1600).fill(1), props: [], bridges: [], encounterSites: [],
      enemySpawns: [], pickupSpawns: [], spawn: { x: 20, y: 20 }, portal: { x: 38, y: 38 },
    };
    Object.assign(p, { x: 20.5, y: 20.5, prevX: 20.5, prevY: 20.5, facing: 'S', anim: 'idle', animTimeMs: 0 });
    Object.assign(portal, { x: 38.5, y: 38.5, prevX: 38.5, prevY: 38.5, active: false, portalState: 'locked', roundComplete: false });
    const enemies = offsets.map(([dx, dy], i): EnemyEntity => ({
      ...baseEnemy, id: `direction-enemy-${i}`, enemyType: 'mantis',
      x: p.x + dx, y: p.y + dy, prevX: p.x + dx, prevY: p.y + dy,
      health: 20, maxHealth: 20, aggressive: false, hurtTimerMs: 0, alive: true, aiState: 'idle',
    }));
    data.entities = [p, portal, ...enemies]; data.time = .3; data.elapsedMs = 0;
    localStorage.setItem('forestrpg.v2.save.directions', JSON.stringify(data));
    if (!g.loadGame('directions')) throw new Error('Direction fixture failed to load');
  }, enemyOffsets);
  await page.clock.runFor(50);
  return errors;
}

async function held(page: Page, keys: readonly string[], down: boolean) {
  for (const key of keys) await page.keyboard[down ? 'down' : 'up'](key);
}

async function displayed(page: Page) {
  const sprite = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().playerSprite);
  expect(sprite).toBeTruthy();
  expect(sprite!.scaleX).toBeGreaterThan(0);
  expect(sprite!.scaleY).toBeGreaterThan(0);
  expect(sprite!.rotation).toBe(0);
  expect(sprite!.transform.a).toBeGreaterThan(0);
  expect(sprite!.transform.d).toBeGreaterThan(0);
  expect(sprite!.transform.b).toBe(0);
  expect(sprite!.transform.c).toBe(0);
  return sprite!;
}

/** Match opaque pixels of an independently selected PNG against the gameplay
 * canvas. Search the subpixel rounding choices made by WebGL's roundPixels;
 * this checks the drawn character, not just its diagnostics or an effect arc. */
async function verifyPixels(page: Page, info: TestInfo, name: string, anim: string, suffix: string, column: number) {
  const sprite = await displayed(page);
  expect(sprite.assetId).toBe(`player_${anim}_${suffix}`);
  const file = `public/assets/images/characters/player/${anim}/${anim}_${suffix}.png`;
  const metadata = await sharp(file).metadata();
  const count = anim === 'run' ? 6 : 4;
  const x = Math.floor(column * metadata.width! / count);
  const w = Math.floor((column + 1) * metadata.width! / count) - x;
  expect(sprite.frame).toEqual({ x, y: 0, w, h: metadata.height! });
  const reference = await sharp(file).extract({ left: x, top: 0, width: w, height: metadata.height! }).ensureAlpha().raw().toBuffer();
  // Commit the paused WebGL frame to the browser compositor before sampling
  // pixels. Neither screenshot advances the controlled game clock.
  await page.screenshot();
  const screen = await page.screenshot();
  const { data, info: size } = await sharp(screen).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = sprite.bounds;
  let best = 0, opaque = 0;
  for (const left of [Math.floor(b.x), Math.ceil(b.x)]) for (const top of [Math.floor(b.y), Math.ceil(b.y)])
    for (const width of [Math.floor(b.width), Math.ceil(b.width)]) for (const height of [Math.floor(b.height), Math.ceil(b.height)]) {
      let matched = 0, samples = 0;
      for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
        const sx = Math.min(w - 1, Math.floor((px + .5) * w / width));
        const sy = Math.min(metadata.height! - 1, Math.floor((py + .5) * metadata.height! / height));
        const ref = (sy * w + sx) * 4;
        if (reference[ref + 3]! < 250) continue;
        samples++;
        const dst = ((top + py) * size.width + left + px) * size.channels;
        if ([0, 1, 2].every(c => Math.abs(data[dst + c]! - reference[ref + c]!) < 12)) matched++;
      }
      opaque = Math.max(opaque, samples);
      best = Math.max(best, matched / Math.max(1, samples));
    }
  expect(opaque, 'must sample the visible player body').toBeGreaterThan(60);
  if (best <= .80) {
    await info.attach(`${name}-pixel-diagnostics`, { body: JSON.stringify({ sprite, column, best }), contentType: 'application/json' });
    await info.attach(`${name}-canvas`, { body: screen, contentType: 'image/png' });
  }
  expect(best, `${name}: gameplay pixels must match the reviewed ${suffix} artwork`).toBeGreaterThan(.80);
  const crop = await sharp(screen).extract({
    left: Math.max(0, Math.floor(b.x + b.width / 2 - 48)), top: Math.max(0, Math.floor(b.y + b.height / 2 - 48)),
    width: 96, height: 96,
  }).png().toBuffer();
  await info.attach(name, { body: crop, contentType: 'image/png' });
  await sharp(crop).toFile(info.outputPath(`${name}.png`));
}

for (const d of directions) test(`${d.facing} movement, all punch frames, and stationary punch`, async ({ page }, info) => {
  const errors = await boot(page);
  await held(page, d.keys, true);
  await page.clock.runFor(50);
  const p = await page.evaluate(() => window.__GAME__!.getState().player);
  expect(Math.sign(p.x - 20.5)).toBe(d.dx);
  expect(Math.sign(p.y - 20.5)).toBe(d.dy);
  expect(p.direction).toBe(d.facing);
  await verifyPixels(page, info, `${d.facing}-walk`, 'walk', d.art, 0);
  await page.keyboard.down('ShiftLeft'); await page.clock.runFor(500);
  const run = await displayed(page);
  expect(run.anim).toBe('run');
  await verifyPixels(page, info, `${d.facing}-run`, 'run', d.art, Math.floor(run.animTimeMs / 112.5) % 6);
  await page.keyboard.down('KeyE');
  for (let frame = 0; frame < 4; frame++) {
    await page.clock.runFor(frame === 0 ? 17 : 80);
    expect(await page.evaluate(() => window.__GAME__!.getState().player.attackDirection)).toBe(d.facing);
    await verifyPixels(page, info, `${d.facing}-punch-${frame}`, 'attack', d.punch, frame);
  }
  await page.keyboard.up('KeyE'); await page.clock.runFor(150);
  expect((await displayed(page)).anim).toBe('run');
  await held(page, [...d.keys, 'ShiftLeft'], false); await page.clock.runFor(50);
  expect((await displayed(page)).anim).toBe('idle');
  await page.keyboard.press('KeyE'); await page.clock.runFor(100);
  await verifyPixels(page, info, `${d.facing}-stationary`, 'attack', d.punch, 1);
  expect(errors).toEqual([]);
});

for (const d of directions.filter(d => d.keys.length === 2)) for (const reverseOrder of [false, true]) {
  test(`${d.facing} diagonal ${reverseOrder ? 'horizontal' : 'vertical'} key first, releases and reversals`, async ({ page }, info) => {
    const errors = await boot(page);
    const keys = reverseOrder ? [...d.keys].reverse() : [...d.keys];
    for (const key of keys) { await page.keyboard.down(key); await page.clock.runFor(17); }
    await page.keyboard.press('KeyE'); await page.clock.runFor(17);
    await page.keyboard.up(keys[0]!); await page.clock.runFor(40);
    expect((await displayed(page)).assetId).toBe(`player_attack_${d.punch}`);
    await page.keyboard.up(keys[1]!);
    const opposite = directions.find(other => other.dx === -d.dx && other.dy === -d.dy)!;
    await held(page, opposite.keys, true); await page.clock.runFor(40);
    await page.keyboard.press('KeyE'); // Rejected during the existing swing.
    await page.clock.runFor(160);
    await verifyPixels(page, info, `${d.facing}-locked-after-reversal`, 'attack', d.punch, 3);
    expect(await page.evaluate(() => window.__GAME__!.getState().player.direction)).toBe(opposite.facing);
    await page.clock.runFor(150);
    await page.keyboard.press('KeyE'); await page.clock.runFor(100);
    await verifyPixels(page, info, `${d.facing}-next-opposite-punch`, 'attack', opposite.punch, 1);
    expect(errors).toEqual([]);
  });
}

test('reported northwest punch never turns toward the southeast enemy', async ({ page }, info) => {
  const errors = await boot(page, [[1, 1]]);
  await held(page, ['KeyW', 'KeyA'], true);
  await page.keyboard.press('KeyE');
  for (let frame = 0; frame < 4; frame++) {
    await page.clock.runFor(frame === 0 ? 17 : 80);
    await verifyPixels(page, info, `reported-NW-punch-${frame}`, 'attack', 'northeast', frame);
  }
  const state = await page.evaluate(() => window.__GAME__!.getState());
  expect(state.player.direction).toBe('NW');
  expect(state.enemies[0]!.health).toBe(20);
  expect(errors).toEqual([]);
});

test('hit cone stays northwest while moving southeast before the strike', async ({ page }, info) => {
  const errors = await boot(page, [[-1, -1], [1, 1]]);
  await held(page, ['KeyW', 'KeyA'], true);
  await page.keyboard.press('KeyE'); await page.clock.runFor(17);
  await held(page, ['KeyW', 'KeyA'], false); await held(page, ['KeyS', 'KeyD'], true);
  // Preserve the strike origin while verifying that facing and velocity reverse.
  for (let n = 0; n < 7; n++) {
    await page.evaluate(() => window.__GAME__!.setPlayerPosition(20.5, 20.5));
    await page.clock.runFor(17);
  }
  const state = await page.evaluate(() => window.__GAME__!.getState());
  expect(state.player.direction).toBe('SE');
  expect(state.player.attackDirection).toBe('NW');
  expect(state.enemies[0]!.health).toBe(19);
  expect(state.enemies[1]!.health).toBe(20);
  const sprite = await displayed(page);
  await verifyPixels(page, info, 'locked-NW-hit', 'attack', 'northeast', Math.min(3, Math.floor(sprite.animTimeMs / 80)));
  expect(errors).toEqual([]);
});

test('impact hold cannot retain an idle pose when a punch and spin start together', async ({ page }, info) => {
  const errors = await boot(page, [[-1.2, 0]]);
  await page.keyboard.down('KeyD');
  await page.keyboard.down('KeyE'); await page.keyboard.down('KeyQ');
  await page.clock.runFor(17);
  expect(await page.evaluate(() => window.__GAME__!.getState().enemies[0]!.health)).toBe(18);
  await verifyPixels(page, info, 'impact-new-east-punch', 'attack', 'east', 0);
  expect(errors).toEqual([]);
});

test('continuous movement, repeated keyboard/mouse punches, and ignored mid-swing taps', async ({ page }, info) => {
  const errors = await boot(page);
  await held(page, ['KeyW', 'KeyD'], true);
  for (let swing = 0; swing < 3; swing++) {
    if (swing % 2 === 0) await page.keyboard.press('KeyE');
    else await page.locator('#game-canvas').click({ position: { x: 400, y: 300 } });
    await page.clock.runFor(100);
    await verifyPixels(page, info, `repeat-NE-${swing}`, 'attack', 'northwest', 1);
    await page.keyboard.press('KeyE'); await page.clock.runFor(300);
    expect((await displayed(page)).anim).toBe('walk');
    expect(await page.evaluate(() => window.__GAME__!.getState().player.comboCount)).toBe((swing + 1) % 3);
  }
  await page.clock.runFor(400);
  expect(await page.evaluate(() => window.__GAME__!.getState().player.attackDirection)).toBeNull();
  expect(errors).toEqual([]);
});

test('stationary aim assist stays locked when movement and bolt aiming change', async ({ page }, info) => {
  const errors = await boot(page, [[1.3, 0], [-3, 0]]);
  await page.keyboard.press('KeyE'); await page.clock.runFor(17);
  expect(await page.evaluate(() => window.__GAME__!.getState().player.attackDirection)).toBe('E');
  await held(page, ['KeyW', 'KeyA'], true); await page.keyboard.press('KeyR');
  await page.clock.runFor(80);
  // The bolt lands during this interval: the existing 55 ms impact hold keeps
  // frame zero, but must never replace the locked east-facing punch.
  await verifyPixels(page, info, 'stationary-assist-locked-east-held', 'attack', 'east', 0);
  await page.clock.runFor(80);
  await verifyPixels(page, info, 'stationary-assist-locked-east-resumed', 'attack', 'east', 2);
  expect(errors).toEqual([]);
});

test('rapid alternating diagonals and frame timing never steer an ongoing punch', async ({ page }, info) => {
  const errors = await boot(page);
  await held(page, ['KeyW', 'KeyA'], true); await page.keyboard.press('KeyE');
  await page.clock.runFor(17);
  const diagonals = directions.filter(d => d.keys.length === 2);
  for (let n = 0; n < 12; n++) {
    await held(page, ['KeyW', 'KeyA', 'KeyS', 'KeyD'], false);
    await held(page, diagonals[n % 4]!.keys, true);
    await page.keyboard.press('KeyE');
    await page.clock.runFor([7, 17, 1, 33][n % 4]!);
    const sprite = await displayed(page);
    expect(sprite.facing).toBe('NW');
    expect(sprite.assetId).toBe('player_attack_northeast');
  }
  const sprite = await displayed(page);
  await verifyPixels(page, info, 'rapid-diagonals-locked-NW', 'attack', 'northeast', Math.min(3, Math.floor(sprite.animTimeMs / 80)));
  expect(errors).toEqual([]);
});
