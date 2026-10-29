import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { readFileSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';

const out = process.env.FOREST_EVIDENCE_DIR ?? 'docs/qa/evidence/weather-rivers';
const base = process.env.AFTER_URL ?? 'http://127.0.0.1:4173';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const { bridgeFixture } = await server.ssrLoadModule('/tests/fixtures/bridge-world.ts');
const { PLAYER_FOOTPRINT } = await server.ssrLoadModule('/src/systems/EntityFootprint.ts');
await server.close();
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const evidence = {
  browser: browser.version(),
  errors: [],
  scenes: [],
  note: 'Rain accumulation and drying use the existing 8x debug time scale; airborne animation remains real time.',
};
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  recordVideo: { dir: '/tmp/forest-weather-video', size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
page.on('pageerror', (e) => evidence.errors.push(e.message));
const boot = async (target, seed) => {
  await target.goto(`${base}/?debug=1&autostart=1&tutorial=0&seed=${seed}`);
  await target.waitForFunction(
    () => !!window.__RENDER_DEBUG__ && window.__GAME__?.getState().ui.currentMenu === null,
  );
  await target.evaluate(() => {
    window.__GAME__.setDaylightRatio(0.5);
    setInterval(() => {
      window.__GAME__.setPlayerHealth(7);
      window.__GAME__.setDaylightRatio(0.5);
    }, 100);
  });
};
const shot = async (target, name) => target.screenshot({ path: `${out}/${name}.png` });
try {
  await boot(page, 42);
  let raw;
  if (process.env.FOREST_BASELINE_SAVE)
    raw = readFileSync(process.env.FOREST_BASELINE_SAVE, 'utf8');
  else {
    const source = await browser.newPage();
    await source.goto(
      `${process.env.BEFORE_URL ?? 'http://127.0.0.1:4174'}/?debug=1&autostart=1&tutorial=0&seed=42`,
    );
    await source.waitForFunction(() => window.__GAME__?.getState().ui.currentMenu === null);
    raw = await source.evaluate(() => {
      window.__GAME__.setPlayerPosition(23.5, 87.5);
      window.__GAME__.saveGame('evidence');
      return localStorage.getItem('forestrpg.v2.save.evidence');
    });
    await source.close();
  }
  await page.evaluate((save) => {
    localStorage.setItem('forestrpg.v2.save.evidence', save);
    if (!window.__GAME__.loadGame('evidence')) throw new Error('Baseline import failed');
    window.__GAME__.setDaylightRatio(0.5);
    window.__RENDER_DEBUG__.setWeatherPreview('clear');
  }, raw);
  await page.waitForTimeout(1000);
  await shot(page, 'after-clear');
  await page.evaluate(() => {
    window.__RENDER_DEBUG__.setWeatherPreview('rain');
    window.__GAME__.setTimeScale(8);
  });
  await page.waitForTimeout(3200);
  await page.evaluate(() => window.__GAME__.setTimeScale(1));
  await shot(page, 'after-rain');
  evidence.scenes.push({
    scene: 'loaded-v8-seed42',
    position: [23.5, 87.5],
    info: await page.evaluate(() => window.__RENDER_DEBUG__.getInfo()),
  });
  await page.evaluate(() => window.__GAME__.setPlayerPosition(31.5, 86.5));
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.__GAME__.setPlayerPosition(23.5, 87.5));
  await page.waitForTimeout(1000);
  // A terrain fixture makes footsteps and deck behaviour easy to inspect without combat.
  const { world, bridge } = bridgeFixture();
  await page.evaluate(
    (w) => {
      const g = window.__GAME__;
      g.saveGame('evidence-fixture');
      const save = JSON.parse(localStorage.getItem('forestrpg.v2.save.evidence-fixture'));
      delete save.runtime.encounters;
      delete save.runtime.moisture;
      save.world = w;
      save.entities = save.entities.filter((e) => e.kind === 'player' || e.kind === 'portal');
      for (const e of save.entities) {
        const p = e.kind === 'player' ? w.spawn : w.portal;
        Object.assign(e, { x: p.x + 0.5, y: p.y + 0.5, prevX: p.x + 0.5, prevY: p.y + 0.5 });
      }
      localStorage.setItem('forestrpg.v2.save.evidence-fixture', JSON.stringify(save));
      if (!g.loadGame('evidence-fixture')) throw new Error('Fixture import failed');
      g.setDaylightRatio(0.5);
      window.__RENDER_DEBUG__.setWeatherPreview('rain');
      g.setTimeScale(8);
    },
    { ...world, tiles: Array.from(world.tiles) },
  );
  await page.waitForTimeout(3300);
  await page.evaluate(() => window.__GAME__.setTimeScale(1));
  const pool = await page.evaluate(() =>
    window.__RENDER_DEBUG__
      .getInfo()
      .puddles.find((p) => p.x > 350 && p.x < 650 && p.y > 350 && p.y < 850),
  );
  if (!pool) throw new Error('No accumulated puddle in capture region');
  await page.evaluate(
    ({ pool, offset }) =>
      window.__GAME__.setPlayerPosition((pool.x - 9) / 32, pool.y / 32 - offset),
    { pool, offset: PLAYER_FOOTPRINT.offsetY },
  );
  await page.waitForTimeout(800);
  await shot(page, 'puddles');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(90);
  await page.keyboard.up('KeyD');
  await shot(page, 'puddle-footstep');
  evidence.scenes.push({
    scene: 'puddle-footstep',
    pool,
    info: await page.evaluate(() => window.__RENDER_DEBUG__.getInfo()),
  });
  await page.waitForTimeout(500);
  await page.evaluate(
    ({ bridge, offset }) =>
      window.__GAME__.setPlayerPosition(bridge.x + 0.5, bridge.y + 1 - offset),
    { bridge, offset: PLAYER_FOOTPRINT.offsetY },
  );
  await page.waitForTimeout(700);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyD');
  await shot(page, 'rain-bridge');
  evidence.scenes.push({
    scene: 'bridge-crossing',
    info: await page.evaluate(() => window.__RENDER_DEBUG__.getInfo()),
  });
  await page.evaluate(() => {
    window.__RENDER_DEBUG__.setWeatherPreview('clear');
    window.__GAME__.setTimeScale(8);
  });
  await page.waitForTimeout(6000);
  await shot(page, 'drying');
  await page.waitForTimeout(9500);
  await page.evaluate(() => window.__GAME__.setTimeScale(1));
  await shot(page, 'dry');
  await context.close();
  copyFileSync(await page.video().path(), `${out}/surface-weather.webm`);
  const stills = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  stills.on('pageerror', (e) => evidence.errors.push(e.message));
  for (const seed of [42, 123, 1, 1337]) {
    await boot(stills, seed);
    const position = await stills.evaluate(() => {
      const g = window.__GAME__;
      g.saveGame('new-world-evidence');
      const w = JSON.parse(localStorage.getItem('forestrpg.v2.save.new-world-evidence')).world;
      const b = w.bridges[0];
      const p = b
        ? {
            x: b.x + (b.orientation === 'horizontal' ? 1 : 1.5),
            y: b.y + (b.orientation === 'horizontal' ? 1 : 1),
          }
        : { x: w.spawn.x + 0.5, y: w.spawn.y + 0.5 };
      g.setPlayerPosition(p.x, p.y);
      window.__RENDER_DEBUG__.setWeatherPreview('rain');
      return p;
    });
    await stills.waitForTimeout(2200);
    await shot(stills, `new-seed${seed}`);
    evidence.scenes.push({
      scene: `new-seed${seed}`,
      position,
      info: await stills.evaluate(() => window.__RENDER_DEBUG__.getInfo()),
    });
  }
  await stills.close();
} finally {
  await browser.close();
}
for (const scene of evidence.scenes) {
  const pools = scene.info.puddles ?? [];
  scene.info.puddleCount = pools.length;
  scene.info.puddles = pools.slice(0, 12);
}
writeFileSync(`${out}/visual-observations.json`, JSON.stringify(evidence, null, 2));
process.stdout.write(
  JSON.stringify({
    screenshots: out,
    errors: evidence.errors,
    scenes: evidence.scenes.map((s) => s.scene),
  }) + '\n',
);
