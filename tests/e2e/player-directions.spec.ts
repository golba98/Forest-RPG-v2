import { expect, test, type Page, type TestInfo } from '@playwright/test';
import sharp from 'sharp';
import { boot } from './helpers/directional-fixture';

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

async function held(page: Page, keys: readonly string[], down: boolean) {
  for (const key of keys) await page.keyboard[down ? 'down' : 'up'](key);
}

async function displayed(page: Page) {
  const sprite = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().playerSprite);
  expect(sprite).toBeTruthy();
  const mirror = sprite!.anim === 'run' && sprite!.facing === 'SW';
  expect(Math.sign(sprite!.scaleX)).toBe(mirror ? -1 : 1);
  expect(sprite!.scaleY).toBeGreaterThan(0);
  expect(sprite!.rotation).toBe(0);
  expect(Math.sign(sprite!.transform.a)).toBe(mirror ? -1 : 1);
  expect(sprite!.transform.d).toBeGreaterThan(0);
  expect(Math.abs(sprite!.transform.b)).toBe(0);
  expect(Math.abs(sprite!.transform.c)).toBe(0);
  return sprite!;
}

/** Match opaque pixels of an independently selected PNG against the gameplay
 * canvas. Search the subpixel rounding choices made by WebGL's roundPixels;
 * this checks the drawn character, not just its diagnostics or an effect arc. */
async function verifyPixels(page: Page, info: TestInfo, name: string, anim: string, suffix: string, column: number) {
  const sprite = await displayed(page);
  // Independently reviewed exception: all six SW run frames were a duplicate
  // of SE. Require the actual horizontal mirror, retaining frame order.
  const mirror = anim === 'run' && suffix === 'southwest';
  const source = mirror ? 'southeast' : suffix;
  expect(sprite.assetId).toBe(`player_${anim}_${source}`);
  const file = `public/assets/images/characters/player/${anim}/${anim}_${source}.png`;
  const metadata = await sharp(file).metadata();
  const count = anim === 'run' ? 6 : 4;
  const x = Math.floor(column * metadata.width! / count);
  const w = Math.floor((column + 1) * metadata.width! / count) - x;
  expect(sprite.frame).toEqual({ x, y: 0, w, h: metadata.height! });
  const sourceFrame = sharp(file).extract({ left: x, top: 0, width: w, height: metadata.height! });
  const reference = await (mirror ? sourceFrame.flop() : sourceFrame).ensureAlpha().raw().toBuffer();
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
  for (const [anim, count, step] of [['walk', 4, 150], ['run', 6, 112.5], ['idle', 4, 150]] as const) {
    if (anim === 'run') await page.keyboard.down('ShiftLeft');
    if (anim === 'idle') await held(page, [...d.keys, 'ShiftLeft'], false);
    await page.clock.runFor(17);
    const seen = new Set<number>();
    for (let sample = 0; sample < count * 3 && seen.size < count; sample++) {
      const pose = await displayed(page);
      expect(pose.anim).toBe(anim);
      const frame = Math.floor(pose.animTimeMs / step) % count;
      if (!seen.has(frame)) await verifyPixels(page, info, `${d.facing}-${anim}-${frame}`, anim, d.art, frame);
      seen.add(frame);
      await page.clock.runFor(step / 2);
    }
    expect(seen.size).toBe(count);
  }
  await held(page, [...d.keys, 'ShiftLeft'], true);
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

test('running bolt keeps northwest pixels and moving slash follows its locked swing (ten traces)', async ({ page }, info) => {
  const errors = await boot(page, [[4, 4]]);
  let lastSwing = 0;
  for (let repeat = 0; repeat < 10; repeat++) {
    await page.evaluate(() => {
      window.__GAME__!.setPlayerPosition(20.5, 20.5);
      window.__GAME__!.executeCommand('/mana 100');
      window.__GAME__!.executeCommand('/stamina 100');
    });
    await held(page, ['KeyW', 'KeyA', 'ShiftLeft'], true);
    await page.clock.runFor(17);
    await page.keyboard.press('KeyR'); await page.clock.runFor(17);
    const pose = await displayed(page);
    expect(pose.facing).toBe('NW'); expect(pose.anim).toBe('run');
    await verifyPixels(page, info, `bolt-NW-${repeat}`, 'run', 'northwest', Math.floor(pose.animTimeMs / 112.5) % 6);
    await page.keyboard.press('KeyE'); await page.clock.runFor(17);
    let debug = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo());
    const id = debug.playerSlash!.swingId;
    expect(id).toBeGreaterThan(lastSwing); lastSwing = id;
    expect(debug.playerSlash!.comboStep).toBe(repeat % 3 + 1);
    for (const delta of [1, 16, 33, 17]) {
      await held(page, ['KeyW', 'KeyA'], false);
      await held(page, ['KeyS', 'KeyD'], true);
      await page.clock.runFor(delta);
      debug = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo());
      expect(debug.playerSlash!.swingId).toBe(id);
      expect(debug.playerSlash!.angle).toBeCloseTo(-3 * Math.PI / 4);
      expect(debug.playerSlash!.x).toBeCloseTo(debug.playerSprite!.position.x);
      expect(debug.playerSlash!.y).toBeCloseTo(debug.playerSprite!.position.y - 12);
    }
    await page.keyboard.press('Escape'); await page.clock.runFor(17);
    const frozen = await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().playerSlash);
    await page.clock.runFor(100);
    expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().playerSlash)).toEqual(frozen);
    await page.keyboard.press('Escape'); await page.clock.runFor(300);
    expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().playerSlash)).toBeNull();
    await held(page, ['KeyS', 'KeyD', 'ShiftLeft'], false);
  }
  expect(errors).toEqual([]);
});

