import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';

// Build HEAD in a separate directory for BEFORE_URL; serve the working build at AFTER_URL.
let fixture = process.env.FOREST_BASELINE_SAVE
  ? readFileSync(process.env.FOREST_BASELINE_SAVE, 'utf8')
  : null;
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-angle=gl', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const output = {
  browser: browser.version(),
  cpu: os.cpus()[0]?.model,
  viewport: { width: 1280, height: 720 },
  seed: 42,
  position: [23.5, 87.5],
  scenarios: [],
};
try {
  for (const [phase, base] of [
    ['before', process.env.BEFORE_URL ?? 'http://127.0.0.1:4174'],
    ['after', process.env.AFTER_URL ?? 'http://127.0.0.1:4173'],
  ]) {
    const page = await browser.newPage({ viewport: output.viewport, deviceScaleFactor: 1 });
    await page.goto(`${base}/?debug=1&autostart=1&tutorial=0&seed=42`);
    await page.waitForFunction(
      () => !!window.__RENDER_DEBUG__ && window.__GAME__?.getState().ui.currentMenu === null,
    );
    if (!fixture)
      fixture = await page.evaluate(() => {
        window.__GAME__.setPlayerPosition(23.5, 87.5);
        window.__GAME__.saveGame('profile-source');
        return localStorage.getItem('forestrpg.v2.save.profile-source');
      });
    await page.evaluate((raw) => {
      // Identical saved world and actors. Keep the sample alive if an enemy approaches.
      localStorage.setItem('forestrpg.v2.save.profile', raw);
      window.__GAME__.loadGame('profile');
      window.__GAME__.setDaylightRatio(0.5);
      window.__RENDER_DEBUG__.setWeatherPreview('rain');
      setInterval(() => window.__GAME__.setPlayerHealth(7), 100);
    }, fixture);
    await page.waitForTimeout(2500);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    for (const [weather, settle] of [
      ['early-rain', 0],
      ['sustained-rain', 24000],
    ]) {
      if (settle) await page.waitForTimeout(settle);
      await cdp.send('HeapProfiler.collectGarbage');
      const start = Object.fromEntries(
        (await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]),
      );
      const frames = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const samples = [];
            let previous;
            const tick = (now) => {
              if (previous !== undefined) samples.push(now - previous);
              previous = now;
              if (samples.length === 180) resolve(samples);
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
      );
      const end = Object.fromEntries(
        (await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]),
      );
      await cdp.send('HeapProfiler.collectGarbage');
      const heap = await cdp.send('Runtime.getHeapUsage');
      frames.sort((a, b) => a - b);
      const p = (q) => frames[Math.ceil(frames.length * q) - 1];
      output.scenarios.push({
        phase,
        weather,
        samples: frames.length,
        frameMs: { p50: p(0.5), p95: p(0.95), p99: p(0.99) },
        browserTaskMsPerFrame: ((end.TaskDuration - start.TaskDuration) * 1000) / frames.length,
        jsHeapBytes: heap.usedSize,
        effects: await page.evaluate(() => window.__RENDER_DEBUG__.getInfo().weather ?? null),
      });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
const json = JSON.stringify(output, null, 2);
if (process.env.FOREST_PROFILE_OUTPUT) writeFileSync(process.env.FOREST_PROFILE_OUTPUT, json);
process.stdout.write(`${json}\n`);
