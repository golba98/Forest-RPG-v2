import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import readline from 'node:readline';
import { summarize, Histogram } from './statistics.mjs';
export async function analyze(directory) {
  const frames = [],
    cpu = [],
    rafs = [],
    stages = new Map(),
    stageCalls = new Map(),
    counters = new Map(),
    events = new Map();
  const longTasks = [],
    gpuSamples = [],
    slowFrames = [],
    minutes = new Map(),
    eventTimeline = [],
    eventPeriods = new Map();
  let dropped = {},
    first = Infinity,
    last = 0,
    previousFrame;
  const coverage = { frameGapEvents: 0, missingIntervalMs: 0, largestGapMs: 0 };
  const generatedAddresses = new Set(),
    sourceCache = {
      readyEvents: 0,
      distinctGeneratedAddresses: 0,
      regenerationsObserved: 0,
      maxPendingAtDispatch: 0,
      maxResidentAtDispatch: 0,
      hits: 0,
      evictions: 0,
    };
  const get = (map, key) => {
    if (!map.has(key)) map.set(key, new Histogram());
    return map.get(key);
  };
  const input = readline.createInterface({
    input: createReadStream(directory + '/telemetry.jsonl.gz').pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of input) {
    const batch = JSON.parse(line);
    dropped = batch.dropped;
    for (const f of batch.frames) {
      if (previousFrame) {
        const gap = f.t - previousFrame.t - f.dt;
        if (gap > 0.001) {
          coverage.frameGapEvents++;
          coverage.missingIntervalMs += gap;
          coverage.largestGapMs = Math.max(coverage.largestGapMs, gap);
        }
      }
      if (frames.length >= 2000000) throw new Error('Offline sample safety bound exceeded');
      frames.push(f.dt);
      cpu.push(f.cpu);
      first = Math.min(first, f.t);
      last = f.t;
      const minute = Math.floor((f.t - batch.startedAt) / 60000);
      if (!minutes.has(minute)) minutes.set(minute, { dt: [], cpu: [] });
      const m = minutes.get(minute);
      m.dt.push(f.dt);
      m.cpu.push(f.cpu);
      for (let i = 0; i < f.stages.length; i += 4) {
        const name = batch.names[f.stages[i]];
        stageCalls.set(name, (stageCalls.get(name) ?? 0) + f.stages[i + 3]);
        get(stages, name + '.inclusive').add(f.stages[i + 1]);
        get(stages, name + '.self').add(f.stages[i + 2]);
      }
      for (let i = 0; i < f.counts.length; i += 2)
        get(counters, batch.names[f.counts[i]]).add(f.counts[i + 1]);
      if (f.dt > 33.33) {
        slowFrames.push({
          ...f,
          previousCpu: previousFrame?.cpu,
          previousStages: previousFrame?.stages,
          names: batch.names,
        });
        if (slowFrames.length > 100) slowFrames.sort((a, b) => b.dt - a.dt).length = 100;
      }
      previousFrame = f;
    }
    for (const [, dt] of batch.rafs) {
      if (rafs.length < 2000000) rafs.push(dt);
    }
    for (const event of batch.events) {
      get(events, event.name).add(event.duration);
      if (event.name === 'source.ready') {
        sourceCache.readyEvents++;
        if (generatedAddresses.has(event.detail.key)) sourceCache.regenerationsObserved++;
        generatedAddresses.add(event.detail.key);
      }
      if (event.name === 'source.hit') sourceCache.hits++;
      if (event.name === 'source.evicted') sourceCache.evictions++;
      if (event.name === 'source.queue') {
        sourceCache.maxPendingAtDispatch = Math.max(
          sourceCache.maxPendingAtDispatch,
          event.detail.pending,
        );
        sourceCache.maxResidentAtDispatch = Math.max(
          sourceCache.maxResidentAtDispatch,
          event.detail.resident,
        );
      }
      if (event.name === 'gpu.frame' && gpuSamples.length < 100000) gpuSamples.push(event.duration);
      const period = Math.floor((event.t - batch.startedAt) / 300000);
      if (!eventPeriods.has(period)) eventPeriods.set(period, new Map());
      get(eventPeriods.get(period), event.name).add(event.duration);
      if (
        (event.name.startsWith('window.') ||
          event.name === 'simulation.installStream' ||
          event.name === 'index.surfaceSites' ||
          event.name === 'transition.slice' ||
          event.name.startsWith('storage.compact') ||
          event.name === 'longtask' ||
          event.name === 'driver.interrupted' ||
          (event.name === 'profiler.transport.encode' && event.duration > 10)) &&
        eventTimeline.length < 10000
      )
        eventTimeline.push(event);
      if (event.name === 'worker.chunk')
        for (const key of [
          'executeMs',
          'constructMs',
          'deliveryMs',
          'inboundMs',
          'roundTripMs',
          'communicationOverheadMs',
        ])
          if (Number.isFinite(event.detail?.[key]))
            get(events, 'worker.' + key).add(event.detail[key]);
      if (event.name === 'longtask') {
        longTasks.push(event);
        if (longTasks.length > 1000)
          longTasks.sort((a, b) => b.duration - a.duration).length = 1000;
      }
    }
  }
  const count = frames.length;
  sourceCache.distinctGeneratedAddresses = generatedAddresses.size;
  for (const frame of slowFrames) {
    frame.overlappingWorldEvents = eventTimeline.filter(
      (e) =>
        e.t <= frame.t &&
        e.t + e.duration >= frame.t - frame.dt &&
        [
          'window.buildWindow',
          'window.stageWindow',
          'transition.slice',
          'window.capture',
          'simulation.installStream',
          'window.restoreMoisture',
          'index.surfaceSites',
          'window.firstSafeFrame',
          'window.prune',
          'window.checkpoint',
        ].includes(e.name),
    );
  }
  const windows = [];
  for (const ready of eventTimeline.filter((e) => e.name === 'window.firstSafeFrame')) {
    const prepared = eventTimeline
      .filter((e) => e.name === 'window.prepareAt.wall' && e.t + e.duration <= ready.t + 0.5)
      .at(-1);
    windows.push({
      ...ready,
      requestToSafeMs: prepared ? ready.t + ready.duration - prepared.t : null,
    });
  }
  const result = {
    frame: summarize(frames, true),
    cpu: summarize(cpu),
    raf: summarize(rafs, true),
    gpu: summarize(gpuSamples),
    observedMs: last - first,
    dropped,
    coverage,
    sourceCache,
    stages: Object.fromEntries(
      [...stages].map(([k, v]) => [
        k,
        {
          ...v.summary(count),
          active: v.summary(),
          calls: stageCalls.get(k.replace(/\.(inclusive|self)$/, '')) ?? null,
        },
      ]),
    ),
    counters: Object.fromEntries([...counters].map(([k, v]) => [k, v.summary(count)])),
    events: Object.fromEntries([...events].map(([k, v]) => [k, v.summary()])),
    longTasks,
    slowFrames,
    eventTimeline,
    windows,
    windowRequestToSafe: summarize(windows.map((w) => w.requestToSafeMs).filter(Number.isFinite)),
    eventPeriods: Object.fromEntries(
      [...eventPeriods].map(([period, map]) => [
        period,
        Object.fromEntries([...map].map(([name, histogram]) => [name, histogram.summary()])),
      ]),
    ),
    minutes: [...minutes].map(([minute, m]) => ({
      minute,
      frame: summarize(m.dt, true),
      cpu: summarize(m.cpu),
    })),
  };
  await writeFile(directory + '/summary.json', JSON.stringify(result, null, 2));
  return result;
}
if (process.argv[1]?.endsWith('/analyze.mjs')) {
  const dirs = process.argv.slice(2);
  for (const directory of dirs) {
    const s = await analyze(directory);
    console.info(
      JSON.stringify({ directory, frame: s.frame, cpu: s.cpu, longTasks: s.longTasks.length }),
    );
  }
}
