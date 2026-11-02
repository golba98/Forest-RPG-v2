import { readFile, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import readline from 'node:readline';
import { summarize } from './statistics.mjs';

// Offline aggregation only. Pool recorded intervals; never average percentiles.
const root = process.argv[2] ?? 'artifacts/performance/campaign';
const runs = JSON.parse(await readFile(root + '/report-data.json', 'utf8'));
const groups = new Map();
for (const run of runs.filter((r) => r.status === 'complete')) {
  if (!groups.has(run.name)) groups.set(run.name, []);
  groups.get(run.name).push(run);
}
const results = [];
for (const [name, repeats] of groups) {
  const dt = [],
    cpu = [],
    gpu = [];
  for (const run of repeats) {
    const lines = readline.createInterface({
      input: createReadStream(run.directory + '/telemetry.jsonl.gz').pipe(createGunzip()),
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      const batch = JSON.parse(line);
      for (const frame of batch.frames) {
        if (dt.length >= 2000000) throw new Error('Offline aggregation safety bound exceeded');
        dt.push(frame.dt);
        cpu.push(frame.cpu);
      }
      for (const event of batch.events) if (event.name === 'gpu.frame') gpu.push(event.duration);
    }
  }
  const weighted = (key, count = (r) => r.frame.n) => {
    const valid = repeats.filter((r) => Number.isFinite(r[key]));
    const total = valid.reduce((n, r) => n + count(r), 0);
    return total ? valid.reduce((n, r) => n + r[key] * count(r), 0) / total : null;
  };
  const spriteWeight = (r) => r.sampledGpuFrames ?? 0;
  results.push({
    name,
    repetitions: repeats.length,
    directories: repeats.map((r) => r.directory),
    actualSeconds: repeats.reduce((n, r) => n + r.actualMs, 0) / 1000,
    frame: summarize(dt, true),
    cpu: summarize(cpu),
    gpu: summarize(gpu),
    fpsRange: [
      Math.min(...repeats.map((r) => r.frame.fps)),
      Math.max(...repeats.map((r) => r.frame.fps)),
    ],
    drawCalls: weighted('drawCalls'),
    textureBinds: weighted('binds'),
    terrainDrawCalls: weighted('terrainDrawCalls'),
    sampledSubmittedSprites: weighted('sampledSubmittedSprites', spriteWeight),
    sampledBatches: weighted('sampledBatches', spriteWeight),
    longTasks: repeats.reduce((n, r) => n + r.longTasks, 0),
    cpuAccounting: [
      'mainThreadCpuMs',
      'rendererProcessCpuMs',
      'taskElapsedMs',
      'scriptElapsedMs',
    ].reduce(
      (out, key) => {
        const valid = repeats.filter((r) => Number.isFinite(r.cpuAccounting?.[key]));
        out[key] = valid.length ? valid.reduce((n, r) => n + r.cpuAccounting[key], 0) : null;
        return out;
      },
      {
        measuredWindowMs: repeats.reduce((n, r) => n + (r.cpuAccounting?.measuredWindowMs ?? 0), 0),
      },
    ),
    errors: repeats.flatMap((r) => r.errors),
  });
}
await writeFile(root + '/pooled-results.json', JSON.stringify(results, null, 2));
const f = (n, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : '—');
const headings = [
  'Scenario',
  'Repeats',
  'Seconds',
  'Frames',
  'FPS',
  'Mean ms',
  'Median ms',
  'p95 ms',
  'p99 ms',
  'Worst ms',
  '1% low FPS',
  '>16.67 ms',
  '>33.33 ms',
];
const frameTable = [
  '| ' + headings.join(' | ') + ' |',
  '| --- | ' +
    headings
      .slice(1)
      .map(() => '---:')
      .join(' | ') +
    ' |',
  ...results.map(
    (r) =>
      '| ' +
      [
        r.name,
        r.repetitions,
        f(r.actualSeconds, 1),
        r.frame.n,
        f(r.frame.fps),
        f(r.frame.mean),
        f(r.frame.median),
        f(r.frame.p95),
        f(r.frame.p99),
        f(r.frame.worst),
        f(r.frame.low1Fps),
        r.frame.above16_67,
        r.frame.above33_33,
      ].join(' | ') +
      ' |',
  ),
].join('\n');
await writeFile(root + '/frame-table.md', frameTable + '\n');
const renderTable = [
  '| Scenario | Tick mean / p95 ms | GL draws/frame | Terrain draws/frame | Texture binds/frame | Submitted sprites/sample | Batches/sample | GPU mean / p95 ms | Long tasks |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...results.map(
    (r) =>
      '| ' +
      [
        r.name,
        f(r.cpu.mean, 3) + ' / ' + f(r.cpu.p95),
        f(r.drawCalls),
        f(r.terrainDrawCalls, 3),
        f(r.textureBinds),
        f(r.sampledSubmittedSprites, 1),
        f(r.sampledBatches, 1),
        f(r.gpu.mean, 3) + ' / ' + f(r.gpu.p95, 3),
        r.longTasks,
      ].join(' | ') +
      ' |',
  ),
].join('\n');
await writeFile(root + '/render-table.md', renderTable + '\n');
console.info(
  JSON.stringify({
    groups: results.length,
    completeRuns: runs.filter((r) => r.status === 'complete').length,
  }),
);
