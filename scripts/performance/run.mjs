import { openBrowser, boot, collect, checkpoint } from './browser.mjs';
import { analyze } from './analyze.mjs';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { scenarios } from './scenarios.mjs';
const output = process.env.FOREST_PERF_OUTPUT ?? 'artifacts/performance/campaign';
const mode = process.argv[2] ?? 'scenarios';
const selected = process.env.FOREST_PERF_FILTER ? new RegExp(process.env.FOREST_PERF_FILTER) : null;
const repeats = Number(process.env.FOREST_PERF_REPEATS ?? 3),
  duration = Number(process.env.FOREST_PERF_MS ?? 0);
const fixtures = JSON.parse(await readFile('artifacts/performance/fixtures/scenes.json', 'utf8'));
const cases =
  mode === 'stress'
    ? [
        {
          name: 'D-stress',
          seed: 42,
          viewport: { width: 1920, height: 1080 },
          dpr: 1,
          zoom: 2,
          cap: 60,
          route: true,
          preventDeath: true,
          weather: null,
          durationMs: 3600000,
        },
      ]
    : scenarios(fixtures).filter((s) => !selected || selected.test(s.name));
const route = JSON.parse(
  await readFile(
    process.env.FOREST_PERF_ROUTE ?? 'artifacts/performance/routes/seed-42.json',
    'utf8',
  ),
);
for (let repeat = 0; repeat < (mode === 'stress' ? 1 : repeats); repeat++)
  for (const scenario of cases) {
    if (
      mode !== 'stress' &&
      repeat >= (process.env.FOREST_PERF_REPEATS ? repeats : (scenario.repetitions ?? 3))
    )
      continue;
    const directory = output + '/' + scenario.name + '-' + repeat;
    try {
      const prior = JSON.parse(await readFile(directory + '/run.json', 'utf8'));
      if (prior.status === 'complete' && process.env.FOREST_PERF_RERUN !== '1') {
        console.info(JSON.stringify({ directory, status: 'already-complete' }));
        continue;
      }
      await rename(directory, directory + '-previous-' + Date.now());
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const session = await openBrowser({
      profileDir:
        process.env.FOREST_PERF_PROFILE_DIR ?? directory + '/browser-profile-' + Date.now(),
      browser: process.env.FOREST_PERF_BROWSER ?? 'chromium',
      headless: process.env.FOREST_HEADLESS === '1',
      viewport: scenario.viewport,
      dpr: scenario.dpr,
    });
    try {
      if (scenario.sensitivity !== undefined)
        await session.page.addInitScript((sensitivity) => {
          localStorage.setItem(
            'forestrpg.v2.settings',
            JSON.stringify({ version: 2, sensitivity }),
          );
        }, scenario.sensitivity);
      await boot(session, {
        seed: scenario.seed,
        cap: scenario.cap,
        zoom: scenario.zoom,
        warmup: 5000,
      });
      await session.page.evaluate(async (scenario) => {
        if (scenario.position)
          await window.__GAME__.setGlobalPosition(scenario.position.x, scenario.position.y);
        window.__PERF__.configure({
          maxFps: scenario.cap,
          zoom: scenario.zoom,
          weather: scenario.weather,
          clouds: scenario.clouds ?? true,
          particles: scenario.particles ?? true,
          lighting: true,
          preventDeath: scenario.preventDeath ?? false,
          gpu: scenario.gpu ?? false,
        });
        window.__GAME__.setDaylightRatio(0.3);
        if (scenario.kit) window.__PERF__.kit();
      }, scenario);
      if (scenario.fullscreen) {
        await session.page.keyboard.press('KeyF');
        await session.page.waitForTimeout(1000);
      }
      let localPoints;
      if (scenario.localRoute)
        localPoints = await session.page.evaluate(() => {
          const p = window.__GAME__.getStreamingDebug().globalPosition;
          for (const [dx, dy] of [
            [36, 0],
            [0, 36],
            [-36, 0],
            [0, -36],
          ]) {
            const route = window.__GAME__.planTravelPath(p.x + dx, p.y + dy);
            if (route.length > 8) return [p, ...route, ...route.slice(0, -1).reverse(), p];
          }
          throw new Error('No collision-valid local route for distant/seed fixture');
        });
      await session.page.waitForTimeout(5000);
      const before = await checkpoint(session, true);
      await mkdir(directory, { recursive: true });
      await writeFile(
        directory + '/scenario.json',
        JSON.stringify(
          { ...scenario, repeat, routeHash: route.hash, localPoints, before },
          null,
          2,
        ),
      );
      await session.page.evaluate(
        ({ scenario, points }) => {
          if (scenario.combat) {
            const p = window.__GAME__.getState().player;
            for (let i = 0; i < 6; i++) {
              const angle = (i * Math.PI) / 3;
              window.__GAME__.spawnEnemy(
                i % 2 ? 'maggot' : 'mantis',
                p.x + Math.cos(angle) * 5,
                p.y + Math.sin(angle) * 5,
              );
            }
          }
          window.__PERF__.start(scenario.name);
          if (scenario.route || scenario.localRoute)
            window.__PERF__.route({
              points,
              fast: scenario.fast ?? false,
              loop: !!scenario.localRoute,
            });
          else if (scenario.combat)
            window.__PERF__.route({
              points: [
                { x: 0.5, y: 0.5 },
                { x: 4.5, y: 0.5 },
                { x: 4.5, y: 4.5 },
                { x: 0.5, y: 4.5 },
              ],
              combat: true,
              loop: true,
            });
        },
        { scenario, points: localPoints ?? route.points },
      );
      const result = await collect(session, directory, duration || scenario.durationMs, {
        resourceEveryMs: mode === 'stress' ? 60000 : 30000,
        sampleAction: scenario.combatWaves
          ? async (s) =>
              s.page.evaluate(() => {
                const state = window.__GAME__.getState(),
                  p = state.player;
                const nearby = state.enemies.filter(
                  (e) => e.health > 0 && Math.hypot(e.x - p.x, e.y - p.y) < 12,
                ).length;
                for (let i = nearby; i < 6; i++) {
                  const angle = (i * Math.PI) / 3;
                  window.__GAME__.spawnEnemy(
                    i % 2 ? 'maggot' : 'mantis',
                    p.x + Math.cos(angle) * 5,
                    p.y + Math.sin(angle) * 5,
                  );
                }
              })
          : undefined,
        guard: (point) => {
          if (point.state.scene !== 'playing') return 'interrupted-scene-' + point.state.scene;
          if (point.route?.error) return 'interrupted-route-' + point.route.error;
          if (point.state.streaming?.error)
            return 'interrupted-stream-' + point.state.streaming.error;
          if (scenario.route && point.route?.finished) return 'interrupted-route-exhausted';
          if (point.visibility !== 'visible') return 'interrupted-hidden-page';
        },
      });
      await session.page.screenshot({ path: directory + '/end.png' });
      if (mode === 'stress') {
        const postGc = await checkpoint(session, true, true);
        await writeFile(directory + '/post-gc.json', JSON.stringify(postGc, null, 2));
      }
      const summary = await analyze(directory);
      if (result.status !== 'complete') process.exitCode = 1;
      if (scenario.name.startsWith('K-') && result.status === 'complete') {
        const restored = await session.page.evaluate(async () => {
          window.__GAME__.setTimeScale(0);
          const before = window.__GAME__.getStreamingDebug().globalPosition;
          const save = await window.__GAME__.saveGame('far-limit');
          const load = await window.__GAME__.loadGame('far-limit');
          return {
            before,
            save,
            load,
            after: window.__GAME__.getStreamingDebug().globalPosition,
            player: window.__GAME__.getState().player,
          };
        });
        await writeFile(directory + '/distant-restoration.json', JSON.stringify(restored, null, 2));
        if (
          !restored.save ||
          !restored.load ||
          Math.abs(restored.after.x - restored.before.x) > 1e-6 ||
          Math.abs(restored.after.y - restored.before.y) > 1e-6
        )
          throw new Error('Distant position did not survive save/reload');
      }
      console.info(
        JSON.stringify({
          name: scenario.name,
          repeat,
          status: result.status,
          frame: summary.frame,
          cpu: summary.cpu,
          longTasks: summary.longTasks.length,
        }),
      );
      if (mode === 'stress' && process.env.FOREST_PERF_TAIL_TRACE === '1') {
        const { capture } = await import('./trace.mjs');
        const index = (await session.page.evaluate(() => window.__PERF__.routeState())).index;
        await capture(session, directory + '/tail-trace', {
          label: 'late-exploration',
          durationMs: 30000,
          action: async (s) =>
            s.page.evaluate(
              (points) => window.__PERF__.route({ points }),
              route.points.slice(index),
            ),
        });
      }
    } catch (error) {
      await mkdir(directory, { recursive: true });
      await writeFile(
        directory + '/error.json',
        JSON.stringify(
          { scenario, repeat, error: error.stack, environment: session.config },
          null,
          2,
        ),
      );
      console.error(JSON.stringify({ directory, error: error.message }));
      process.exitCode = 1;
    } finally {
      await session.browser.close();
    }
  }
