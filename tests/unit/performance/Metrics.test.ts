import { describe, it, expect } from 'vitest';
import { Ring, PerformanceCollector } from '../../../src/performance/FrameProfiler';
import { encodeBatch } from '../../../src/performance/BinaryTelemetry';
describe('bounded profiling telemetry', () => {
  it('encodes numeric records without JSON serializing frame arrays', () => {
    const batch = {
      label: 'binary',
      timeOrigin: 1,
      startedAt: 2,
      names: ['test'],
      frames: [{ t: 10, dt: 16, cpu: 2, stages: [0, 2, 1, 1], counts: [0, 3] }],
      rafs: [[10, 4] as const],
      events: [],
      dropped: { frames: 0, events: 0, rafs: 0 },
    };
    const buffer = encodeBatch(batch),
      length = new DataView(buffer).getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, length)));
    expect(header.frameCount).toBe(1);
    expect(header.frames).toBeUndefined();
    const values = new Float64Array(buffer, Math.ceil((4 + length) / 8) * 8);
    expect(Array.from(values)).toEqual([10, 16, 2, 4, 2, 0, 2, 1, 1, 0, 3, 10, 4]);
  });
  it('evicts oldest samples, accounts for loss and releases drained references', () => {
    const ring = new Ring<number>(2);
    ring.push(1);
    ring.push(2);
    ring.push(3);
    expect(ring.dropped).toBe(1);
    expect(ring.drain()).toEqual([2, 3]);
    expect(ring.length).toBe(0);
    ring.push(4);
    expect(ring.drain()).toEqual([4]);
    ring.clear();
    expect(ring.dropped).toBe(0);
  });
  it('accounts for nested inclusive/self time and excludes disabled samples', () => {
    let t = 100;
    const m = new PerformanceCollector(() => t),
      outer = m.id('outer'),
      inner = m.id('inner');
    expect(m.begin(outer)).toBe(-1);
    m.start('test');
    m.beginFrame();
    const a = m.begin(outer);
    t += 2;
    const b = m.begin(inner);
    t += 3;
    m.end(b);
    t += 1;
    m.end(a);
    m.endFrame();
    t += 10;
    m.beginFrame();
    const c = m.begin(outer);
    t += 2;
    m.end(c);
    m.endFrame();
    const result = m.drain();
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]?.stages).toEqual([outer, 2, 2, 1]);
    // Nested scopes outside a frame retain their own exact spans.
    const d = m.begin(outer);
    t += 2;
    const e = m.begin(inner);
    t += 3;
    m.end(e);
    t += 1;
    m.end(d);
    expect(m.drain().events).toEqual([
      expect.objectContaining({ name: 'inner', duration: 3, detail: { exclusive: 3 } }),
      expect.objectContaining({ name: 'outer', duration: 6, detail: { exclusive: 3 } }),
    ]);
    m.stop();
    m.event('disabled', t, 123);
    expect(m.drain().events).toEqual([]);
  });
  it('reports counter values, raw callback cadence and resets independently between runs', () => {
    let t = 100;
    const m = new PerformanceCollector(() => t),
      counter = m.id('uploads');
    m.start('one');
    m.raf(10);
    m.raf(14);
    m.beginFrame();
    m.endFrame();
    t += 16;
    m.beginFrame();
    m.count(counter, 3);
    m.endFrame();
    const first = m.drain();
    expect(first.rafs).toEqual([[14, 4]]);
    expect(first.frames[0]?.counts).toEqual([counter, 3]);
    m.start('two');
    expect(m.drain().frames).toEqual([]);
    expect(m.snapshot().dropped).toBe(0);
  });
});
