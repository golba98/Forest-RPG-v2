import type { PerformanceCollector } from './FrameProfiler';
/** JSON only for small metadata/events; numeric frame/RAF records never pass through browser JSON serialization. */
export function encodeBatch(batch: ReturnType<PerformanceCollector['drain']>): ArrayBuffer {
  const { frames, rafs, ...metadata } = batch;
  const header = new TextEncoder().encode(
    JSON.stringify({
      ...metadata,
      version: 1,
      frameCount: frames.length,
      rafCount: rafs.length,
      littleEndian: new Uint8Array(new Uint16Array([1]).buffer)[0] === 1,
    }),
  );
  const offset = Math.ceil((4 + header.length) / 8) * 8;
  const length = frames.reduce(
    (n, f) => n + 5 + f.stages.length + f.counts.length,
    rafs.length * 2,
  );
  const result = new ArrayBuffer(offset + length * 8);
  new DataView(result).setUint32(0, header.length, true);
  new Uint8Array(result, 4, header.length).set(header);
  const numbers = new Float64Array(result, offset);
  let i = 0;
  for (const frame of frames) {
    numbers[i++] = frame.t;
    numbers[i++] = frame.dt;
    numbers[i++] = frame.cpu;
    numbers[i++] = frame.stages.length;
    numbers[i++] = frame.counts.length;
    numbers.set(frame.stages, i);
    i += frame.stages.length;
    numbers.set(frame.counts, i);
    i += frame.counts.length;
  }
  for (const [t, dt] of rafs) {
    numbers[i++] = t;
    numbers[i++] = dt;
  }
  return result;
}
