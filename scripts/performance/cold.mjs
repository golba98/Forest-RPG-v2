import { openBrowser, checkpoint } from './browser.mjs';
import { receiver } from './receiver.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { analyze } from './analyze.mjs';
const root = process.env.FOREST_PERF_OUTPUT ?? 'artifacts/performance/cold';
for (let repeat = 0; repeat < 3; repeat++) {
  const directory = root + '/' + repeat;
  await mkdir(directory, { recursive: true });
  const session = await openBrowser({ profileDir: directory + '/browser-profile' });
  let sink;
  try {
    await session.page.addInitScript(() => {
      const timing = { documentStart: performance.now(), timeOrigin: performance.timeOrigin };
      window.__COLD_START__ = timing;
      function check() {
        const r = window.__RENDER_DEBUG__?.getResidency();
        if (r && r.visibleChunks > 0 && r.queuedChunks === 0 && r.stagingBytes === 0) {
          timing.firstPreparedObserved = performance.now();
          timing.navigation = performance.getEntriesByType('navigation')[0]?.toJSON();
        } else requestAnimationFrame(check);
      }
      requestAnimationFrame(check);
    });
    // Keep bootstrap collection active through initial terrain preparation.
    // The ordinary boot helper deliberately stops it before a warmed scenario.
    await session.page.goto('http://localhost:4177/?debug=1&profile=1&autostart=1&seed=42');
    await session.page.waitForFunction(() => !!window.__PERF__, {}, { timeout: 60000 });
    await session.page.evaluate(() =>
      window.__PERF__.configure({ maxFps: 60, zoom: 'auto', weather: 'clear' }),
    );
    await session.page.waitForFunction(
      () => window.__COLD_START__?.firstPreparedObserved,
      {},
      { timeout: 60000 },
    );
    sink = await receiver(directory);
    await session.page.evaluate(async (url) => {
      window.__PERF__.stop();
      window.__PERF__.startPipe(url);
      await window.__PERF__.flushPipe();
    }, sink.url);
    await sink.close();
    const transport = sink.stats();
    sink = null;
    const metadata = {
      repeat,
      method:
        'Fresh on-disk profile; bootstrap telemetry retained; first prepared terrain observed by an external rAF poll (one callback of observation uncertainty). Timings include local asset fetch/decode and initialization.',
      environment: session.config,
      errors: session.errors,
      transport,
      timing: await session.page.evaluate(() => window.__COLD_START__),
      checkpoint: await checkpoint(session, true),
    };
    await writeFile(directory + '/cold.json', JSON.stringify(metadata, null, 2));
    await analyze(directory);
    console.info(JSON.stringify(metadata.timing));
  } finally {
    if (sink) await sink.close();
    await session.browser.close();
  }
}
