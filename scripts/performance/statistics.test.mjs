import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, Histogram } from './statistics.mjs';
test('frame statistics use nearest rank and the mean of the slowest one percent', () => {
  const values = Array(99).fill(10);
  values.push(50);
  const result = summarize(values, true);
  assert.equal(result.median, 10);
  assert.equal(result.p99, 10);
  assert.equal(result.worst, 50);
  assert.equal(result.low1Fps, 20);
  assert.equal(result.above16_67, 1);
  assert.equal(result.above33_33, 1);
  assert.ok(Math.abs(result.fps - 100000 / 1040) < 1e-9);
});
test('stage histograms include frames without a stage as zero', () => {
  const h = new Histogram();
  h.add(5);
  assert.equal(h.summary(100).p95, 0);
  assert.equal(h.summary(100).p99, 0);
  assert.equal(h.summary(100).mean, 0.05);
});
test('one-percent lows round sample count upward', () => {
  const result = summarize([...Array(99).fill(10), 50, 100], true);
  assert.ok(Math.abs(result.low1Fps - 1000 / 75) < 1e-9);
});
test('histogram overflow preserves the worst observation without inventing a percentile', () => {
  const h = new Histogram();
  h.add(9439);
  h.add(Number.NaN);
  assert.equal(h.summary().n, 1);
  assert.equal(h.summary().p99, null);
  assert.equal(h.summary().worst, 9439);
  assert.equal(h.summary().overflowCount, 1);
});
