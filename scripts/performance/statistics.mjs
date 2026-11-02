export function summarize(values, cadence = false) {
  if (!values.length) return { n: 0 };
  const sorted = Float64Array.from(values).sort(),
    n = sorted.length;
  const q = (p) => sorted[Math.max(0, Math.ceil(p * n) - 1)];
  let sum = 0,
    slow = 0;
  for (const v of sorted) sum += v;
  const k = Math.max(1, Math.ceil(n * 0.01));
  for (let i = n - k; i < n; i++) slow += sorted[i];
  return {
    n,
    mean: sum / n,
    median: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    worst: sorted[n - 1],
    ...(cadence ? { fps: (n * 1000) / sum, low1Fps: 1000 / (slow / k) } : {}),
    above16_67: sorted.filter((x) => x > 16.67).length,
    above33_33: sorted.filter((x) => x > 33.33).length,
  };
}
/** Fixed 0.1 ms bins for stage distributions; raw frame percentiles remain exact. */
export class Histogram {
  constructor() {
    this.bins = new Uint32Array(20001);
    this.n = 0;
    this.sum = 0;
    this.max = 0;
    this.overflow = 0;
  }
  add(value) {
    if (!Number.isFinite(value)) return;
    this.n++;
    this.sum += value;
    this.max = Math.max(this.max, value);
    if (value >= 2000) this.overflow++;
    this.bins[Math.min(20000, Math.max(0, Math.round(value * 10)))]++;
  }
  summary(total = this.n) {
    const zero = Math.max(0, total - this.n),
      q = (p) => {
        let rank = Math.ceil(total * p) - zero;
        if (rank <= 0) return 0;
        for (let i = 0; i < this.bins.length; i++) {
          rank -= this.bins[i];
          if (rank <= 0) return i === 20000 ? null : i / 10;
        }
        return this.max;
      };
    return {
      n: this.n,
      mean: this.sum / Math.max(1, total),
      median: q(0.5),
      p95: q(0.95),
      p99: q(0.99),
      worst: this.max,
      sum: this.sum,
      precisionMs: 0.1,
      ...(this.overflow ? { overflowCount: this.overflow, overflowLowerBoundMs: 2000 } : {}),
    };
  }
}
