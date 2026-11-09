import { EventBus } from '@/core/events/EventBus';
import { InputManager } from '@/core/input/InputManager';
import { GameLoop } from '@/core/loop/GameLoop';
import { FIXED_STEP_MS } from '@/core/loop/types';
import { Vector2 } from '@/core/math/Vector2';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Engine lifecycle and input stress', () => {
  // =========================================================================
  // 1. TIMING & LIFECYCLE STRESS TESTS
  // =========================================================================
  describe('Timing & Lifecycle Invariant Stress', () => {
    let loop: GameLoop;
    let fixedUpdateCalls: number;
    let renderCalls: number;
    let capturedAlphas: number[];

    beforeEach(() => {
      fixedUpdateCalls = 0;
      renderCalls = 0;
      capturedAlphas = [];
      loop = new GameLoop({
        onFixedUpdate: () => {
          fixedUpdateCalls++;
        },
        onRender: (alpha) => {
          renderCalls++;
          capturedAlphas.push(alpha);
        },
      });
    });

    afterEach(() => {
      loop.stop();
    });

    it('clamps severe lag spikes (500ms, 1000ms, 2000ms) to maxDeltaMs [50.0ms]', () => {
      loop.start();
      let currentTime = 1000;
      loop.tick(currentTime); // initial sync tick

      const testSpikes = [500, 1000, 2000];

      for (const spikeMs of testSpikes) {
        currentTime += spikeMs;
        loop.tick(currentTime);

        const stats = loop.getStats();
        // Clamped delta must strictly equal 50.0ms
        expect(stats.lastFrameDeltaMs).toBe(50.0);
        // Accumulator must NEVER exceed 100ms
        expect(stats.accumulatorMs).toBeLessThanOrEqual(100.0);
        expect(stats.accumulatorMs).toBeGreaterThanOrEqual(0.0);
      }
      expect(renderCalls).toBeGreaterThan(0);
    });

    it('enforces minDeltaMs [0.1ms] clamp against zero, negative, and micro-deltas', () => {
      loop.start();
      let currentTime = 1000;
      loop.tick(currentTime);

      // Micro-delta 0.001ms
      currentTime += 0.001;
      loop.tick(currentTime);
      expect(loop.getStats().lastFrameDeltaMs).toBe(0.1);

      // Exactly zero delta
      loop.tick(currentTime);
      expect(loop.getStats().lastFrameDeltaMs).toBe(0.1);

      // Negative delta (e.g. system clock sync backwards)
      currentTime -= 50;
      loop.tick(currentTime);
      expect(loop.getStats().lastFrameDeltaMs).toBe(0.1);
    });

    it('sustains massive back-to-back 2000ms lag storms without freeze or runaway accumulator', () => {
      loop.start();
      let currentTime = 10_000;
      loop.tick(currentTime);

      // Simulate 100 consecutive 2-second lag spikes (total 200 seconds of real-world freeze)
      for (let i = 0; i < 100; i++) {
        currentTime += 2000;
        const updatesBefore = fixedUpdateCalls;
        loop.tick(currentTime);
        const updatesThisFrame = fixedUpdateCalls - updatesBefore;

        // In each frame, steps must be capped at MAX_FIXED_STEPS_PER_FRAME (5)
        expect(updatesThisFrame).toBeLessThanOrEqual(5);

        // Accumulator must strictly remain <= 100.0ms
        const stats = loop.getStats();
        expect(stats.accumulatorMs).toBeLessThanOrEqual(100.0);
        expect(stats.accumulatorMs).toBeGreaterThanOrEqual(0.0);
      }

      // Verify that loop remained alive and dropped frames were tracked
      const finalStats = loop.getStats();
      expect(finalStats.isRunning).toBe(true);
      expect(finalStats.accumulatorMs).toBeLessThanOrEqual(100.0);
    });

    it('pause/resume stability: zero simulation advancement during pause, zero burst upon resume', () => {
      loop.start();
      let currentTime = 5000;
      loop.tick(currentTime);

      // Advance 10 normal 16.667ms ticks
      for (let i = 0; i < 10; i++) {
        currentTime += FIXED_STEP_MS;
        loop.tick(currentTime);
      }
      const stepsBeforePause = loop.currentStepCount;
      expect(stepsBeforePause).toBe(10);

      // PAUSE the loop
      loop.pause();
      expect(loop.isPaused).toBe(true);

      // Simulate 5000ms pause with 20 intermediate ticks while paused
      for (let i = 0; i < 20; i++) {
        currentTime += 250;
        loop.tick(currentTime);
      }

      // Simulation steps must be frozen
      expect(loop.currentStepCount).toBe(stepsBeforePause);
      expect(fixedUpdateCalls).toBe(10);

      // RESUME the loop after 5 seconds of inactivity
      loop.resume();
      expect(loop.isPaused).toBe(false);

      // First tick after resume (time jumped by 5000ms during pause)
      currentTime += 16.667;
      const updatesBeforeResumeTick = fixedUpdateCalls;
      loop.tick(currentTime);
      const updatesOnResumeTick = fixedUpdateCalls - updatesBeforeResumeTick;

      // Because resume resets baseline, the first tick contributes 0ms
      // Crucially, it must NOT execute 300 steps (no burst teleportation)
      expect(updatesOnResumeTick).toBe(0); // 0ms accumulator < 16.667ms
      expect(loop.currentStepCount).toBe(stepsBeforePause);

      // Next normal frame (16.667ms elapsed) executes exactly 1 step
      currentTime += FIXED_STEP_MS;
      loop.tick(currentTime);
      expect(loop.currentStepCount).toBe(stepsBeforePause + 1);
    });

    it('alpha precision and stability across 60Hz, 120Hz, 144Hz, and 240Hz frame rates', () => {
      const refreshRates = [
        { name: '60Hz', frameDeltaMs: 1000 / 60 },
        { name: '120Hz', frameDeltaMs: 1000 / 120 },
        { name: '144Hz', frameDeltaMs: 1000 / 144 },
        { name: '240Hz', frameDeltaMs: 1000 / 240 },
      ];

      for (const { frameDeltaMs } of refreshRates) {
        const alphas: number[] = [];
        const testLoop = new GameLoop({
          onFixedUpdate: () => {},
          onRender: (alpha) => {
            alphas.push(alpha);
          },
        });

        testLoop.start();
        let simTime = 0;
        testLoop.tick(simTime);
        alphas.length = 0; // Clear initial baseline sync render

        // Run for 1.0 second of virtual time (e.g. 60 to 240 frames)
        const frameCount = Math.round(1000 / frameDeltaMs);
        for (let f = 0; f < frameCount; f++) {
          simTime += frameDeltaMs;
          testLoop.tick(simTime);
        }

        expect(alphas.length).toBe(frameCount);

        // Every alpha must be strictly within [0.0, 1.0]
        for (let i = 0; i < alphas.length; i++) {
          const a = alphas[i]!;
          expect(a).toBeGreaterThanOrEqual(0.0);
          expect(a).toBeLessThanOrEqual(1.0);
        }

        testLoop.stop();
      }
    });

    it('triggers spiral-of-death backlog drop when maxStepsPerFrame is severely constrained', () => {
      let ticksRan = 0;
      // Configure loop allowing only 1 step per frame and 50ms backlog threshold
      const constrainedLoop = new GameLoop(
        {
          onFixedUpdate: () => {
            ticksRan++;
          },
          onRender: () => {},
        },
        {
          maxStepsPerFrame: 1,
          maxAccumulatorBacklogMs: 50.0,
        },
      );

      constrainedLoop.start();
      let time = 1000;
      constrainedLoop.tick(time);

      // Inject 50ms frames repeatedly; each frame adds 50ms but only 1 tick (16.67ms) is consumed
      for (let i = 0; i < 10; i++) {
        time += 50.0;
        constrainedLoop.tick(time);

        // Accumulator must NEVER run away beyond maxAccumulatorBacklogMs
        const stats = constrainedLoop.getStats();
        expect(stats.accumulatorMs).toBeLessThanOrEqual(50.0);
      }

      const finalStats = constrainedLoop.getStats();
      expect(finalStats.droppedFramesCount).toBeGreaterThan(0);
      expect(ticksRan).toBe(10);
      constrainedLoop.stop();
    });

    it('maintains microsecond precision and zero drift over 10,000 steps with fractional deltas', () => {
      let tickCount = 0;
      const longRunLoop = new GameLoop({
        onFixedUpdate: () => {
          tickCount++;
        },
        onRender: () => {},
      });

      longRunLoop.start();
      let simTime = 0;
      longRunLoop.tick(simTime);

      // 10,000 frames at exactly 60Hz delta (16.666666666666668ms)
      const exactFrameDelta = 1000 / 60;
      for (let i = 0; i < 1000; i++) {
        simTime += exactFrameDelta;
        longRunLoop.tick(simTime);
      }

      // Tick count must match simulated 1000 frames exactly (1000 ticks)
      expect(tickCount).toBe(1000);
      // Baseline tick contributes 0ms, so the accumulator ends at exactly 0 (no drift)
      expect(longRunLoop.getStats().accumulatorMs).toBeCloseTo(0, 6);
      longRunLoop.stop();
    });
  });

  // =========================================================================
  // 2. EVENTBUS ERROR ISOLATION & RE-ENTRANCY STRESS TESTS
  // =========================================================================
  describe('EventBus Error Isolation & Re-Entrancy Stress', () => {
    it('isolates rogue throwing listeners and completes execution of subsequent listeners', () => {
      const errorLog: unknown[] = [];
      const bus = new EventBus((err) => {
        errorLog.push(err);
      });

      const executedOrder: string[] = [];

      bus.on('player:healed', () => {
        executedOrder.push('handler_1_normal');
      });

      bus.on('player:healed', () => {
        executedOrder.push('handler_2_throwing_error');
        throw new Error('Fatal UI crash simulated');
      });

      bus.on('player:healed', () => {
        executedOrder.push('handler_3_throwing_type_error');
        throw new TypeError('Fatal type error simulated');
      });

      bus.on('player:healed', () => {
        executedOrder.push('handler_4_normal');
      });

      // Emit should not throw
      expect(() => {
        bus.emit('player:healed', { amount: 10, currentHealth: 20, maxHealth: 20 });
      }).not.toThrow();

      // All 4 handlers must have been invoked
      expect(executedOrder).toEqual([
        'handler_1_normal',
        'handler_2_throwing_error',
        'handler_3_throwing_type_error',
        'handler_4_normal',
      ]);

      // Both errors caught by error boundary
      expect(errorLog.length).toBe(2);
      expect((errorLog[0] as Error).message).toBe('Fatal UI crash simulated');
      expect((errorLog[1] as TypeError).message).toBe('Fatal type error simulated');
    });

    it('once() listener that throws an error is still deregistered immediately', () => {
      const bus = new EventBus(vi.fn());
      let invocationCount = 0;

      bus.once('game:victory', () => {
        invocationCount++;
        throw new Error('Victory fanfare failed');
      });

      expect(bus.listenerCount('game:victory')).toBe(1);

      // First emit throws internally, caught by error boundary
      bus.emit('game:victory', { level: 1, totalTimeSec: 42 });
      expect(invocationCount).toBe(1);
      expect(bus.listenerCount('game:victory')).toBe(0);

      // Second emit: listener must NOT be called again
      bus.emit('game:victory', { level: 2, totalTimeSec: 84 });
      expect(invocationCount).toBe(1);
    });

    it('stress tests 1,000+ listeners unsubscribing during active emit without skipping or index corruption', () => {
      const bus = new EventBus();
      const TOTAL_LISTENERS = 1000;
      const unsubs: Array<() => void> = [];
      const executionCounts: number[] = new Array(TOTAL_LISTENERS).fill(0);

      // Register 1,000 listeners; each listener unsubs ITSELF and its adjacent neighbor during dispatch
      for (let i = 0; i < TOTAL_LISTENERS; i++) {
        const index = i;
        const unsub = bus.on('time:cycleTick', () => {
          const currentCount = executionCounts[index] ?? 0;
          executionCounts[index] = currentCount + 1;
          // Self-unsubscribe
          unsubs[index]?.();
          // Also unsubscribe neighbor if exists
          if (index + 1 < TOTAL_LISTENERS) {
            unsubs[index + 1]?.();
          }
        });
        unsubs.push(unsub);
      }

      expect(bus.listenerCount('time:cycleTick')).toBe(TOTAL_LISTENERS);

      // First emit: Because handlers are snapshotted beforehand (Array.from),
      // all 1,000 listeners must execute without throwing or array corruption!
      expect(() => {
        bus.emit('time:cycleTick', { timeOfDay: 0.5, isNight: false, dayCount: 1 });
      }).not.toThrow();

      // Verify every single listener got invoked exactly once in the snapshot
      for (let i = 0; i < TOTAL_LISTENERS; i++) {
        expect(executionCounts[i]).toBe(1);
      }

      // Verify listeners were cleaned up and set is empty
      expect(bus.listenerCount('time:cycleTick')).toBe(0);

      // Second emit: must execute ZERO listeners
      bus.emit('time:cycleTick', { timeOfDay: 0.6, isNight: false, dayCount: 1 });
      for (let i = 0; i < TOTAL_LISTENERS; i++) {
        expect(executionCounts[i]).toBe(1); // still 1, no second call
      }
    });

    it('supports re-entrant listener registration during emit without infinite recursion', () => {
      const bus = new EventBus();
      const secondRoundExecuted: string[] = [];

      bus.on('combat:slash', () => {
        // Register a new listener during emit
        bus.on('combat:slash', () => {
          secondRoundExecuted.push('dynamically_added');
        });
      });

      // First emit: newly added listener should NOT be part of this dispatch snapshot
      bus.emit('combat:slash', {
        attackerId: 'player',
        comboStep: 1,
        position: new Vector2(0, 0),
        facingDirection: 'E',
      });
      expect(secondRoundExecuted.length).toBe(0);

      // Second emit: dynamically added listener SHOULD now execute
      bus.emit('combat:slash', {
        attackerId: 'player',
        comboStep: 2,
        position: new Vector2(0, 0),
        facingDirection: 'E',
      });
      expect(secondRoundExecuted.length).toBe(1);
    });

    it('handles bus.clear() invoked from inside a listener during emit gracefully', () => {
      const bus = new EventBus();
      const called: string[] = [];

      bus.on('weather:changed', () => {
        called.push('listener_1');
        bus.clear(); // Clear all listeners mid-emit
      });

      bus.on('weather:changed', () => {
        called.push('listener_2');
      });

      expect(() => {
        bus.emit('weather:changed', { type: 'rain', intensity: 1.0 });
      }).not.toThrow();

      // Snapshot ensures listener_2 still ran in current tick
      expect(called).toEqual(['listener_1', 'listener_2']);
      // But after emit, all listeners are cleared
      expect(bus.listenerCount()).toBe(0);
    });

    it('deduplicates identical handler registration and cleans internal map on unsubscribe', () => {
      const bus = new EventBus();
      let callCount = 0;
      const singleHandler = () => {
        callCount++;
      };

      // Register same function reference 5 times
      const unsub1 = bus.on('player:staminaChanged', singleHandler);
      bus.on('player:staminaChanged', singleHandler);
      bus.on('player:staminaChanged', singleHandler);

      // Due to Set semantics, listenerCount must be exactly 1
      expect(bus.listenerCount('player:staminaChanged')).toBe(1);

      bus.emit('player:staminaChanged', { current: 50, max: 100, isExhausted: false });
      expect(callCount).toBe(1);

      // Unsubscribe removes it completely and deletes the Map entry
      unsub1();
      expect(bus.listenerCount('player:staminaChanged')).toBe(0);
      expect(bus.hasListeners('player:staminaChanged')).toBe(false);
    });
  });

  // =========================================================================
  // 5. INPUT MANAGER EDGE CASES & RAPID DISPATCH
  // =========================================================================
  describe('InputManager Headless Stress', () => {
    it('accurately tracks frame latches and movement normalizations under rapid dispatch', () => {
      const input = new InputManager();

      // Simulate simultaneous diagonal inputs W + D (moveUp + moveRight)
      input.simulateKeyDown('KeyW');
      input.simulateKeyDown('KeyD');

      expect(input.isActionActive('moveUp')).toBe(true);
      expect(input.isActionActive('moveRight')).toBe(true);
      expect(input.isActionJustPressed('moveUp')).toBe(true);
      expect(input.isActionJustPressed('moveRight')).toBe(true);

      const moveVec = input.getMovementVector();
      // Length must be strictly normalized to 1.0 (approx 0.7071 on each axis)
      expect(moveVec.length()).toBeCloseTo(1.0, 5);
      expect(moveVec.x).toBeCloseTo(1 / Math.SQRT2, 5);
      expect(moveVec.y).toBeCloseTo(-1 / Math.SQRT2, 5);

      // Clear frame state: active remains true, justPressed becomes false
      input.clearFrameState();
      expect(input.isActionActive('moveUp')).toBe(true);
      expect(input.isActionJustPressed('moveUp')).toBe(false);

      // Release KeyW
      input.simulateKeyUp('KeyW');
      expect(input.isActionActive('moveUp')).toBe(false);
      expect(input.isActionJustReleased('moveUp')).toBe(true);
    });

    it('tracks mouse movement position and single-step delta in headless mode', () => {
      const input = new InputManager();

      input.simulateMouseMove(100, 200);
      expect(input.getMousePosition().x).toBe(100);
      expect(input.getMousePosition().y).toBe(200);
      expect(input.getMouseDelta().x).toBe(100);
      expect(input.getMouseDelta().y).toBe(200);

      // Subsequent movement
      input.simulateMouseMove(125, 190);
      expect(input.getMousePosition().x).toBe(125);
      expect(input.getMousePosition().y).toBe(190);
      expect(input.getMouseDelta().x).toBe(25);
      expect(input.getMouseDelta().y).toBe(-10);

      // Frame clear resets delta but preserves position
      input.clearFrameState();
      expect(input.getMouseDelta().x).toBe(0);
      expect(input.getMouseDelta().y).toBe(0);
      expect(input.getMousePosition().x).toBe(125);
      expect(input.getMousePosition().y).toBe(190);
    });
  });
});
