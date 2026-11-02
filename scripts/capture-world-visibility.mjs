import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = process.env.FOREST_BENCH_URL ?? 'http://localhost:4173';
const output = process.env.FOREST_EVIDENCE_DIR ?? 'artifacts/world-rendering-persistence/after';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=gl',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
  ],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: output, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      'forestrpg.v2.settings',
      JSON.stringify({
        clouds: false,
        particles: false,
        lighting: false,
        hud: false,
        shake: false,
        tutorials: false,
      }),
    ),
  );
  await page.goto(`${base}/?debug=1&autostart=1&seed=42&tutorial=0`);
  await page.waitForFunction(() => !!window.__RENDER_DEBUG__);
  await page.waitForTimeout(300);
  const initial = await page.evaluate(() => {
    window.__GAME__.saveGame('world-rendering-baseline');
    return JSON.parse(localStorage.getItem('forestrpg.v2.save.world-rendering-baseline'));
  });
  await writeFile(`${output}/seed-42-save.json`, JSON.stringify(initial));
  await page.screenshot({ path: `${output}/seed-42-spawn.png` });
  const loaded = await page.evaluate(() => {
    const g = window.__GAME__;
    g.pauseSimulation();
    g.saveGame('culling-fixture');
    const data = JSON.parse(localStorage.getItem('forestrpg.v2.save.culling-fixture'));
    delete data.runtime.encounters;
    delete data.runtime.moisture;
    const width = 100,
      height = 100,
      tiles = Array(width * height).fill(1);
    tiles[49 * width + 51] = 11;
    data.world = {
      ...data.world,
      meta: { ...data.world.meta, width, height, generatorVersion: 12, hilltopObjectsVersion: 1 },
      tiles,
      props: [{ id: 900, kind: 'tree', tileX: 50, tileY: 50, solid: true }],
      bridges: [],
      encounterSites: [],
      enemySpawns: [],
      pickupSpawns: [],
      spawn: { x: 50, y: 59 },
      portal: { x: 95, y: 95 },
    };
    data.entities = data.entities.filter((e) => e.kind === 'player' || e.kind === 'portal');
    for (const e of data.entities) {
      e.x = e.prevX = e.kind === 'player' ? 50.5 : 95.5;
      e.y = e.prevY = e.kind === 'player' ? 59.5 : 95.5;
    }
    data.time = 0.5;
    data.elapsedMs = 0;
    localStorage.setItem('forestrpg.v2.save.culling-fixture', JSON.stringify(data));
    const loaded = g.loadGame('culling-fixture');
    g.setDaylightRatio(0.5);
    return loaded;
  });
  if (!loaded) throw Error('Fixture was rejected');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${output}/tree-before-top-boundary.png` });
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(340);
  await page.keyboard.up('KeyS');
  await page.evaluate(() => window.__GAME__.setPlayerPosition(50.5, 61.6875));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${output}/tree-clipped-at-top.png` });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(340);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${output}/tree-returned.png` });
  for (const keys of [['KeyD'], ['KeyA'], ['KeyW', 'KeyD'], ['KeyS', 'KeyA']]) {
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(600);
    for (const key of keys) await page.keyboard.up(key);
  }
  const result = await page.evaluate(() => ({
    state: window.__GAME__.getState(),
    visual: window.__RENDER_DEBUG__.getInfo(),
  }));
  result.worldHash = createHash('sha256').update(JSON.stringify(initial.world)).digest('hex');
  result.errors = errors;
  await writeFile(`${output}/capture.json`, JSON.stringify(result, null, 2));
  const video = page.video();
  await context.close();
  await video?.saveAs(`${output}/scenery-boundaries.webm`);
  const clouds = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: output, size: { width: 1280, height: 720 } },
  });
  const sky = await clouds.newPage();
  await sky.goto(`${base}/?debug=1&autostart=1&seed=42&tutorial=0`);
  await sky.waitForFunction(() => !!window.__RENDER_DEBUG__);
  await sky.screenshot({ path: `${output}/clouds-initial.png` });
  await sky.keyboard.down('KeyD');
  await sky.waitForTimeout(1800);
  await sky.keyboard.up('KeyD');
  await sky.keyboard.down('KeyS');
  await sky.waitForTimeout(1800);
  await sky.keyboard.up('KeyS');
  await sky.waitForTimeout(1200);
  await sky.screenshot({ path: `${output}/clouds-drifted.png` });
  const skyVideo = sky.video();
  await clouds.close();
  await skyVideo?.saveAs(`${output}/clouds-camera-motion.webm`);
  console.info(
    JSON.stringify(
      { output, worldHash: result.worldHash, residency: result.visual.residency, errors },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
