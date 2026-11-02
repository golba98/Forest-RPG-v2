import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { summarize } from './statistics.mjs';
export async function traceStats(file) {
  const raw = await readFile(file),
    trace = JSON.parse(file.endsWith('.gz') ? gunzipSync(raw) : raw.toString()),
    events = trace.traceEvents ?? trace;
  const threads = new Map(),
    processes = new Map(),
    groups = new Map(),
    slow = [],
    gc = [];
  for (const e of events) {
    if (e.ph === 'M' && e.name === 'thread_name') threads.set(e.pid + ':' + e.tid, e.args?.name);
    if (e.ph === 'M' && e.name === 'process_name') processes.set(e.pid, e.args?.name);
  }
  for (const e of events) {
    if (e.ph !== 'X' || !Number.isFinite(e.dur)) continue;
    const ms = e.dur / 1000,
      key = e.pid + ':' + e.tid + ':' + e.name;
    if (!groups.has(key))
      groups.set(key, {
        pid: e.pid,
        tid: e.tid,
        name: e.name,
        thread: threads.get(e.pid + ':' + e.tid),
        process: processes.get(e.pid),
        values: [],
      });
    groups.get(key).values.push(ms);
    if (ms > 16.67) {
      slow.push(e);
      if (slow.length > 200) slow.sort((a, b) => b.dur - a.dur).length = 200;
    }
    if (/^(MinorGC|MajorGC|GCEvent|V8\.GCFinalizeMC)$/.test(e.name))
      gc.push({ pid: e.pid, tid: e.tid, name: e.name, t: e.ts / 1000, ms, args: e.args });
  }
  const result = {
    file,
    eventCount: events.length,
    method:
      'Complete trace events only; nested event sums overlap. GC lists select top-level event names, not all nested V8 phases.',
    gc,
    groups: [...groups.values()]
      .map(({ values, ...item }) => ({
        ...item,
        ...summarize(values),
        totalMs: values.reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.totalMs - a.totalMs),
    slow,
  };
  await writeFile(file + '.summary.json', JSON.stringify(result, null, 2));
  return result;
}
if (process.argv[1]?.endsWith('/trace-analysis.mjs'))
  for (const file of process.argv.slice(2)) {
    const r = await traceStats(file);
    console.info(
      JSON.stringify({ file, events: r.eventCount, gc: r.gc.length, slow: r.slow.length }),
    );
  }