test('all held-key combinations, arrow aliases and blur release keep physical direction', async ({ page }) => {
  await boot(page);
  for (const keys of [['KeyW', 'KeyA', 'KeyS', 'KeyD'], ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']]) {
    for (let mask = 0; mask < 16; mask++) {
      await held(page, keys, false);
      await page.evaluate(() => window.__GAME__!.setPlayerPosition(20.5, 20.5));
      await held(page, keys.filter((_, i) => mask & (1 << i)), true);
      const before = await page.evaluate(() => window.__GAME__!.getState().engine);
      await page.clock.runFor(100);
      const state = await page.evaluate(() => window.__GAME__!.getState());
      const p = state.player;
      const seconds = (state.engine.stepCount - before.stepCount) * before.fixedDeltaMs / 1000;
      expect(seconds).toBeGreaterThan(.07); expect(seconds).toBeLessThan(.14);
      const dx = Number(!!(mask & 8)) - Number(!!(mask & 2));
      const dy = Number(!!(mask & 4)) - Number(!!(mask & 1));
      expect(Math.sign(p.x - 20.5)).toBe(dx);
      expect(Math.sign(p.y - 20.5)).toBe(dy);
      expect(Math.hypot(p.x - 20.5, p.y - 20.5)).toBeCloseTo(dx || dy ? 6.25 * seconds : 0, 5);
    }
    await held(page, keys, false);
  }
  await page.keyboard.down('KeyW'); await page.clock.runFor(50);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.clock.runFor(50);
  const stopped = await page.evaluate(() => window.__GAME__!.getState().player.y);
  await page.clock.runFor(100);
  expect(await page.evaluate(() => window.__GAME__!.getState().player.y)).toBe(stopped);
});

test('live RAF gameplay keeps running and punching direction through repeated bolts', async ({ page }, info) => {
  const errors = await boot(page, [[4, 4]], {}, true);
  const traces: unknown[] = [];
  for (let repeat = 0; repeat < 10; repeat++) {
    await page.evaluate(() => {
      window.__GAME__!.setPlayerPosition(20.5, 20.5);
      window.__GAME__!.executeCommand('/mana 100'); window.__GAME__!.executeCommand('/stamina 100');
    });
    await held(page, ['KeyW', 'KeyA', 'ShiftLeft'], true);
    await page.waitForTimeout(40);
    await page.keyboard.press('KeyR');
    const samples = await page.evaluate(() => new Promise<{ facing: string; anim: string; asset: string }[]>(resolve => {
      const frames: { facing: string; anim: string; asset: string }[] = [];
      const sample = () => {
        const p = window.__RENDER_DEBUG__!.getInfo().playerSprite!;
        frames.push({ facing: p.facing, anim: p.anim, asset: p.assetId });
        if (frames.length === 5) resolve(frames); else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }));
    expect(samples.every(s => s.facing === 'NW' && s.anim === 'run' && s.asset === 'player_run_northwest')).toBe(true);
    await page.keyboard.press('KeyE'); await page.waitForTimeout(40);
    await held(page, ['KeyW', 'KeyA'], false); await held(page, ['KeyS', 'KeyD'], true);
    const punch = await displayed(page);
    expect(punch.facing).toBe('NW'); expect(punch.assetId).toBe('player_attack_northeast');
    traces.push({ repeat, samples, punch: { facing: punch.facing, asset: punch.assetId } });
    await held(page, ['KeyS', 'KeyD', 'ShiftLeft'], false); await page.waitForTimeout(380);
  }
  await info.attach('live-traces', { body: JSON.stringify(traces), contentType: 'application/json' });
  expect(errors).toEqual([]);
});

test('damage keeps the punch locked; reload cancels it and death locks movement', async ({ page }) => {
  await boot(page, [[.5, 0]]);
  expect(await page.evaluate(() => {
    const g = window.__GAME__!; g.saveGame('damage');
    const data = JSON.parse(localStorage.getItem('forestrpg.v2.save.damage')!);
    data.entities.find((e: { kind: string }) => e.kind === 'enemy').aggressive = true;
    localStorage.setItem('forestrpg.v2.save.damage', JSON.stringify(data));
    return g.loadGame('damage');
  })).toBe(true);
  await page.keyboard.press('KeyE'); await page.clock.runFor(250);
  // Melee would stun the close attacker; a fresh one supplies ordinary damage.
  await page.evaluate(() => window.__GAME__!.spawnEnemy('mantis', 20.5, 20.5));
  await page.clock.runFor(150); // Let the previous swing finish.
  await page.keyboard.press('KeyE'); await page.clock.runFor(100);
  const state = await page.evaluate(() => window.__GAME__!.getState());
  expect(state.player.hurtTimer).toBeGreaterThan(0);
  const locked = state.player.attackDirection;
  expect(locked).not.toBeNull();
  await page.keyboard.down('KeyA'); await page.clock.runFor(17);
  expect((await displayed(page)).facing).toBe(locked);
  await page.keyboard.up('KeyA');
  expect(await page.evaluate(() => { const g = window.__GAME__!; return g.saveGame('mid-swing') && g.loadGame('mid-swing'); })).toBe(true);
  await page.clock.runFor(17);
  expect(await page.evaluate(() => window.__GAME__!.getState().player.attackDirection)).toBeNull();
  expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().playerSlash)).toBeNull();
  await page.evaluate(() => window.__GAME__!.executeCommand('/health 0'));
  await page.clock.runFor(17);
  const dead = await page.evaluate(() => window.__GAME__!.getState());
  expect(dead.ui.currentMenu).toBe('gameover');
  await page.keyboard.down('KeyD'); await page.clock.runFor(200);
  const after = await page.evaluate(() => window.__GAME__!.getState());
  expect(after.player.x).toBe(dead.player.x); expect(after.player.y).toBe(dead.player.y);
});

test('inverted Y follows effective movement for run pixels and locked punch', async ({ page }, info) => {
  await boot(page, [], { invertY: true });
  await held(page, ['KeyW', 'KeyA', 'ShiftLeft'], true); await page.clock.runFor(100);
  const p = await page.evaluate(() => window.__GAME__!.getState().player);
  expect(p.x).toBeLessThan(20.5); expect(p.y).toBeGreaterThan(20.5);
  const run = await displayed(page);
  await verifyPixels(page, info, 'inverted-SW-run', 'run', 'southwest', Math.floor(run.animTimeMs / 112.5) % 6);
  await page.keyboard.press('KeyE'); await page.clock.runFor(17);
  await verifyPixels(page, info, 'inverted-SW-punch', 'attack', 'southeast', 0);
});
