import { describe, it, expect } from 'vitest';
import { Vector2 } from '@/core/math/Vector2';

describe('Smoke Benchmark Suite', () => {
  it('executes 100,000 Vector2 operations within 50ms', () => {
    const start = performance.now();
    let current = new Vector2(0, 0);
    const step = new Vector2(1, 1);
    for (let i = 0; i < 100_000; i++) {
      current = current.add(step);
    }
    const duration = performance.now() - start;
    expect(current.x).toBe(100_000);
    expect(duration).toBeLessThan(100);
  });
});
