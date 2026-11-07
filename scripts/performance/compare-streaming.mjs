import { readFile, writeFile } from 'node:fs/promises';
import { analyze } from './analyze.mjs';

const root = 'artifacts/optimization';
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const metric = (point, name) => point.metrics.find((m) => m.name === name)?.value;
const mib = (value) => value / 1048576;
const output = {};
for (const arm of ['baseline', 'optimized']) {
  output[arm] = {};
  for (const name of ['short-0', 'short-1', 'short-2', 'long']) {
    const dir = `${root}/${arm}/${name}`;
    const summary = await analyze(dir);
    const [scenario, run, post, points] = await Promise.all([
      read(dir + '/scenario.json'),
      read(dir + '/run.json'),
      read(dir + '/post-gc.json'),
      read(dir + '/checkpoints.json'),
    ]);
    const before = scenario.before;
    const last = points.at(-1);
    const range = (select) => {
      const values = points.map(select).filter(Number.isFinite);
      return {
        min: Math.min(...values),
        max: Math.max(...values),
        first: values[0],
        last: values.at(-1),
      };
    };
    output[arm][name] = {
      status: run.status,
      errors: run.errors,
      durationActualMs: run.durationActualMs,
      frame: summary.frame,
      tick: summary.cpu,
      coverage: summary.coverage,
      dropped: summary.dropped,
      sourceCache: summary.sourceCache,
      transitionAssociatedHitches: summary.slowFrames.filter((f) => f.overlappingWorldEvents.length)
        .length,
      reconstructionInstallationHitches: summary.slowFrames.filter((f) =>
        f.overlappingWorldEvents.some((e) =>
          [
            'window.buildWindow',
            'window.stageWindow',
            'transition.slice',
            'window.capture',
            'simulation.installStream',
            'window.restoreMoisture',
            'index.surfaceSites',
          ].includes(e.name),
        ),
      ).length,
      slowFrames: summary.slowFrames.map((f) => ({
        dt: f.dt,
        events: f.overlappingWorldEvents.map((e) => e.name),
      })),
      waits: Object.fromEntries(
        Object.entries(summary.counters)
          .filter(([k]) => k.startsWith('stream.wait.'))
          .map(([k, v]) => [k, v.sum]),
      ),
      phases: Object.fromEntries(
        Object.entries(summary.events).filter(([k]) =>
          /^(window\.|simulation\.installStream|index\.surfaceSites|transition\.slice|worker\.|source\.queue|storage\.compact)/.test(
            k,
          ),
        ),
      ),
      requestToSafe: summary.windowRequestToSafe,
      threadSeconds: metric(last, 'ThreadTime') - metric(before, 'ThreadTime'),
      scriptSeconds: metric(last, 'ScriptDuration') - metric(before, 'ScriptDuration'),
      longTasks: summary.longTasks,
      minutes: summary.minutes,
      transitions: last.state.streaming.transitions - before.state.streaming.transitions,
      route: last.route,
      resources: {
        naturalHeapMiB: range((p) => mib(p.heap.usedSize)),
        postGcHeapMiB: mib(post.heap.usedSize),
        beforeGcHeapMiB: mib(before.heap.usedSize),
        postGcWorkerMiB: post.workers.map((w) => mib(w.heap.usedSize)),
        residentChunks: range((p) => p.state.streaming.residentChunks),
        queuedChunks: range((p) => p.state.streaming.queuedChunks),
        deltaChunks: range((p) => p.state.deltaChunks),
        texturesMiB: range((p) => mib(p.state.renderer.residency.resourceBytes)),
        sourceEstimateMiB: range((p) => mib(p.resources.estimatedSourceBytes)),
        urgentMisses:
          last.state.renderer.residency.urgentMisses - before.state.renderer.residency.urgentMisses,
        textureEvictions:
          last.state.renderer.residency.evictions - before.state.renderer.residency.evictions,
        sprites: range((p) => p.resources.sprites),
        entities: range((p) => p.state.entities),
        processPssMiB: range((p) => mib(p.processes.reduce((sum, x) => sum + (x.pss ?? 0), 0))),
        postGcProcessPssMiB: mib(post.processes.reduce((sum, x) => sum + (x.pss ?? 0), 0)),
      },
      drawCalls: summary.counters['gl.drawElements'],
    };
    console.info(
      JSON.stringify({ arm, name, frame: summary.frame, waits: output[arm][name].waits }),
    );
  }
}
await writeFile(root + '/comparison.json', JSON.stringify(output, null, 2));
