import { mkdir, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import { once } from 'node:events';
import { openBrowser, boot, collect, checkpoint } from './browser.mjs';
import { summarizeCpu, SourceMaps } from './source-map.mjs';
import { analyze } from './analyze.mjs';

async function saveTrace(cdp, destination) {
  const complete = once(cdp, 'Tracing.tracingComplete');
  await cdp.send('Tracing.end');
  const [{ stream }] = await complete,
    output = createWriteStream(destination);
  for (;;) {
    const part = await cdp.send('IO.read', { handle: stream, size: 262144 });
    const chunk = part.base64Encoded ? Buffer.from(part.data, 'base64') : part.data;
    if (!output.write(chunk)) await once(output, 'drain');
    if (part.eof) break;
  }
  output.end();
  await finished(output);
  await cdp.send('IO.close', { handle: stream });
}
export async function capture(
  session,
  directory,
  {
    durationMs = 20000,
    allocation = false,
    action,
    label = 'diagnostic',
    profileWorkers = true,
    detailedTrace = true,
  } = {},
) {
  await mkdir(directory, { recursive: true });
  const { cdp } = session;
  if (!cdp) throw new Error('Chromium CDP required');
  const workers = profileWorkers ? await session.workers.sessions() : [];
  if (detailedTrace)
    await cdp.send('Tracing.start', {
      categories:
        'toplevel,devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,v8,blink.user_timing,gpu,disabled-by-default-v8.gc',
      transferMode: 'ReturnAsStream',
      streamCompression: 'gzip',
    });
  if (allocation)
    await cdp.send('HeapProfiler.startSampling', {
      samplingInterval: 65536,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    });
  else {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
    await cdp.send('Profiler.start');
    for (const worker of workers) {
      await session.workers.send(worker.sessionId, 'Profiler.enable');
      await session.workers.send(worker.sessionId, 'Profiler.setSamplingInterval', {
        interval: 1000,
      });
      await session.workers.send(worker.sessionId, 'Profiler.start');
    }
  }
  const anchor = await session.page.evaluate((label) => {
    performance.mark('FOREST_TRACE_START:' + label);
    return { t: performance.now(), timeOrigin: performance.timeOrigin };
  }, label);
  await session.page.evaluate((label) => window.__PERF__.start(label), label);
  const collecting = collect(session, directory, durationMs, { resourceEveryMs: 30000 });
  let actionError;
  if (action) {
    try {
      await action(session);
    } catch (error) {
      actionError = error.message;
    }
  }
  const result = await collecting;
  let allocationProfile;
  const profiles = [];
  if (allocation) {
    const { profile } = await cdp.send('HeapProfiler.stopSampling');
    allocationProfile = profile;
  } else {
    const { profile } = await cdp.send('Profiler.stop');
    profiles.push({ name: 'main', summary: 'cpu', profile });
    for (const [index, worker] of workers.entries())
      try {
        const { profile } = await session.workers.send(worker.sessionId, 'Profiler.stop');
        profiles.push({ name: 'worker-' + index, summary: 'worker-' + index, profile });
      } catch (error) {
        await writeFile(directory + '/worker-' + index + '-error.txt', error.message);
      }
  }
  // Stop tracing before offline source-map decoding or JSON analysis adds unrelated host work.
  if (detailedTrace) await saveTrace(cdp, directory + '/trace.json.gz');
  if (allocationProfile) {
    const profile = allocationProfile;
    await writeFile(directory + '/allocation.heapprofile', JSON.stringify(profile));
    const maps = new SourceMaps(),
      rows = [];
    async function walk(node) {
      if (node.selfSize)
        rows.push({ ...(await maps.locate(node.callFrame)), estimatedBytes: node.selfSize });
      for (const child of node.children ?? []) await walk(child);
    }
    await walk(profile.head);
    rows.sort((a, b) => b.estimatedBytes - a.estimatedBytes);
    await writeFile(
      directory + '/allocation-summary.json',
      JSON.stringify(
        {
          samplingInterval: 65536,
          includesCollectedObjects: true,
          estimatedBytes: rows.reduce((n, r) => n + r.estimatedBytes, 0),
          rows,
        },
        null,
        2,
      ),
    );
  }
  for (const { name, summary, profile } of profiles) {
    await writeFile(directory + '/' + name + '.cpuprofile', JSON.stringify(profile));
    await writeFile(
      directory + '/' + summary + '-summary.json',
      JSON.stringify(await summarizeCpu(profile), null, 2),
    );
  }
  await writeFile(
    directory + '/trace-metadata.json',
    JSON.stringify(
      {
        anchor,
        actionError,
        allocation,
        heavyProfiling: true,
        profileWorkers,
        detailedTrace,
        run: result,
        beforeAfter: await checkpoint(session, false),
      },
      null,
      2,
    ),
  );
  await analyze(directory);
  return result;
}
if (process.argv[1]?.endsWith('/trace.mjs')) {
  const scene = process.argv[2] ?? 'explore',
    allocation = process.argv.includes('--allocation');
  const root =
    process.env.FOREST_PERF_OUTPUT ??
    'artifacts/performance/traces/' +
      scene +
      (allocation ? '-allocation' : '') +
      (process.argv.includes('--main-only') ? '-main-only' : '') +
      (process.argv.includes('--no-trace') ? '-no-trace' : '');
  const route = JSON.parse(
    await (
      await import('node:fs/promises')
    ).readFile('artifacts/performance/routes/seed-42.json', 'utf8'),
  );
  const session = await openBrowser({
    profileDir: root + '/browser-profile',
    headless: process.env.FOREST_HEADLESS === '1',
  });
  try {
    await boot(session, { warmup: 5000, cap: 60 });
    if (scene === 'rain') {
      await session.page.evaluate(async () => {
        await window.__GAME__.setGlobalPosition(88.5, 28.5);
        window.__PERF__.configure({ weather: 'rain', gpu: true });
      });
    }
    await session.page.waitForTimeout(5000);
    await capture(session, root, {
      allocation,
      profileWorkers: !process.argv.includes('--main-only'),
      detailedTrace: !process.argv.includes('--no-trace'),
      durationMs: Number(process.env.FOREST_PERF_MS ?? 20000),
      label: scene,
      action: async (s) => {
        if (scene === 'explore')
          await s.page.evaluate((points) => window.__PERF__.route({ points }), route.points);
        if (scene === 'combat')
          await s.page.evaluate(() => {
            window.__PERF__.kit();
            const p = window.__GAME__.getState().player;
            for (let i = 0; i < 6; i++) {
              const a = (i * Math.PI) / 3;
              window.__GAME__.spawnEnemy(
                i % 2 ? 'maggot' : 'mantis',
                p.x + Math.cos(a) * 5,
                p.y + Math.sin(a) * 5,
              );
            }
            window.__PERF__.route({
              combat: true,
              loop: true,
              points: [
                { x: 0.5, y: 0.5 },
                { x: 4.5, y: 0.5 },
                { x: 4.5, y: 4.5 },
                { x: 0.5, y: 4.5 },
              ],
            });
          });
      },
    });
  } finally {
    await session.browser.close();
  }
}
