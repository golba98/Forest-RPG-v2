import { openBrowser, boot, collect } from './browser.mjs';
import { analyze } from './analyze.mjs';
const root = process.env.FOREST_PERF_OUTPUT ?? 'artifacts/performance/refresh';
for (let repeat = 0; repeat < 3; repeat++)
  for (const cap of [0, 60, 120]) {
    const directory = root + '/144hz-cap' + cap + '-' + repeat;
    const session = await openBrowser({
      profileDir: directory + '/browser-profile',
      nativeLeft: 3880,
      viewport: { width: 1280, height: 720 },
    });
    try {
      await boot(session, { cap, warmup: 5000 });
      await session.page.evaluate((cap) => {
        window.__PERF__.configure({ maxFps: cap, weather: 'clear' });
        window.__PERF__.start('refresh-' + cap);
      }, cap);
      await collect(session, directory, Number(process.env.FOREST_PERF_MS ?? 45000), {
        resourceEveryMs: 45000,
      });
      const summary = await analyze(directory);
      console.info(
        JSON.stringify({ cap, repeat, frame: summary.frame, raf: summary.raf, cpu: summary.cpu }),
      );
    } finally {
      await session.browser.close();
    }
  }
