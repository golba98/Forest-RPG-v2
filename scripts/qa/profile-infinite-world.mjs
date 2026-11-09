import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const url = process.env.FOREST_BENCH_URL ?? 'http://localhost:4175';
const duration = Number(process.env.FOREST_PROFILE_MS ?? 1800000);
const output = process.env.FOREST_PROFILE_OUTPUT ?? 'artifacts/infinite-world/profile';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    '--mute-audio',
    '--use-gl=angle',
    '--use-angle=gl',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
  ],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }),
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${url}/?debug=1&autostart=1&seed=42&world=infinite`);
  await page.waitForFunction(() => !!window.__GAME__?.getStreamingDebug(), {}, { timeout: 60000 });
  await page.evaluate(() => {
    window.__GAME__.setTimeScale(0);
    window.__RENDER_DEBUG__.setWeatherPreview('clear');
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.evaluate(() => {
    const state = (window.__INFINITE_PROFILE__ = {
      frames: [],
      longTasks: [],
      excludedUntil: performance.now() + 1000,
      started: performance.now(),
      last: performance.now(),
      pending: 0,
    });
    new PerformanceObserver((list) => {
      for (const task of list.getEntries())
        if (performance.now() > state.excludedUntil)
          state.longTasks.push({ at: task.startTime, duration: task.duration });
      if (state.longTasks.length > 2000) state.longTasks.shift();
    }).observe({ entryTypes: ['longtask'] });
    const route = (t) => {
      const speed = 5.625,
        leg = 240,
        phase = Math.floor(t / leg) % 8,
        a = t % leg,
        d = speed * leg;
      const starts = [
        [0.5, 0.5],
        [d + 0.5, 0.5],
        [2 * d + 0.5, -d + 0.5],
        [2 * d + 0.5, -2 * d + 0.5],
        [d + 0.5, -3 * d + 0.5],
        [0.5, -3 * d + 0.5],
        [-d + 0.5, -2 * d + 0.5],
        [-d + 0.5, -d + 0.5],
      ];
      const dirs = [
          [1, 0],
          [1, -1],
          [0, -1],
          [-1, -1],
          [-1, 0],
          [-1, 1],
          [0, 1],
          [1, 1],
        ],
        v = dirs[phase],
        p = starts[phase];
      return { x: p[0] + v[0] * a * speed, y: p[1] + v[1] * a * speed };
    };
    const frame = (now) => {
      if (now > state.excludedUntil) state.frames.push(now - state.last);
      if (state.frames.length > 3600) state.frames.shift();
      state.last = now;
      const p = route((now - state.started) / 1000);
      if (state.pending) {
        requestAnimationFrame(frame);
        return;
      }
      state.pending++;
      window.__GAME__
        .setGlobalPosition(p.x, p.y)
        .catch((error) => {
          state.error = String(error);
        })
        .finally(() => state.pending--);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  const checkpoints = [];
  for (let elapsed = 0; elapsed <= duration; elapsed += 60000) {
    await page.evaluate(() => {
      window.__INFINITE_PROFILE__.excludedUntil = performance.now() + 1000;
    });
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = await cdp.send('Runtime.getHeapUsage'),
      metrics = await cdp.send('Performance.getMetrics');
    const data = await page.evaluate(() => {
      const p = window.__INFINITE_PROFILE__,
        frames = [...p.frames].sort((a, b) => a - b),
        q = (n) => frames[Math.floor((frames.length - 1) * n)] ?? 0;
      return {
        position: window.__GAME__.getStreamingDebug(),
        render: window.__RENDER_DEBUG__.getResidency(),
        assets: window.__RENDER_DEBUG__.getInfo().environment?.assetLoads ?? [],
        p50: q(0.5),
        p95: q(0.95),
        p99: q(0.99),
        max: frames.at(-1) ?? 0,
        longTasks: [...p.longTasks],
        pending: p.pending,
        error: p.error ?? null,
      };
    });
    checkpoints.push({
      elapsed,
      heap,
      metrics: metrics.metrics.filter((m) =>
        ['TaskDuration', 'JSHeapUsedSize', 'Nodes'].includes(m.name),
      ),
      ...data,
    });
    await writeFile(
      `${output}/checkpoints.json`,
      JSON.stringify({ duration, errors, checkpoints }, null, 2),
    );
    console.info(
      JSON.stringify({
        elapsed,
        heap: heap.usedSize,
        position: data.position,
        p95: data.p95,
        p99: data.p99,
        longTasks: data.longTasks.length,
        error: data.error,
      }),
    );
    if (elapsed % 300000 === 0) await page.screenshot({ path: `${output}/route-${elapsed}.png` });
    if (elapsed < duration) await page.waitForTimeout(Math.min(60000, duration - elapsed));
  }
  await writeFile(
    `${output}/result.json`,
    JSON.stringify({ duration, errors, checkpoints, browser: browser.version() }, null, 2),
  );
} finally {
  await browser.close();
}
