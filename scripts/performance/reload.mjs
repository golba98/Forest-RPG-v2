import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { openBrowser, boot, collect, checkpoint } from './browser.mjs';
import { analyze } from './analyze.mjs';

// Supplemental first-safe-frame capture. The original lab's five reloads proved
// restoration, but started its timing collector before autostart finished and
// therefore stopped on the loading scene. Preserve those original observations.
const root = process.env.FOREST_PERF_OUTPUT ?? 'artifacts/performance/reload';
const lab = JSON.parse(await readFile('artifacts/performance/lab/lab.json', 'utf8'));
await mkdir(root, { recursive: true });
const session = await openBrowser({ profileDir: 'artifacts/performance/lab/browser-profile' });
try {
  await boot(session, { cap: 60, warmup: 1000 });
  for (let repeat = 0; repeat < 5; repeat++) {
    const directory = root + '/' + repeat;
    await mkdir(directory, { recursive: true });
    const navigationStart = Date.now();
    await session.page.reload();
    await session.page.waitForFunction(
      () => window.__PERF__?.snapshot().scene === 'playing',
      {},
      { timeout: 60000 },
    );
    const bootstrapMs = Date.now() - navigationStart;
    await session.page.evaluate(() => {
      window.__PERF__.configure({ maxFps: 60, zoom: 2 });
      window.__PERF__.start('reload-readiness');
    });
    let operation;
    const result = await collect(session, directory, 4000, {
      resourceEveryMs: 4000,
      sampleAction: undefined,
      intervalMs: 500,
      progress: async () => {
        if (operation) return;
        operation = await session.page.evaluate(async () => {
          const t = performance.now(),
            ok = await window.__GAME__.loadGame('perflabhome');
          window.__GAME__.setTimeScale(0);
          return { t, apiMs: performance.now() - t, ok };
        });
      },
    });
    const summary = await analyze(directory);
    const fingerprint = await session.page.evaluate(() => window.__PERF__.fingerprint());
    const ready = summary.eventTimeline.find(
      (e) => e.name === 'window.firstSafeFrame' && e.t >= operation.t,
    );
    const record = {
      repeat,
      bootstrapMs,
      operation,
      runStatus: result.status,
      firstSafeFromRequestMs: ready ? ready.t + ready.duration - operation.t : null,
      fingerprintStable: fingerprint === lab.homeFingerprint,
      postGc: await checkpoint(session, true, true),
      errors: session.errors,
    };
    await writeFile(directory + '/restoration.json', JSON.stringify(record, null, 2));
    if (!record.fingerprintStable || !operation.ok || !ready || result.status !== 'complete')
      throw new Error('Reload/readiness validation failed');
    console.info(
      JSON.stringify({
        repeat,
        bootstrapMs,
        operation,
        firstSafeFromRequestMs: record.firstSafeFromRequestMs,
      }),
    );
  }
} finally {
  await session.browser.close();
}
