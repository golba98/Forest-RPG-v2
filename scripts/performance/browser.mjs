import { receiver } from './receiver.mjs';
import { WorkerSessions } from './worker-sessions.mjs';
import { chromium, firefox } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

export async function openBrowser(options = {}) {
  const engine = options.browser ?? 'chromium';
  const launch = {
    headless: options.headless ?? false,
    args:
      engine === 'chromium'
        ? [
            '--use-gl=angle',
            '--use-angle=gl',
            '--enable-webgl',
            '--ignore-gpu-blocklist',
            '--no-sandbox',
            '--mute-audio',
            `--window-position=${options.nativeLeft ?? 1960},40`,
            '--ozone-platform=x11',
          ]
        : [],
    ...(engine === 'firefox' ? { firefoxUserPrefs: { 'media.volume_scale': '0.0' } } : {}),
  };
  const type = engine === 'chromium' ? chromium : firefox;
  const executionLaunch =
    engine === 'firefox' ? { ...launch, env: { ...process.env, MOZ_ENABLE_WAYLAND: '0' } } : launch;
  const view = {
    viewport: options.viewport ?? { width: 1920, height: 1080 },
    deviceScaleFactor: options.dpr ?? 1,
    ...(options.recordVideo ? { recordVideo: options.recordVideo } : {}),
  };
  let browser, context;
  if (options.profileDir) {
    await mkdir(options.profileDir, { recursive: true });
    context = await type.launchPersistentContext(options.profileDir, {
      ...executionLaunch,
      ...view,
    });
    browser = context.browser();
    if (!browser) throw new Error('Persistent browser unavailable');
  } else {
    browser = await type.launch(executionLaunch);
    context = await browser.newContext(view);
  }
  const page = context.pages()[0] ?? (await context.newPage()),
    errors = [];
  page.on('pageerror', (e) => errors.push({ at: Date.now(), message: e.message }));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push({ at: Date.now(), message: m.text() });
  });
  const cdp = engine === 'chromium' ? await context.newCDPSession(page) : null;
  const browserCdp = engine === 'chromium' ? await browser.newBrowserCDPSession() : null;
  let nativeWindow;
  if (engine === 'firefox' && !launch.headless) {
    const title = 'FOREST_PERF_WINDOW_' + Date.now();
    await page.evaluate((title) => {
      document.title = title;
    }, title);
    try {
      execFileSync('wmctrl', ['-r', title, '-e', `0,${options.nativeLeft ?? 1960},40,1480,910`]);
      nativeWindow = {
        title,
        layout: execFileSync('wmctrl', ['-l', '-G'], { encoding: 'utf8' })
          .split('\n')
          .find((line) => line.includes(title)),
      };
    } catch (error) {
      nativeWindow = { error: error.message };
    }
  }
  if (cdp) {
    await cdp.send('Performance.enable');
    if (!launch.headless) {
      const before = await cdp.send('Browser.getWindowForTarget');
      await browserCdp.send('Browser.setWindowBounds', {
        windowId: before.windowId,
        bounds: { windowState: 'normal' },
      });
      await browserCdp.send('Browser.setWindowBounds', {
        windowId: before.windowId,
        bounds: {
          left: options.nativeLeft ?? 1960,
          top: 40,
          width: Math.min((options.viewport?.width ?? 1440) + 40, 1800),
          height: Math.min((options.viewport?.height ?? 810) + 100, 1000),
        },
      });
      nativeWindow = await cdp.send('Browser.getWindowForTarget');
    }
  }
  const cadence = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const times = [];
        let previous = 0;
        const tick = (t) => {
          if (previous) times.push(t - previous);
          previous = t;
          if (times.length < 120) requestAnimationFrame(tick);
          else resolve(times);
        };
        requestAnimationFrame(tick);
      }),
  );

  const config = {
    ...options,
    nativeWindow,
    emptyPageCadenceMs: cadence,
    storageMode: options.profileDir ? 'persistent-on-disk' : 'isolated-incognito',
    browserVersion: browser.version(),
    launch,
    started: new Date().toISOString(),
    cpu: os.cpus()[0]?.model,
    load: os.loadavg(),
  };
  return {
    browser,
    context,
    page,
    cdp,
    browserCdp,
    workers: browserCdp ? new WorkerSessions(browserCdp) : null,
    errors,
    config,
  };
}
export async function boot(session, options = {}) {
  const base = options.base ?? 'http://localhost:4177',
    profile = options.profile !== false;
  await session.page.goto(
    base +
      '/?debug=1&profile=' +
      (profile ? '1' : '0') +
      '&autostart=1&seed=' +
      (options.seed ?? 42),
  );
  await session.page.waitForFunction(
    () => !!window.__GAME__?.getStreamingDebug(),
    {},
    { timeout: 60000 },
  );
  if (profile) await session.page.waitForFunction(() => !!window.__PERF__, {}, { timeout: 30000 });
  await session.page.evaluate(
    ({ profile, cap, zoom }) => {
      if (profile) {
        window.__PERF__.stop();
        window.__PERF__.configure({
          maxFps: cap,
          zoom,
          weather: 'clear',
          clouds: true,
          particles: true,
        });
      } else window.__RENDER_DEBUG__.setZoom(zoom);
    },
    { profile, cap: options.cap ?? 0, zoom: options.zoom ?? 2 },
  );
  await session.page.locator('#game-canvas').click();
  await session.page.waitForTimeout(options.warmup ?? 10000);
}
export async function checkpoint(session, resources = true, gc = false) {
  const { page, cdp, browserCdp } = session;
  if (gc && cdp) await cdp.send('HeapProfiler.collectGarbage');
  const data = await page.evaluate(
    (resources) => ({
      t: performance.now(),
      visibility: document.visibilityState,
      focused: document.hasFocus(),
      capabilities: resources
        ? {
            longTasks: PerformanceObserver.supportedEntryTypes.includes('longtask'),
            userAgentMemory: typeof performance.measureUserAgentSpecificMemory === 'function',
            crossOriginIsolated: window.crossOriginIsolated,
            userAgent: navigator.userAgent,
          }
        : undefined,
      dpr: devicePixelRatio,
      width: innerWidth,
      height: innerHeight,
      screen: { x: screenX, y: screenY, width: screen.width, height: screen.height },
      nativeFullscreen: !!document.fullscreenElement,
      framebuffer: (() => {
        const gl = document.querySelector('canvas')?.getContext('webgl2');
        return gl ? { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight } : null;
      })(),
      ...(resources
        ? (() => {
            const s = window.__GAME__?.getState();
            return {
              camera: s?.camera,
              actorConditions: s
                ? {
                    playerHealth: s.player.health,
                    nearbyEnemies: s.enemies
                      .filter(
                        (e) => e.health > 0 && Math.hypot(e.x - s.player.x, e.y - s.player.y) < 12,
                      )
                      .map((e) => ({
                        id: e.id,
                        type: e.type,
                        state: e.state,
                        isAggro: e.isAggro,
                        distance: Math.hypot(e.x - s.player.x, e.y - s.player.y),
                      })),
                  }
                : undefined,
            };
          })()
        : {}),
      state: window.__PERF__?.snapshot() ?? {
        streaming: window.__GAME__?.getStreamingDebug(),
        renderer: window.__RENDER_DEBUG__?.getResidency(),
      },
      resources: resources ? window.__PERF__?.resources() : undefined,
      route: window.__PERF__?.routeState(),
    }),
    resources,
  );
  if (cdp) {
    data.heap = await cdp.send('Runtime.getHeapUsage');
    data.metrics = (await cdp.send('Performance.getMetrics')).metrics;
  }
  if (session.workers) {
    try {
      data.workers = await session.workers.heaps(gc);
    } catch (error) {
      data.workerError = error.message;
    }
  }
  if (browserCdp) {
    try {
      const processes = (await browserCdp.send('SystemInfo.getProcessInfo')).processInfo;
      data.processes = [];
      for (const p of processes) {
        try {
          const text = await readFile('/proc/' + p.id + '/smaps_rollup', 'utf8');
          const number = (key) =>
            Number(text.match(new RegExp('^' + key + ':\\s+(\\d+)', 'm'))?.[1] ?? 0) * 1024;
          const stat = (await readFile('/proc/' + p.id + '/stat', 'utf8'))
            .replace(/^.*\) /, '')
            .split(' ');
          data.processes.push({
            ...p,
            rss: number('Rss'),
            pss: number('Pss'),
            anonymous: number('Anonymous'),
            privateDirty: number('Private_Dirty'),
            pssAnon: number('Pss_Anon'),
            pssFile: number('Pss_File'),
            pssShmem: number('Pss_Shmem'),
            minorFaults: Number(stat[7]),
            majorFaults: Number(stat[9]),
            userTicks: Number(stat[11]),
            systemTicks: Number(stat[12]),
            nice: Number(stat[16]),
          });
        } catch {
          data.processes.push(p);
        }
      }
    } catch (error) {
      data.processError = error.message;
    }
  }
  data.hostLoad = os.loadavg();
  return data;
}
export async function collect(
  session,
  directory,
  durationMs,
  { intervalMs = 5000, resourceEveryMs = 60000, progress, guard, sampleAction } = {},
) {
  await mkdir(directory, { recursive: true });
  const sink = await receiver(directory);
  await session.page.evaluate((url) => window.__PERF__.startPipe(url), sink.url);
  const checkpoints = [],
    started = Date.now();
  let lastResource = -Infinity,
    status = 'complete';
  try {
    for (;;) {
      const elapsed = Date.now() - started;
      if (elapsed - lastResource >= resourceEveryMs || elapsed >= durationMs) {
        const point = await checkpoint(session, true);
        point.elapsedMs = elapsed;
        checkpoints.push(point);
        lastResource = elapsed;
        await writeFile(directory + '/checkpoints.json', JSON.stringify(checkpoints, null, 2));
        if (progress) await progress(point, elapsed);
        else
          console.info(
            JSON.stringify({
              directory,
              elapsedMs: elapsed,
              position: point.state.streaming?.globalPosition,
              heap: point.heap?.usedSize,
              route: point.route,
              scene: point.state.scene,
            }),
          );
        if (guard) {
          const reason = await guard(point);
          if (reason) {
            status = reason;
            break;
          }
        }
      }
      if (elapsed >= durationMs) break;
      await session.page.waitForTimeout(Math.min(intervalMs, durationMs - elapsed));
      if (sampleAction) await sampleAction(session, Date.now() - started);
    }
    await session.page.evaluate(async () => {
      window.__PERF__.stopRoute();
      window.__PERF__.stop();
      await window.__PERF__.flushPipe();
    });
  } finally {
    await sink.close();
  }
  if (sink.stats().failure || sink.stats().packets === 0) status = 'invalid-telemetry';
  const clientTelemetry = await session.page.evaluate(() => {
    const s = window.__PERF__.snapshot();
    return { transport: s.transport, collector: s.collector };
  });
  if (clientTelemetry.transport.failed || clientTelemetry.collector.dropped)
    status = 'invalid-telemetry';
  const result = {
    ...session.config,
    telemetry: sink.stats(),
    clientTelemetry,
    durationRequestedMs: durationMs,
    durationActualMs: Date.now() - started,
    status,
    errors: session.errors,
    checkpoints,
  };
  await writeFile(directory + '/run.json', JSON.stringify(result, null, 2));
  return result;
}
