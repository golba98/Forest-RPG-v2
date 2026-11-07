import { mkdir, writeFile } from 'node:fs/promises';
import { openBrowser, boot, checkpoint } from './browser.mjs';
import { receiver } from './receiver.mjs';

// Native-process follow-up: no heap snapshots and no per-cycle world hashing.
// Baseline runs longer to establish whether ordinary production memory plateaus.
const root = process.env.FOREST_PERF_OUTPUT ?? 'artifacts/performance/retention';
for (const [arm, cycles, profile] of [
  ['baseline', 60, false],
  ['profile-on', 20, true],
]) {
  const directory = root + '/' + arm;
  await mkdir(directory, { recursive: true });
  const session = await openBrowser({ profileDir: directory + '/browser-profile' });
  const report = {
    arm,
    cyclesRequested: cycles,
    method:
      'Frozen three-region eviction cycles, six-second settles; no heap snapshots or repeated world hashes. Four warmup cycles, three-minute idle before/after. Forced main/worker GC at checkpoints. Baseline uses inherited uninstrumented production build; profile arm uses active bounded telemetry.',
    warmup: [],
    idleBefore: [],
    cycles: [],
    idleAfter: [],
  };
  let sink;
  const save = () => writeFile(directory + '/retention.json', JSON.stringify(report, null, 2));
  async function cycle() {
    for (const [x, y] of [
      [-1024.5, 768.5],
      [1536.5, -1024.5],
      [0.5, 0.5],
    ]) {
      await session.page.evaluate(({ x, y }) => window.__GAME__.setGlobalPosition(x, y), { x, y });
      await session.page.waitForTimeout(6000);
    }
    const point = await checkpoint(session, true, true);
    if (point.state.streaming?.error || point.state.streaming?.residentChunks !== 64)
      throw new Error('Retention fixture did not settle');
    return point;
  }
  async function idle(destination) {
    for (let seconds = 0; seconds <= 180; seconds += 60) {
      if (seconds) await session.page.waitForTimeout(60000);
      destination.push({ seconds, ...(await checkpoint(session, true, true)) });
      await save();
      console.info(
        JSON.stringify({
          arm,
          idle: destination === report.idleBefore ? 'before' : 'after',
          seconds,
        }),
      );
    }
  }
  try {
    await boot(session, {
      profile,
      base: profile ? 'http://localhost:4177' : 'http://localhost:4176',
      cap: 60,
      zoom: 2,
      warmup: 5000,
    });
    await session.page.evaluate(() => {
      window.__GAME__.setTimeScale(0);
      window.__GAME__.setDaylightRatio(0.3);
      window.__RENDER_DEBUG__.setWeatherPreview('clear');
    });
    if (profile) {
      sink = await receiver(directory);
      await session.page.evaluate((url) => {
        window.__PERF__.start('native-retention');
        window.__PERF__.startPipe(url);
      }, sink.url);
    }
    for (let i = 0; i < 4; i++) report.warmup.push(await cycle());
    await idle(report.idleBefore);
    for (let i = 0; i < cycles; i++) {
      const point = await cycle();
      report.cycles.push({ cycle: i, ...point });
      await save();
      console.info(
        JSON.stringify({
          arm,
          cycle: i,
          mainHeap: point.heap.usedSize,
          pss: point.processes.reduce((n, p) => n + (p.pss ?? 0), 0),
        }),
      );
    }
    await idle(report.idleAfter);
    if (profile) {
      await session.page.evaluate(async () => {
        window.__PERF__.stop();
        await window.__PERF__.flushPipe();
      });
      await sink.close();
      report.telemetry = sink.stats();
      sink = null;
    }
    report.environment = session.config;
    report.errors = session.errors;
    report.status = 'complete';
    await save();
  } catch (error) {
    report.status = 'failed';
    report.error = error.stack;
    await save();
    throw error;
  } finally {
    if (sink) await sink.close();
    await session.browser.close();
  }
}
