import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameLoop } from '@/core/loop/GameLoop';
import { FIXED_STEP_SEC, FIXED_STEP_MS } from '@/core/loop/types';

describe('GameLoop Unit Test Suite', () => {
  let onFixedUpdate: (dt: number, count: number) => void;
  let onRender: (alpha: number, dt: number) => void;
  let loop: GameLoop;

  beforeEach(() => {
    onFixedUpdate = vi.fn();
    onRender = vi.fn();
    loop = new GameLoop({ onFixedUpdate, onRender });
  });

  afterEach(() => {
    loop.stop();
  });

  it('initializes in stopped state with zero counters', () => {
    const stats = loop.getStats();
    expect(stats.isRunning).toBe(false);
    expect(stats.isPaused).toBe(false);
    expect(stats.stepCount).toBe(0);
    expect(stats.accumulatorMs).toBe(0);
    expect(stats.fixedDeltaMs).toBeCloseTo(16.667, 2);
  });

  it('runs fixed updates deterministically via step()', () => {
    // Step exactly 16.667ms (1 tick)
    loop.step(FIXED_STEP_MS);
    expect(onFixedUpdate).toHaveBeenCalledTimes(1);
    expect(onFixedUpdate).toHaveBeenCalledWith(FIXED_STEP_SEC, 0);
    expect(loop.currentStepCount).toBe(1);

    // Step 50ms (3 ticks of 16.667ms = 50ms, leftover ≈ 0)
    loop.step(50);
    expect(onFixedUpdate).toHaveBeenCalledTimes(4); // 1 + 3
    expect(loop.currentStepCount).toBe(4);
  });

  it('clamps frame deltas below 0.1ms to 0.1ms', () => {
    loop.start();
    const baseTime = 1000;
    loop.tick(baseTime);

    // Micro-step of 0.01ms (timer jitter)
    loop.tick(baseTime + 0.01);
    const stats = loop.getStats();
    expect(stats.lastFrameDeltaMs).toBe(0.1);
  });

  it('clamps frame deltas above 50ms to 50ms (tab background protection)', () => {
    loop.start();
    const baseTime = 1000;
    loop.tick(baseTime);

    // 5-second tab background freeze
    loop.tick(baseTime + 5000);
    const stats = loop.getStats();
    expect(stats.lastFrameDeltaMs).toBe(50.0);
  });

  it('protects against spiral of death by capping steps per frame to 5 and dropping backlog > 100ms', () => {
    let tickCount = 0;
    const trackingLoop = new GameLoop(
      {
        onFixedUpdate: () => {
          tickCount++;
        },
        onRender,
      },
      { maxStepsPerFrame: 5, maxAccumulatorBacklogMs: 100 }
    );

    trackingLoop.start();
    // Simulate multiple large ticks that would cause huge backlog
    trackingLoop.tick(1000);
    trackingLoop.tick(1050); // +50ms (clamped)
    trackingLoop.tick(1100); // +50ms (clamped)

    expect(tickCount).toBeLessThanOrEqual(10);
    expect(trackingLoop.currentAccumulatorMs).toBeLessThanOrEqual(100);
    trackingLoop.stop();
  });

  it('calculates alpha accurately between 0.0 and 1.0', () => {
    let capturedAlpha = -1;
    const alphaLoop = new GameLoop({
      onFixedUpdate: vi.fn(),
      onRender: (alpha) => {
        capturedAlpha = alpha;
      },
    });

    alphaLoop.start();
    alphaLoop.tick(1000);
    // Advance by half a fixed step (8.333ms)
    alphaLoop.tick(1000 + FIXED_STEP_MS / 2);

    expect(capturedAlpha).toBeGreaterThanOrEqual(0.48);
    expect(capturedAlpha).toBeLessThanOrEqual(0.52);
    alphaLoop.stop();
  });

  it('handles pause and resume lifecycle without jump upon resume', () => {
    loop.start();
    loop.tick(1000);
    expect(loop.isRunning).toBe(true);

    loop.pause();
    expect(loop.isPaused).toBe(true);
    const stepCountPaused = loop.currentStepCount;

    // Ticking while paused should not advance simulation steps
    loop.tick(1100);
    expect(loop.currentStepCount).toBe(stepCountPaused);

    // Resume after 2 seconds
    loop.resume();
    expect(loop.isPaused).toBe(false);

    // First tick after resume should use fresh baseline without jumping 2000ms
    loop.tick(3100);
    expect(loop.currentStepCount).toBe(stepCountPaused); // baseline reset contributes 0ms
  });

  it('adds zero delta to the accumulator on the first tick after start()', () => {
    loop.start();
    loop.tick(1000);

    const stats = loop.getStats();
    expect(stats.lastFrameDeltaMs).toBe(0);
    expect(stats.accumulatorMs).toBe(0);
    expect(stats.wallTimeMs).toBe(0);
  });

  it('adds zero delta to the accumulator on the first tick after resume()', () => {
    loop.start();
    loop.tick(1000);
    loop.tick(1000 + FIXED_STEP_MS);
    expect(loop.currentStepCount).toBe(1);
    expect(loop.currentAccumulatorMs).toBe(0);

    loop.pause();
    loop.resume();
    loop.tick(5000);

    expect(loop.getStats().lastFrameDeltaMs).toBe(0);
    expect(loop.currentAccumulatorMs).toBe(0);
    expect(loop.currentStepCount).toBe(1);
  });

  it('drops accumulator backlog and counts the dropped frame when it exceeds maxAccumulatorBacklogMs', () => {
    const backlogLoop = new GameLoop(
      { onFixedUpdate: vi.fn(), onRender },
      { maxStepsPerFrame: 1, maxAccumulatorBacklogMs: 20 }
    );

    backlogLoop.start();
    backlogLoop.tick(0);
    // +40ms: one step consumed (cap), 23.33ms left > 20ms backlog -> drop to remainder
    backlogLoop.tick(40);

    const stats = backlogLoop.getStats();
    expect(stats.stepCount).toBe(1);
    expect(stats.droppedFramesCount).toBe(1);
    expect(stats.accumulatorMs).toBeCloseTo(40 - 2 * FIXED_STEP_MS, 6);
    backlogLoop.stop();
  });

  it('step() after resume() advances by the requested delta', () => {
    loop.start();
    loop.tick(1000);
    loop.pause();
    loop.resume();

    loop.step(FIXED_STEP_MS);
    expect(loop.currentStepCount).toBe(1);
  });

  it('runs simulateTicks for headless fast-forward', () => {
    loop.simulateTicks(60);
    expect(onFixedUpdate).toHaveBeenCalledTimes(60);
    expect(loop.currentStepCount).toBe(60);
    expect(loop.getStats().simulationTimeMs).toBeCloseTo(1000, 1);
  });
});
