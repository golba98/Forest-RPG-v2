import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.argv[2] ?? 'artifacts/performance/campaign';
const rows = [];
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (/-previous-\d+$/.test(entry.name)) continue;
  const directory = path.join(root, entry.name);
  try {
    const run = JSON.parse(await readFile(directory + '/run.json', 'utf8')),
      summary = JSON.parse(await readFile(directory + '/summary.json', 'utf8')),
      scenario = JSON.parse(await readFile(directory + '/scenario.json', 'utf8'));
    const checkpoints = run.checkpoints,
      values = (fn) => checkpoints.map(fn).filter(Number.isFinite),
      range = (xs) =>
        xs.length
          ? { min: Math.min(...xs), max: Math.max(...xs), first: xs[0], last: xs.at(-1) }
          : null;
    const firstMetrics = Object.fromEntries(
        (checkpoints[0]?.metrics ?? []).map((m) => [m.name, m.value]),
      ),
      lastMetrics = Object.fromEntries(
        (checkpoints.at(-1)?.metrics ?? []).map((m) => [m.name, m.value]),
      ),
      metricWindowMs = (checkpoints.at(-1)?.t ?? 0) - (checkpoints[0]?.t ?? 0);
    const deltaMs = (key) =>
      Number.isFinite(firstMetrics[key]) && Number.isFinite(lastMetrics[key])
        ? (lastMetrics[key] - firstMetrics[key]) * 1000
        : null;
    rows.push({
      directory,
      name: scenario.name,
      repeat: scenario.repeat,
      status: run.status,
      requestedMs: run.durationRequestedMs,
      actualMs: run.durationActualMs,
      frame: summary.frame,
      cpu: summary.cpu,
      raf: summary.raf,
      cpuAccounting: {
        measuredWindowMs: metricWindowMs,
        mainThreadCpuMs: deltaMs('ThreadTime'),
        rendererProcessCpuMs: deltaMs('ProcessTime'),
        taskElapsedMs: deltaMs('TaskDuration'),
        scriptElapsedMs: deltaMs('ScriptDuration'),
      },
      memory: {
        mainHeap: range(values((p) => p.heap?.usedSize)),
        workerHeap: range(values((p) => p.workers?.reduce((n, w) => n + w.heap.usedSize, 0))),
        browserPss: range(values((p) => p.processes?.reduce((n, x) => n + (x.pss ?? 0), 0))),
        browserRss: range(values((p) => p.processes?.reduce((n, x) => n + (x.rss ?? 0), 0))),
      },
      resident: range(values((p) => p.state.streaming?.residentChunks)),
      pending: range(values((p) => p.state.streaming?.queuedChunks)),
      entities: range(values((p) => p.state.entities)),
      enemies: range(values((p) => p.state.liveEnemies)),
      sprites: range(values((p) => p.resources?.sprites)),
      textures: range(values((p) => p.resources?.estimatedSourceBytes)),
      gpu: summary.gpu?.n ? summary.gpu : summary.events['gpu.frame'],
      drawCalls: [
        'drawElements',
        'drawArrays',
        'drawElementsInstanced',
        'drawArraysInstanced',
      ].reduce((n, name) => n + (summary.counters['gl.' + name]?.mean ?? 0), 0),
      binds: summary.counters['gl.bindTexture']?.mean ?? 0,
      terrainDrawCalls: [
        'drawElements',
        'drawArrays',
        'drawElementsInstanced',
        'drawArraysInstanced',
      ].reduce((n, name) => n + (summary.counters['terrain.gl.' + name]?.mean ?? 0), 0),
      sampledGpuFrames: summary.counters['sampled.gpu.frames']?.sum ?? 0,
      sampledSubmittedSprites: summary.counters['sampled.gpu.frames']?.sum
        ? (summary.counters['sampled.batch.sprites']?.sum ?? 0) /
          summary.counters['sampled.gpu.frames'].sum
        : null,
      sampledBatches: summary.counters['sampled.gpu.frames']?.sum
        ? (summary.counters['sampled.batch.batches']?.sum ?? 0) /
          summary.counters['sampled.gpu.frames'].sum
        : null,
      preparation: summary.windowRequestToSafe,
      worker: summary.events['worker.executeMs'],
      queue: summary.events['source.queue'],
      integration: summary.events['simulation.installStream'],
      longTasks: summary.events['longtask']?.n ?? 0,
      transport: run.telemetry,
      errors: run.errors,
      final: checkpoints.at(-1),
    });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
rows.sort((a, b) => a.name.localeCompare(b.name) || a.repeat - b.repeat);
await writeFile(root + '/report-data.json', JSON.stringify(rows, null, 2));
console.info(
  rows
    .map(
      (r) =>
        `${r.name}\t${r.repeat}\t${r.status}\t${r.frame.fps?.toFixed(2)}\t${r.frame.p95?.toFixed(2)}\t${r.frame.p99?.toFixed(2)}\t${r.frame.worst?.toFixed(2)}\t${r.cpu.mean?.toFixed(3)}`,
    )
    .join('\n'),
);
