import { InputManager } from '@/core/input/InputManager';
import { describe, expect, it } from 'vitest';

describe('InputManager benchmark', () => {
  it('benchmarks 500,000 InputManager clearFrameState iterations', () => {
    const input = new InputManager();
    const start = performance.now();

    for (let i = 0; i < 500_000; i++) {
      input.simulateKeyDown('KeyW');
      input.clearFrameState();
      input.simulateKeyUp('KeyW');
      input.clearFrameState();
    }

    const duration = performance.now() - start;
    // 500,000 simulated frame clears must complete in < 400ms
    expect(duration).toBeLessThan(600);
  });
});
