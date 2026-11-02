import { receiver } from './receiver.mjs';
import { openBrowser, boot } from './browser.mjs';
import { summarize } from './statistics.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const output = process.env.FOREST_PERF_OUTPUT ?? 'artifacts/performance/calibration';
const duration = Number(process.env.FOREST_PERF_MS ?? 60000),
  repeats = Number(process.env.FOREST_PERF_REPEATS ?? 3);
await mkdir(output, { recursive: true });
const results = [];
for (let repeat = 0; repeat < repeats; repeat++)
  for (const mode of [
    ['baseline', 'profile-off', 'profile-on'],
    ['profile-on', 'baseline', 'profile-off'],
    ['profile-off', 'profile-on', 'baseline'],
  ][repeat % 3])
    for (const moving of [false, true]) {
      const session = await openBrowser({ headless: process.env.FOREST_HEADLESS === '1' });
      try {
        await boot(session, {
          base: mode === 'baseline' ? 'http://localhost:4176' : 'http://localhost:4177',
          profile: mode === 'profile-on',
          cap: 0,
          warmup: 5000,
        });
        await session.page.evaluate(() => {
          // Same public settings path and cap for both builds; no simulation-speed modification.
          const settings = JSON.parse(localStorage.getItem('forestrpg.v2.settings') ?? '{}');
          settings.maxFps = 0;
          localStorage.setItem('forestrpg.v2.settings', JSON.stringify(settings));
        });
        // Settings are applied at boot, so restart with the chosen cap in the same isolated context.
        await session.page.reload();
        await session.page.waitForFunction(
          () => !!window.__GAME__?.getStreamingDebug(),
          {},
          { timeout: 60000 },
        );
        await session.page.evaluate((on) => {
          window.__RENDER_DEBUG__.setZoom(2);
          if (window.__PERF__) {
            window.__PERF__.configure({ maxFps: 0, zoom: 2, weather: 'clear' });
            if (on) window.__PERF__.start('calibration');
            else window.__PERF__.stop();
          }
        }, mode === 'profile-on');
        await session.page.waitForTimeout(5000);
        const sink =
          mode === 'profile-on'
            ? await receiver(output + '/' + repeat + '-' + mode + '-' + moving)
            : null;
        if (sink) await session.page.evaluate((url) => window.__PERF__.startPipe(url), sink.url);
        const startMetrics = (await session.cdp.send('Performance.getMetrics')).metrics;
        const collected = await session.page.evaluate(
          ({ duration, moving }) =>
            new Promise((resolve) => {
              const frames = [],
                cpu = [];
              let last = 0,
                first = 0,
                previousKey = '';
              function step(now) {
                if (!first) first = now;
                if (last) {
                  frames.push(now - last);
                  cpu.push(window.__RENDER_DEBUG__.getResidency()?.renderCpuMs ?? 0);
                }
                last = now;
                const key = moving
                  ? ['KeyD', 'KeyS', 'KeyA', 'KeyW'][Math.floor((now - first) / 640) % 4]
                  : '';
                if (key !== previousKey) {
                  if (previousKey)
                    dispatchEvent(new KeyboardEvent('keyup', { code: previousKey, bubbles: true }));
                  if (key)
                    dispatchEvent(new KeyboardEvent('keydown', { code: key, bubbles: true }));
                  previousKey = key;
                }
                if (now - first >= duration) {
                  if (previousKey)
                    dispatchEvent(new KeyboardEvent('keyup', { code: previousKey, bubbles: true }));
                  resolve({ frames, cpu, elapsed: now - first });
                } else requestAnimationFrame(step);
              }
              requestAnimationFrame(step);
            }),
          { duration, moving },
        );

        const endMetrics = (await session.cdp.send('Performance.getMetrics')).metrics;
        const metric = (xs, key) => xs.find((v) => v.name === key)?.value ?? 0;
        const result = {
          repeat,
          mode,
          moving,
          browser: session.config.browserVersion,
          frame: summarize(collected.frames, true),
          renderCpu: summarize(collected.cpu),
          elapsed: collected.elapsed,
          taskMs:
            (metric(endMetrics, 'TaskDuration') - metric(startMetrics, 'TaskDuration')) * 1000,
          scriptMs:
            (metric(endMetrics, 'ScriptDuration') - metric(startMetrics, 'ScriptDuration')) * 1000,
          config: session.config,
          errors: session.errors,
          environment: await session.page.evaluate(() => ({
            dpr: devicePixelRatio,
            width: innerWidth,
            height: innerHeight,
            screenX,
            screenY,
            screenWidth: screen.width,
            gameFps: window.__GAME__.getState().engine.actualFps,
            visibility: document.visibilityState,
          })),
        };
        if (sink) {
          await session.page.evaluate(async () => {
            window.__PERF__.stop();
            await window.__PERF__.flushPipe();
          });
          await sink.close();
          result.telemetry = sink.stats();
        }
        results.push(result);
        await writeFile(output + '/results.json', JSON.stringify(results, null, 2));
        console.info(JSON.stringify(result));
      } finally {
        await session.browser.close();
      }
    }
