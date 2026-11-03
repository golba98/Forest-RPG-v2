import { expect, it } from 'vitest';
import { PlayerBlink } from '../../../src/animation/PlayerBlink';

it('closes and reopens in authored stages, with varied bounded open intervals', () => {
  const blink = new PlayerBlink(91),
    waits = new Set<number>();
  let now = 0;
  blink.update(now);
  for (let n = 0; n < 30; n++) {
    const wait = blink.nextChangeMs;
    expect(wait).toBeGreaterThanOrEqual(2800);
    expect(wait).toBeLessThan(5200);
    waits.add(wait);
    now += wait;
    expect(blink.update(now + 0.00001)).toBe('closing');
    expect(blink.update(now + 39)).toBe('closing');
    expect(blink.update(now + 40)).toBe('closed');
    expect(blink.update(now + 99)).toBe('closed');
    expect(blink.update(now + 100)).toBe('opening');
    now += 160;
    expect(blink.update(now + 0.00001)).toBe('open');
    now += 0.00001;
  }
  expect(waits.size).toBe(30);
});
it('freezes without catch-up during pause, displayed impact hold or death', () => {
  const blink = new PlayerBlink();
  blink.update(100);
  blink.startBlink();
  blink.update(120);
  expect(blink.update(9000, true)).toBe('closing');
  expect(blink.nextChangeMs).toBe(20);
  expect(blink.update(9010)).toBe('closing');
  expect(blink.update(9020)).toBe('closed');
  expect(blink.update(0)).toBe('open');
  blink.startBlink();
  blink.reset();
  expect(blink.phase).toBe('open');
});
it('has the same phase at shared times at 30, 60, 144 and 240 Hz', () => {
  const reference = new PlayerBlink(23);
  reference.update(0);
  const samples = Array.from({ length: 600 }, (_, i) => (i + 1) * 41);
  const expected = samples.map((t) => reference.update(t));
  for (const rate of [30, 60, 144, 240]) {
    const blink = new PlayerBlink(23);
    blink.update(0);
    let last = 0;
    for (const [i, t] of samples.entries()) {
      for (let tick = last + 1000 / rate; tick < t; tick += 1000 / rate) blink.update(tick);
      expect(blink.update(t)).toBe(expected[i]);
      last = t;
    }
  }
});
