import { chromium } from '@playwright/test';
import os from 'node:os';

// Run after `npm run build` with `npm run preview -- --port 4173` already serving.
const base = process.env.FOREST_BENCH_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
  headless: true,
  args: ['--mute-audio', '--no-sandbox', '--use-angle=gl', '--enable-webgl'],
});
const results = {
  browser: browser.version(),
  platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  cpus: os.cpus()[0]?.model ?? 'unknown',
  scenarios: [],
};
for (const [width, height] of [
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${base}/?debug=1&autostart=1&seed=123`);
  await page.waitForFunction(
    () =>
      !!window.__GAME__ &&
      window.__RENDER_DEBUG__?.getInfo().environment?.ready !== false &&
      !window.__RENDER_DEBUG__?.getInfo().environment?.prefetching,
  );
  const context = await page.context().newCDPSession(page);
  const gpu = await page.evaluate(() => {
    const gl = document.querySelector('canvas')?.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl && ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  await page.evaluate(() => {
    const game = window.__GAME__,
      state = game.getState();
    // Keep the scripted encounter alive throughout the sample.
    setInterval(() => game.setPlayerHealth(7), 200);
    for (let i = 0; i < 50; i++) {
      const angle = (i * Math.PI * 2) / 50;
      game.spawnEnemy(
        i % 2 ? 'mantis' : 'maggot',
        state.player.x + Math.cos(angle) * 3.5,
        state.player.y + Math.sin(angle) * 3.5,
      );
    }
  });
  const frameTimes = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const samples = [];
        let previous = 0;
        function tick(now) {
          if (previous) samples.push(now - previous);
          previous = now;
          if (samples.length >= 120) resolve(samples);
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }),
  );
  frameTimes.sort((a, b) => a - b);
  const percentile = (p) =>
    frameTimes[Math.min(frameTimes.length - 1, Math.ceil(frameTimes.length * p) - 1)];
  const state = await page.evaluate(() => window.__GAME__.getState());
  const environment = await page.evaluate(
    () => window.__RENDER_DEBUG__?.getInfo().environment ?? null,
  );
  results.scenarios.push({
    width,
    height,
    gpu,
    environment,
    samples: frameTimes.length,
    frameMs: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) },
    livingEnemies: state.world.activeEnemiesCount,
    paused: state.engine.isPaused,
  });
  await context.detach();
  await page.close();
}
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
await page.goto(`${base}/?debug=1&autostart=1&seed=123`);
await page.waitForFunction(
  () =>
    !!window.__GAME__ &&
    window.__RENDER_DEBUG__?.getInfo().environment?.ready !== false &&
    !window.__RENDER_DEBUG__?.getInfo().environment?.prefetching,
);
await page.evaluate(() => {
  window.__GAME__.executeCommand('/kill all');
  window.__GAME__.setPlayerPosition(20, 75);
});
await page.waitForTimeout(500);
await page.waitForFunction(
  () =>
    window.__RENDER_DEBUG__.getInfo().environment.ready &&
    !window.__RENDER_DEBUG__.getInfo().environment.prefetching,
);
results.traversal = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const samples = [],
        caches = [];
      let previous = 0,
        n = 0,
        unavailable = 0,
        placeholders = 0;
      function tick(now) {
        if (previous) samples.push(now - previous);
        previous = now;
        window.__GAME__.setPlayerPosition(20 + n * 0.18, 75 + Math.sin(n / 120) * 20);
        const d = window.__RENDER_DEBUG__.getInfo();
        if (!d.environment.ready) unavailable++;
        placeholders = Math.max(placeholders, d.placeholderSprites);
        if (n % 30 === 0)
          caches.push({ ...d.environment, assetLoads: undefined, chunkBuildMs: undefined });
        if (++n < 600) requestAnimationFrame(tick);
        else {
          samples.sort((a, b) => a - b);
          const q = (p) => samples[Math.min(samples.length - 1, Math.ceil(samples.length * p) - 1)];
          resolve({
            method:
              '600 camera-follow steps, 0.18 tiles/RAF east with a 20-tile north/south arc; rendering stress, not a collision benchmark',
            frameMs: { p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1) },
            over33ms: samples.filter((v) => v > 33).length,
            unavailableFrames: unavailable,
            placeholders,
            caches,
            final: window.__RENDER_DEBUG__.getInfo().environment,
          });
        }
      }
      requestAnimationFrame(tick);
    }),
);
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable');
const heap = [];
for (let n = 0; n <= 20; n++) {
  if (n > 0) {
    const seed = await page.evaluate(() => window.__GAME__.getState().world.seed);
    await page.keyboard.press('KeyP');
    await page.waitForFunction(
      (previous) =>
        window.__GAME__.getState().world.seed !== previous &&
        window.__RENDER_DEBUG__?.getInfo().environment?.ready !== false &&
        !window.__RENDER_DEBUG__?.getInfo().environment?.prefetching,
      seed,
    );
  }
  await cdp.send('HeapProfiler.collectGarbage');
  const usage = await cdp.send('Runtime.getHeapUsage');
  heap.push(usage.usedSize);
}
results.regenerations = {
  cycles: 20,
  jsHeapBytes: heap,
  note: 'JS heap only; does not include GPU memory',
};
await browser.close();
console.log(JSON.stringify(results, null, 2));
