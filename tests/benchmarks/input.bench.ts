import { InputManager } from '@/core/input/InputManager';
import { bench, describe, expect } from 'vitest';

describe('InputManager benchmark', () => {
  bench('benchmarks 500,000 InputManager clearFrameState iterations', () => {
    const input = new InputManager();
    const start = performance.now();

    for (let i = 0; i < 500_000; i++) {
      input.simulateKeyDown('KeyW');
      input.clearFrameState();
      input.simulateKeyUp('KeyW');
      input.clearFrameState();
    }

    const duration = performance.now() - start;
    // 500,000 simulated frame clears must complete in < 600ms
    expect(duration).toBeLessThan(600);
  });
});
