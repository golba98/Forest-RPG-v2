import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { openBrowser, boot, collect, checkpoint } from './browser.mjs';
import { analyze } from './analyze.mjs';
const arm = process.argv[2];
if (!['baseline', 'optimized'].includes(arm)) throw new Error('Choose baseline or optimized');
const route = JSON.parse(await readFile('artifacts/performance/routes/seed-42.json', 'utf8'));
const video = process.env.FOREST_OPT_VIDEO === '1';
const cases = video
  ? [['video', 30000]]
  : [
      ['short-0', 90000],
      ['short-1', 90000],
      ['short-2', 90000],
      ['long', 600000],
    ];
for (const [name, durationMs] of cases) {
  const directory = `artifacts/optimization/${arm}/${name}`;
  await mkdir(directory, { recursive: true });
  const session = await openBrowser({
    profileDir: directory + '/browser-profile',
    viewport: { width: 1920, height: 1080 },
    dpr: 1,
    ...(video
      ? { recordVideo: { dir: directory + '/recordings', size: { width: 1280, height: 720 } } }
      : {}),
  });
  const recording = session.page.video();
  try {
    await boot(session, {
      base: 'http://localhost:4180',
      seed: 42,
      cap: 60,
      zoom: 2,
      warmup: 5000,
    });
    await session.page.evaluate(() => {
      window.__GAME__.setDaylightRatio(0.3);
      window.__PERF__.configure({
        maxFps: 60,
        zoom: 2,
        weather: null,
        gpu: false,
        preventDeath: true,
      });
    });
    await session.page.waitForTimeout(5000);
    const before = await checkpoint(session, true, true);
    await writeFile(
      directory + '/scenario.json',
      JSON.stringify(
        {
          arm,
          name,
          durationMs,
          seed: 42,
          cap: 60,
          zoom: 2,
          dpr: 1,
          routeHash: route.hash,
          before,
        },
        null,
        2,
      ),
    );
    await session.page.evaluate(
      ({ points, arm }) => {
        window.__PERF__.start('transition-' + arm);
        window.__PERF__.route({ points });
      },
      { points: route.points, arm },
    );
    const run = await collect(session, directory, durationMs, {
      resourceEveryMs: 30000,
      guard: (p) =>
        p.state.scene !== 'playing'
          ? 'interrupted-scene'
          : p.route?.error
            ? 'interrupted-route'
            : p.state.streaming?.error
              ? 'interrupted-stream'
              : undefined,
    });
    const summary = await analyze(directory);
    await session.page.screenshot({ path: directory + '/end.png' });
    await writeFile(
      directory + '/post-gc.json',
      JSON.stringify(await checkpoint(session, true, true), null, 2),
    );
    console.info(
      JSON.stringify({
        arm,
        name,
        status: run.status,
        frame: summary.frame,
        wait: summary.counters['stream.wait.fixedSteps'],
      }),
    );
    if (run.status !== 'complete' || session.errors.length)
      throw new Error('Invalid benchmark; no automatic retries');
  } finally {
    if (recording) {
      // Keep the browser connection alive until the video artifact is saved.
      // Closing a persistent context first also closes its artifact channel.
      try {
        await session.page.close();
        await recording.saveAs(directory + '/exploration.webm');
      } finally {
        await session.context.close();
      }
    } else await session.browser.close();
  }
}
