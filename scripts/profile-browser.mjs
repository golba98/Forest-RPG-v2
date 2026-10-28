import { chromium } from '@playwright/test';
import os from 'node:os';

// Run after `npm run build` with `npm run preview -- --port 4173` already serving.
const base = process.env.FOREST_BENCH_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true, args: ['--no-sandbox', '--use-angle=gl', '--enable-webgl'] });
const results = { browser: browser.version(), platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpus: os.cpus()[0]?.model ?? 'unknown', scenarios: [] };
for (const [width, height] of [[1920,1080], [2560,1440], [3840,2160]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${base}/?debug=1&autostart=1&seed=123`);
  await page.waitForFunction(() => !!window.__GAME__);
  const context = await page.context().newCDPSession(page);
  const gpu = await page.evaluate(() => { const gl = document.querySelector('canvas')?.getContext('webgl2'); const ext = gl?.getExtension('WEBGL_debug_renderer_info'); return gl && ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
  await page.evaluate(() => {
    const game = window.__GAME__, state = game.getState();
    // Keep the scripted encounter alive throughout the sample.
    setInterval(() => game.setPlayerHealth(7), 200);
    for (let i = 0; i < 50; i++) {
      const angle = i * Math.PI * 2 / 50;
      game.spawnEnemy(i % 2 ? 'mantis' : 'maggot', state.player.x + Math.cos(angle) * 3.5, state.player.y + Math.sin(angle) * 3.5);
    }
  });
  const frameTimes = await page.evaluate(() => new Promise(resolve => {
    const samples = []; let previous = 0;
    function tick(now) { if (previous) samples.push(now - previous); previous = now; if (samples.length >= 120) resolve(samples); else requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }));
  frameTimes.sort((a,b) => a-b); const percentile = p => frameTimes[Math.min(frameTimes.length - 1, Math.ceil(frameTimes.length * p) - 1)];
  const state = await page.evaluate(() => window.__GAME__.getState());
  results.scenarios.push({ width, height, gpu, samples: frameTimes.length, frameMs: { p50: percentile(.5), p95: percentile(.95), p99: percentile(.99) }, livingEnemies: state.world.activeEnemiesCount, paused: state.engine.isPaused });
  await context.detach(); await page.close();
}
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.goto(`${base}/?debug=1&autostart=1&seed=123`); await page.waitForFunction(() => !!window.__GAME__);
const cdp = await page.context().newCDPSession(page); await cdp.send('HeapProfiler.enable');
const heap = [];
for (let n = 0; n <= 20; n++) {
  if (n > 0) { const seed = await page.evaluate(() => window.__GAME__.getState().world.seed); await page.keyboard.press('KeyP'); await page.waitForFunction(previous => window.__GAME__.getState().world.seed !== previous, seed); }
  await cdp.send('HeapProfiler.collectGarbage'); const usage = await cdp.send('Runtime.getHeapUsage'); heap.push(usage.usedSize);
}
results.regenerations = { cycles: 20, jsHeapBytes: heap, note: 'JS heap only; does not include GPU memory' };
await browser.close(); console.log(JSON.stringify(results, null, 2));
