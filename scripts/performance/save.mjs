import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { openBrowser, boot, collect } from './browser.mjs';
import { analyze } from './analyze.mjs';

// Active-gameplay save cadence, separate from the GC/heap-snapshot laboratory.
const root = process.env.FOREST_PERF_OUTPUT ?? 'artifacts/performance/save';
const fixtures = JSON.parse(await readFile('artifacts/performance/fixtures/scenes.json', 'utf8'));
for (let repeat = 0; repeat < 3; repeat++) {
  const directory = root + '/' + repeat;
  await mkdir(directory, { recursive: true });
  const session = await openBrowser({ profileDir: directory + '/browser-profile' });
  const operations = [];
  try {
    await boot(session, { cap: 60, warmup: 5000 });
    await session.page.evaluate(async (position) => {
      await window.__GAME__.setGlobalPosition(position.x, position.y);
      window.__GAME__.setDaylightRatio(0.3);
    }, fixtures['42'].forest);
    await session.page.waitForTimeout(5000);
    await session.page.evaluate(() => window.__PERF__.start('active-save'));
    const result = await collect(session, directory, 30000, {
      intervalMs: 500,
      resourceEveryMs: 15000,
      sampleAction: async (_, elapsed) => {
        if (operations.length >= 10 || elapsed < operations.length * 3000) return;
        const operation = await session.page.evaluate(async () => {
          const t = performance.now();
          const ok = await window.__GAME__.saveGame('active-save');
          return { t, apiMs: performance.now() - t, ok, scene: window.__PERF__.snapshot().scene };
        });
        operations.push(operation);
        await writeFile(directory + '/operations.json', JSON.stringify(operations, null, 2));
        if (!operation.ok || operation.scene !== 'playing') throw new Error('Active save failed');
      },
      guard: (p) =>
        p.state.scene === 'playing' ? undefined : 'interrupted-scene-' + p.state.scene,
    });
    await analyze(directory);
    if (result.status !== 'complete' || operations.length !== 10)
      throw new Error('Incomplete active save test');
    console.info(JSON.stringify({ repeat, status: result.status, operations }));
  } finally {
    await session.browser.close();
  }
}
