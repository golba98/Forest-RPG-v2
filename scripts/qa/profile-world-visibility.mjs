import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';

// Run against a production preview. Captures are intentionally excluded from profiling.
const base = process.env.FOREST_BENCH_URL ?? 'http://localhost:4173';
const duration = Number(process.env.FOREST_PROFILE_MS ?? 600000);
const output = process.env.FOREST_EVIDENCE_DIR ?? 'artifacts/world-rendering-persistence/after';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    '--mute-audio',
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=gl',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
  ],
});
const results = {
  browser: browser.version(),
  cpu: os.cpus()[0]?.model,
  durationMs: duration,
  scenarios: [],
  route: null,
};
const percentile = (values, p) =>
  values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)] ?? 0;
const summarize = (values) => {
  values.sort((a, b) => a - b);
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values.at(-1) ?? 0,
  };
};
const metric = (metrics, name) => metrics.metrics.find((x) => x.name === name)?.value ?? 0;
try {
  for (const [width, height] of [
    [1280, 720],
    [390, 844],
    [1920, 1080],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`${base}/?debug=1&autostart=1&tutorial=0&seed=42`);
    await page.waitForFunction(() => !!window.__RENDER_DEBUG__);
    await page.waitForTimeout(400);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = await cdp.send('Runtime.getHeapUsage'),
      start = await cdp.send('Performance.getMetrics');
    const samples = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const frames = [],
            cpu = [];
          let previous = 0;
          function tick(now) {
            if (previous) frames.push(now - previous);
            previous = now;
            const r = window.__RENDER_DEBUG__.getResidency?.();
            if (r) cpu.push(r.renderCpuMs ?? 0);
            if (frames.length >= 180) resolve({ frames, cpu });
            else requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        }),
    );
    const end = await cdp.send('Performance.getMetrics');
    results.scenarios.push({
      width,
      height,
      frameMs: summarize(samples.frames),
      renderCpuMs: summarize(samples.cpu),
      taskMs: (metric(end, 'TaskDuration') - metric(start, 'TaskDuration')) * 1000,
      postGcHeapBytes: heap.usedSize,
      residency: await page.evaluate(() => window.__RENDER_DEBUG__.getResidency?.() ?? null),
    });
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/?debug=1&autostart=1&tutorial=0&seed=42`);
  await page.waitForFunction(() => !!window.__RENDER_DEBUG__);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', {
    samplingInterval: 262144,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
  const original = await page.evaluate(() => {
    const g = window.__GAME__;
    g.saveGame('residency-profile');
    return JSON.parse(localStorage.getItem('forestrpg.v2.save.residency-profile')).world;
  });
  const worldHash = createHash('sha256').update(JSON.stringify(original)).digest('hex');
  // Camera stress route: diagnostic positions bypass collision, at 180 world px/s.
  // Actual keyboard movement/collision is verified separately by browser regressions.
  await page.evaluate(() => {
    const g = window.__GAME__;
    g.setTimeScale(0);
    const points = [
      [20, 20],
      [130, 20],
      [130, 130],
      [20, 130],
      [20, 20],
      [130, 130],
      [20, 130],
      [130, 20],
    ];
    let segment = 0,
      distance = 0,
      previous = performance.now();
    const frames = [],
      cpu = [],
      residency = [];
    let lastSample = 0;
    window.__WORLD_PROFILE__ = {
      frames,
      cpu,
      residency,
      pausedSampling: false,
      skipNextSample: false,
      done: false,
    };
    function tick(now) {
      const profile = window.__WORLD_PROFILE__;
      if (profile.done) return;
      const dt = Math.min(50, now - previous);
      if (!profile.pausedSampling && !profile.skipNextSample) {
        frames.push(now - previous);
        cpu.push(window.__RENDER_DEBUG__.getResidency?.()?.renderCpuMs ?? 0);
      }
      profile.skipNextSample = false;
      previous = now;
      const a = points[segment % points.length],
        b = points[(segment + 1) % points.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      distance += (dt * 180) / 32000;
      const fraction = Math.min(1, distance / length);
      g.setPlayerPosition(a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction);
      if (fraction >= 1) {
        distance = 0;
        segment++;
      }
      if (now - lastSample >= 1000) {
        residency.push(window.__RENDER_DEBUG__.getResidency?.() ?? null);
        lastSample = now;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  const heap = [];
  for (let elapsed = 0; elapsed <= duration; elapsed += 60000) {
    await page.evaluate(() => {
      window.__WORLD_PROFILE__.pausedSampling = true;
    });
    const beforeGc = await cdp.send('Runtime.getHeapUsage');
    await cdp.send('HeapProfiler.collectGarbage');
    heap.push({
      elapsedMs: elapsed,
      beforeGcBytes: beforeGc.usedSize,
      ...(await cdp.send('Runtime.getHeapUsage')),
      residency: await page.evaluate(() => window.__RENDER_DEBUG__.getResidency?.() ?? null),
    });
    await page.evaluate(() => {
      window.__WORLD_PROFILE__.skipNextSample = true;
      window.__WORLD_PROFILE__.pausedSampling = false;
    });
    await writeFile(
      `${output}/checkpoints.json`,
      JSON.stringify({ scenarios: results.scenarios, heap }, null, 2),
    );
    console.info(
      `World residency profile: ${Math.round(elapsed / 1000)} / ${Math.round(duration / 1000)} seconds`,
      JSON.stringify(heap.at(-1)),
    );
    if (elapsed < duration) await page.waitForTimeout(Math.min(60000, duration - elapsed));
  }
  const samples = await page.evaluate(() => {
    const p = window.__WORLD_PROFILE__;
    p.done = true;
    return p;
  });
  const allocations = await cdp.send('HeapProfiler.stopSampling');
  const allocatedBytes = (node) =>
    node.selfSize + node.children.reduce((sum, child) => sum + allocatedBytes(child), 0);
  const finalWorld = await page.evaluate(() => {
    window.__GAME__.saveGame('residency-profile-final');
    return JSON.parse(localStorage.getItem('forestrpg.v2.save.residency-profile-final')).world;
  });
  results.route = {
    note: 'Ten-minute camera residency stress at 180 world px/s; simulation frozen to isolate rendering, real-time atmosphere continues. Forced-GC intervals excluded from frame samples. GPU figures are owned-texture estimates, not total driver memory.',
    worldHash,
    finalWorldHash: createHash('sha256').update(JSON.stringify(finalWorld)).digest('hex'),
    frameMs: summarize(samples.frames),
    renderCpuMs: summarize(samples.cpu),
    heap,
    allocations: {
      estimatedBytes: allocatedBytes(allocations.profile.head),
      samples: allocations.profile.samples.length,
      note: '262144-byte sampling interval, including subsequently collected objects; estimated allocation volume, not retained heap.',
    },
    residency: samples.residency,
    errors,
  };
  await writeFile(`${output}/performance.json`, JSON.stringify(results, null, 2));
  console.info(
    JSON.stringify(
      {
        scenarios: results.scenarios,
        route: {
          ...results.route,
          residency: {
            samples: samples.residency.length,
            maxResourceBytes: Math.max(...samples.residency.map((r) => r?.resourceBytes ?? 0)),
            maxUrgentMisses: Math.max(...samples.residency.map((r) => r?.urgentMisses ?? 0)),
          },
        },
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
