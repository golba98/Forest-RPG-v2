import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { openBrowser, boot, checkpoint } from './browser.mjs';
import { receiver } from './receiver.mjs';
import { analyze } from './analyze.mjs';
import { heapStats } from './heap-analysis.mjs';
import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';

async function heapSnapshot(cdp, file) {
  const output = createWriteStream(file);
  // CDP emits bounded chunks; snapshots are deliberately outside cadence measurements.
  const listener = ({ chunk }) => output.write(chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', listener);
  try {
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  } finally {
    cdp.off('HeapProfiler.addHeapSnapshotChunk', listener);
    output.end();
    await finished(output);
  }
  return heapStats(file);
}
const root = process.env.FOREST_PERF_OUTPUT ?? 'artifacts/performance/lab';
await mkdir(root, { recursive: true });
const session = await openBrowser({
  profileDir: root + '/browser-profile',
  headless: process.env.FOREST_HEADLESS === '1',
});
let sink;
const report = {
  method:
    'Controlled teleport/eviction laboratory. Simulation frozen except real chest interaction. Forced main+worker GC and heap snapshots; frame times are diagnostic, not gameplay benchmarks.',
  cycles: [],
  saves: [],
  loads: [],
  freshLoads: [],
};
const save = () => writeFile(root + '/lab.json', JSON.stringify(report, null, 2));
async function position(x, y, settle = 6000) {
  const result = await session.page.evaluate(
    async ({ x, y }) => {
      const start = performance.now();
      await window.__GAME__.setGlobalPosition(x, y);
      return {
        apiMs: performance.now() - start,
        position: window.__GAME__.getStreamingDebug().globalPosition,
      };
    },
    { x, y },
  );
  await session.page.waitForTimeout(settle);
  return result;
}
async function operation(kind, slot) {
  return session.page.evaluate(
    async ({ kind, slot }) => {
      const start = performance.now();
      const ok = await window.__GAME__[kind](slot);
      return {
        kind,
        slot,
        ok,
        apiMs: performance.now() - start,
        state: window.__GAME__.getState().player,
        stream: window.__GAME__.getStreamingDebug(),
      };
    },
    { kind, slot },
  );
}
try {
  await boot(session, { cap: 60, warmup: 5000 });
  await session.page.evaluate(() => window.__GAME__.setTimeScale(0));
  report.originalFingerprint = await session.page.evaluate(() => window.__PERF__.fingerprint());
  report.edit = await session.page.evaluate(() => window.__PERF__.editFixture());
  report.editedFingerprint = await session.page.evaluate(() => window.__PERF__.fingerprint());
  const chest = await session.page.evaluate(() =>
    window.__PERF__.pickups().find((p) => p.pickupType === 'chest' && p.chest?.state === 'closed'),
  );
  if (chest) {
    report.chest = { id: chest.id, variant: chest.chest.variant };
    await position(chest.x, chest.y - 0.7, 1000);
    const before = await session.page.evaluate(() => window.__GAME__.getState().player.coins);
    await session.page.evaluate(() => window.__GAME__.setTimeScale(1));
    await session.page.keyboard.press('KeyG');
    await session.page.waitForTimeout(1000);
    await session.page.evaluate(() => window.__GAME__.setTimeScale(0));
    const opened = await session.page.evaluate(
      (id) => ({
        chest: window.__PERF__.pickups().find((p) => p.id === id),
        coins: window.__GAME__.getState().player.coins,
      }),
      chest.id,
    );
    report.chest = { ...report.chest, before, ...opened };
    if (opened.chest?.chest?.state !== 'opened')
      throw new Error('Chest fixture did not open through real interaction');
  } else report.chest = { unsupported: 'No closed chest in starting window' };
  await position(0.5, 0.5, 2000);
  report.homeFingerprint = await session.page.evaluate(() => window.__PERF__.fingerprint());
  report.homePlayer = await session.page.evaluate(() => window.__GAME__.getState().player);
  report.initialSave = await operation('saveGame', 'perflabhome');
  if (!report.initialSave.ok) throw new Error('Initial laboratory save failed');
  sink = await receiver(root);
  await session.page.evaluate((url) => {
    window.__PERF__.start('eviction-save-lab');
    window.__PERF__.startPipe(url);
  }, sink.url);
  const cycles = Number(process.env.FOREST_PERF_CYCLES ?? 20);
  for (let i = 0; i < cycles; i++) {
    const started = performance.now(),
      moves = [];
    moves.push(await position(-1024.5, 768.5));
    moves.push(await position(1536.5, -1024.5));
    moves.push(await position(0.5, 0.5));
    const fingerprint = await session.page.evaluate(() => window.__PERF__.fingerprint());
    const natural = await checkpoint(session, true),
      postGc = await checkpoint(session, true, true);
    const chest = report.chest.id
      ? await session.page.evaluate(
          (id) => window.__PERF__.pickups().find((p) => p.id === id),
          report.chest.id,
        )
      : null;
    const point = {
      cycle: i,
      wallMs: performance.now() - started,
      moves,
      fingerprint,
      geographyStable: fingerprint === report.homeFingerprint,
      natural,
      postGc,
      chest,
    };
    report.cycles.push(point);
    await save();
    console.info(
      JSON.stringify({
        cycle: i,
        heap: postGc.heap,
        workers: postGc.workers,
        stable: point.geographyStable,
        renderer: postGc.state.renderer,
        streaming: postGc.state.streaming,
      }),
    );
    if (!point.geographyStable)
      throw new Error('Baseline/removed-object geography changed on revisit');
    if (report.chest.id && chest?.chest?.state !== 'opened')
      throw new Error('Opened chest state resurrected after eviction');
    if (i === 2 && session.cdp)
      report.beforeHeap = await heapSnapshot(session.cdp, root + '/before.heapsnapshot');
  }
  if (session.cdp) report.afterHeap = await heapSnapshot(session.cdp, root + '/after.heapsnapshot');
  for (let i = 0; i < 10; i++) {
    report.saves.push(await operation('saveGame', 'perflab-current'));
    await session.page.waitForTimeout(1000);
    report.loads.push(await operation('loadGame', 'perflabhome'));
    await session.page.evaluate(() => window.__GAME__.setTimeScale(0));
    await session.page.waitForTimeout(1000);
  }
  report.finalFingerprint = await session.page.evaluate(() => window.__PERF__.fingerprint());
  report.finalPlayer = await session.page.evaluate(() => window.__GAME__.getState().player);
  if (report.finalFingerprint !== report.homeFingerprint)
    throw new Error('Reload changed edited home geography');
  if (report.finalPlayer.coins !== report.homePlayer.coins)
    throw new Error('Reload duplicated or lost chest reward');
  await session.page.evaluate(async () => {
    window.__PERF__.stop();
    await window.__PERF__.flushPipe();
  });
  await sink.close();
  report.telemetry = sink.stats();
  sink = null;
  report.summary = await analyze(root);
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    await session.page.reload();
    await session.page.waitForFunction(
      () => window.__PERF__?.snapshot().scene === 'playing',
      {},
      { timeout: 60000 },
    );
    const bootstrapMs = performance.now() - start;
    await session.page.evaluate(() => {
      window.__PERF__.configure({ maxFps: 60, zoom: 2 });
      window.__PERF__.start('fresh-load');
    });
    const loaded = await operation('loadGame', 'perflabhome');
    await session.page.evaluate(() => window.__GAME__.setTimeScale(0));
    await session.page.waitForTimeout(1000);
    const readiness = await session.page.evaluate(() => {
      window.__PERF__.stop();
      const batch = window.__PERF__.drain();
      return batch.events.filter(
        (e) =>
          e.name === 'window.firstSafeFrame' ||
          e.name === 'window.installed' ||
          e.name === 'save.load.wall' ||
          e.name === 'simulation.restoreInfinite',
      );
    });
    report.freshLoads.push({
      bootstrapMs,
      ...loaded,
      readiness,
      postGc: await checkpoint(session, true, true),
      fingerprint: await session.page.evaluate(() => window.__PERF__.fingerprint()),
    });
    await save();
  }
  report.errors = session.errors;
  report.environment = session.config;
  report.status = 'complete';
  await save();
  await session.page.screenshot({ path: root + '/restored-home.png' });
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  await save();
  throw error;
} finally {
  if (sink) await sink.close();
  await session.browser.close();
}
