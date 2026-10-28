# Milestone 2 — Game Loop and Interpolation Subsystem Specification

**Author**: `teamwork_explorer_m2_1` (Teamwork Explorer)  
**Date**: 2026-10-27  
**Status**: Proposal & Architecture Blueprint  
**Target Subsystem**: Core Architecture & Simulation Engine (`src/core/loop/`)  
**Workspace**: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2`  

---

## 1. Executive Summary & Architectural Context

Forest RPG V2 requires a decoupled game loop architecture where the authoritative simulation (collision physics, combat formulas, entity AI state machines, procedural generation, and quest clocks) runs strictly at **60 Hz** (`FIXED_STEP_SEC = 1/60`, `FIXED_STEP_MS = 1000/60`), completely decoupled from the variable rendering frame rates (60 Hz, 120 Hz, 144 Hz, 165 Hz, 240 Hz, or FreeSync/G-Sync monitors).

### 1.1 Problems Solved
1. **Variable Refresh Rate Stutter & Speed Warp**: Without fixed-timestep decoupling, high-refresh displays run gameplay up to 4x faster, while dropped frames cause tunneling and physics collapse.
2. **Tab Backgrounding Spikes (Spiral of Death)**: When browser tabs are backgrounded or heavy garbage collection occurs, `requestAnimationFrame` pauses. Upon resuming, deltas can spike to thousands of milliseconds. Unbounded loops attempt to execute hundreds of simulation steps in a single frame, locking the browser thread.
3. **Timer Jitter & Freezing**: Web high-resolution timers (`performance.now()`) occasionally return zero or micro-deltas under heavy load. Clamping guarantees numerical stability.
4. **Headless Hermetic Testing**: Running game logic in Node.js (Vitest) without DOM, WebGL, or `window.requestAnimationFrame` enables sub-millisecond execution of thousands of simulation ticks for regression testing and CI verification.

---

## 2. Mathematical Invariants & Algorithmic Rules

### 2.1 Authoritative Constants
- `FIXED_STEP_SEC`: `1 / 60` (approx. `0.016666666666666666` s)
- `FIXED_STEP_MS`: `1000 / 60` (approx. `16.666666666666668` ms)
- `MIN_DELTA_MS`: `0.1` ms (prevents division by zero, negative time, and timer jitter)
- `MAX_DELTA_MS`: `50.0` ms (caps raw wall delta before accumulation; 3 frames max)
- `MAX_FIXED_STEPS_PER_FRAME`: `5` steps (caps maximum simulation updates per render tick)
- `MAX_ACCUMULATOR_BACKLOG_MS`: `100.0` ms (spiral-of-death drop threshold)

### 2.2 Delta Time Clamping
Upon every frame tick:
$$\Delta t_{\text{raw}} = t_{\text{current}} - t_{\text{last}}$$
$$\Delta t_{\text{clamped}} = \max(0.1, \min(50.0, \Delta t_{\text{raw}}))$$

If the tab was backgrounded for 5 seconds ($\Delta t_{\text{raw}} = 5000\text{ ms}$), $\Delta t_{\text{clamped}}$ is truncated to $50.0\text{ ms}$, entirely discarding the multi-second freeze.

### 2.3 Accumulator & Spiral-of-Death Protection
$$\text{accumulator} \leftarrow \text{accumulator} + \Delta t_{\text{clamped}}$$

While $\text{accumulator} \ge \text{FIXED\_STEP\_MS}$ and $\text{stepsThisFrame} < 5$:
1. Execute `onFixedUpdate(FIXED_STEP_SEC, stepCount)`
2. $\text{accumulator} \leftarrow \text{accumulator} - \text{FIXED\_STEP\_MS}$
3. $\text{stepCount} \leftarrow \text{stepCount} + 1$
4. $\text{simulationTimeMs} \leftarrow \text{simulationTimeMs} + \text{FIXED\_STEP\_MS}$
5. $\text{stepsThisFrame} \leftarrow \text{stepsThisFrame} + 1$

If $\text{accumulator} > 100.0\text{ ms}$ after stepping (indicating an unrecoverable backlog):
$$\text{accumulator} \leftarrow \text{accumulator} \pmod{\text{FIXED\_STEP\_MS}}$$
*(Drops backlog to strictly less than 16.667 ms, preserving fractional phase without inducing lag accumulation).*

### 2.4 Rendering Alpha Interpolation Factor
$$\alpha = \frac{\text{accumulator}}{\text{FIXED\_STEP\_MS}}, \quad \alpha \in [0.0, 1.0)$$

During `onRender(\alpha, \Delta t_{\text{clamped}})`:
$$\text{renderX} = \text{prevX} + (\text{currX} - \text{prevX}) \times \alpha$$
$$\text{renderY} = \text{prevY} + (\text{currY} - \text{prevY}) \times \alpha$$

### 2.5 Lifecycle State Machine
```
   +-------------+       start()        +-------------+
   |             | -------------------> |             |
   |   STOPPED   |                      |   RUNNING   | <---+
   |             | <------------------- |             |     |
   +-------------+        stop()        +-------------+     |
                                           |        ^       | resume()
                                  pause()  |        |       |
                                           v        +-------+
                                        +-------------+
                                        |   PAUSED    |
                                        +-------------+
```
- **When Paused**:
  - `isPaused === true`, `isRunning === true`.
  - `onFixedUpdate` is **never** invoked (`stepCount` remains frozen).
  - Accumulator does **not** advance.
  - Wall clock baseline is reset on `resume()` (`lastTimeMs = performance.now()`) to prevent catch-up jumps.
  - `onRender(0, dt)` is optionally invoked so UI overlays (pause menu, debug console, shaders) continue rendering smoothly.

---

## 3. TypeScript Code Blueprints

### 3.1 `src/core/loop/types.ts`

```typescript
/**
 * Forest RPG V2 — Game Loop & Interpolation Subsystem Type Contracts
 */

export const FIXED_STEP_SEC = 1 / 60;
export const FIXED_STEP_MS = 1000 / 60;
export const MIN_DELTA_MS = 0.1;
export const MAX_DELTA_MS = 50.0;
export const MAX_FIXED_STEPS_PER_FRAME = 5;
export const MAX_ACCUMULATOR_BACKLOG_MS = 100.0;

export type LoopState = 'stopped' | 'running' | 'paused';

export interface GameLoopCallbacks {
  /**
   * Invoked at the authoritative 60Hz fixed timestep.
   * @param fixedDeltaSec Authoritative delta time in seconds (1/60s ≈ 0.016667s)
   * @param stepCount Monotonically increasing tick counter
   */
  onFixedUpdate: (fixedDeltaSec: number, stepCount: number) => void;

  /**
   * Invoked each animation frame before rendering presentation.
   * @param alpha Fractional interpolation factor between previous and current simulation ticks [0, 1)
   * @param renderDeltaMs Time elapsed since last render frame in milliseconds
   */
  onRender: (alpha: number, renderDeltaMs: number) => void;

  /**
   * Optional post-render hook for telemetry, HUD updates, or benchmark logging.
   */
  onPostRender?: (stats: Readonly<GameLoopStats>) => void;
}

export interface GameLoopOptions {
  /** Target display/rendering FPS (default: 60) */
  targetFps?: number;
  /** Authoritative fixed timestep in seconds (default: 1/60) */
  fixedStepSec?: number;
  /** Minimum clamped delta time in milliseconds (default: 0.1) */
  minDeltaMs?: number;
  /** Maximum clamped frame delta time in milliseconds (default: 50.0) */
  maxDeltaMs?: number;
  /** Maximum fixed simulation steps allowed per frame tick (default: 5) */
  maxStepsPerFrame?: number;
  /** Accumulator backlog threshold in ms triggering backlog drop (default: 100.0) */
  maxAccumulatorBacklogMs?: number;
  /** Whether to render frames while paused (default: true for UI rendering) */
  renderWhilePaused?: boolean;
}

export interface GameLoopStats {
  isRunning: boolean;
  isPaused: boolean;
  targetFps: number;
  actualFps: number;
  fixedDeltaMs: number;
  fixedDeltaSec: number;
  accumulatorMs: number;
  stepCount: number;
  simulationTimeMs: number;
  wallTimeMs: number;
  alpha: number;
  lastFrameDeltaMs: number;
  droppedFramesCount: number;
}

export interface IInterpolatable {
  prevX: number;
  prevY: number;
  x: number;
  y: number;
  renderX: number;
  renderY: number;
}
```

---

### 3.2 `src/core/loop/GameLoop.ts`

```typescript
import {
  FIXED_STEP_SEC,
  FIXED_STEP_MS,
  MIN_DELTA_MS,
  MAX_DELTA_MS,
  MAX_FIXED_STEPS_PER_FRAME,
  MAX_ACCUMULATOR_BACKLOG_MS,
  GameLoopCallbacks,
  GameLoopOptions,
  GameLoopStats,
} from './types';

/**
 * Forest RPG V2 — Decoupled Fixed-Timestep Game Loop
 * Features:
 * - 60 Hz authoritative fixed timestep accumulator
 * - Frame delta clamping [0.1ms, 50.0ms]
 * - Spiral-of-death protection (max 5 steps/frame + 100ms backlog drop)
 * - Alpha interpolation calculation [0.0, 1.0)
 * - Full lifecycle controls: start(), stop(), pause(), resume()
 * - Headless deterministic step API for Vitest unit tests without DOM/window
 * - Frame pacing and FPS counter telemetry
 */
export class GameLoop {
  private readonly callbacks: GameLoopCallbacks;
  private readonly fixedStepSec: number;
  private readonly fixedStepMs: number;
  private readonly minDeltaMs: number;
  private readonly maxDeltaMs: number;
  private readonly maxStepsPerFrame: number;
  private readonly maxAccumulatorBacklogMs: number;
  private readonly renderWhilePaused: boolean;

  // Lifecycle states
  private _isRunning = false;
  private _isPaused = false;

  // Timing & Accumulation
  private accumulatorMs = 0;
  private lastTimeMs = 0;
  private stepCount = 0;
  private simulationTimeMs = 0;
  private wallTimeMs = 0;
  private alpha = 0;

  // RAF / Timer handle
  private rafHandle: number | null = null;
  private timerHandle: ReturnType<typeof setTimeout> | null = null;

  // Pacing & FPS telemetry
  private targetFps: number;
  private actualFps = 60;
  private frameCount = 0;
  private fpsWindowStartMs = 0;
  private lastFrameDeltaMs = 0;
  private droppedFramesCount = 0;

  constructor(callbacks: GameLoopCallbacks, options: GameLoopOptions = {}) {
    this.callbacks = callbacks;
    this.fixedStepSec = options.fixedStepSec ?? FIXED_STEP_SEC;
    this.fixedStepMs = this.fixedStepSec * 1000;
    this.minDeltaMs = options.minDeltaMs ?? MIN_DELTA_MS;
    this.maxDeltaMs = options.maxDeltaMs ?? MAX_DELTA_MS;
    this.maxStepsPerFrame = options.maxStepsPerFrame ?? MAX_FIXED_STEPS_PER_FRAME;
    this.maxAccumulatorBacklogMs = options.maxAccumulatorBacklogMs ?? MAX_ACCUMULATOR_BACKLOG_MS;
    this.renderWhilePaused = options.renderWhilePaused ?? true;
    this.targetFps = options.targetFps ?? 60;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle Controls
  // ---------------------------------------------------------------------------

  public start(): void {
    if (this._isRunning) return;

    this._isRunning = true;
    this._isPaused = false;
    this.accumulatorMs = 0;
    this.lastTimeMs = this.now();
    this.fpsWindowStartMs = this.lastTimeMs;
    this.frameCount = 0;

    this.scheduleNextTick();
  }

  public stop(): void {
    if (!this._isRunning) return;

    this._isRunning = false;
    this._isPaused = false;
    this.cancelScheduledTick();
    this.accumulatorMs = 0;
  }

  public pause(): void {
    if (!this._isRunning || this._isPaused) return;
    this._isPaused = true;
  }

  public resume(): void {
    if (!this._isRunning || !this._isPaused) return;

    this._isPaused = false;
    // Reset baseline timestamp so duration spent in paused state is discarded
    this.lastTimeMs = this.now();
  }

  // ---------------------------------------------------------------------------
  // State Accessors
  // ---------------------------------------------------------------------------

  public get isRunning(): boolean {
    return this._isRunning;
  }

  public get isPaused(): boolean {
    return this._isPaused;
  }

  public get currentStepCount(): number {
    return this.stepCount;
  }

  public get currentAccumulatorMs(): number {
    return this.accumulatorMs;
  }

  public get currentAlpha(): number {
    return this.alpha;
  }

  public getStats(): GameLoopStats {
    return {
      isRunning: this._isRunning,
      isPaused: this._isPaused,
      targetFps: this.targetFps,
      actualFps: this.actualFps,
      fixedDeltaMs: this.fixedStepMs,
      fixedDeltaSec: this.fixedStepSec,
      accumulatorMs: this.accumulatorMs,
      stepCount: this.stepCount,
      simulationTimeMs: this.simulationTimeMs,
      wallTimeMs: this.wallTimeMs,
      alpha: this.alpha,
      lastFrameDeltaMs: this.lastFrameDeltaMs,
      droppedFramesCount: this.droppedFramesCount,
    };
  }

  // ---------------------------------------------------------------------------
  // Core Frame Tick Algorithm
  // ---------------------------------------------------------------------------

  public tick(currentTimeMs?: number): void {
    if (!this._isRunning) return;

    const now = currentTimeMs ?? this.now();
    const rawDeltaMs = now - this.lastTimeMs;
    this.lastTimeMs = now;

    // 1. Clamp frame delta to [minDeltaMs, maxDeltaMs]
    const clampedDeltaMs = Math.max(this.minDeltaMs, Math.min(this.maxDeltaMs, rawDeltaMs));
    this.lastFrameDeltaMs = clampedDeltaMs;

    // Update telemetry
    this.updateFps(now);

    // 2. Handle Paused state
    if (this._isPaused) {
      if (this.renderWhilePaused) {
        // Render current static state (alpha = 0) with elapsed frame time
        this.callbacks.onRender(0, clampedDeltaMs);
        this.callbacks.onPostRender?.(this.getStats());
      }
      return;
    }

    this.wallTimeMs += clampedDeltaMs;
    this.accumulatorMs += clampedDeltaMs;

    // 3. Fixed Timestep Accumulator Loop with Spiral-of-Death Capping
    let stepsThisFrame = 0;
    while (this.accumulatorMs >= this.fixedStepMs && stepsThisFrame < this.maxStepsPerFrame) {
      this.callbacks.onFixedUpdate(this.fixedStepSec, this.stepCount);
      this.accumulatorMs -= this.fixedStepMs;
      this.stepCount++;
      this.simulationTimeMs += this.fixedStepMs;
      stepsThisFrame++;
    }

    // 4. Spiral-of-death backlog drop if accumulator still exceeds threshold
    if (this.accumulatorMs > this.maxAccumulatorBacklogMs) {
      this.droppedFramesCount++;
      // Drop excess backlog to remainder modulo fixedStepMs
      this.accumulatorMs = this.accumulatorMs % this.fixedStepMs;
    }

    // 5. Alpha calculation for presentation interpolation: alpha ∈ [0, 1)
    this.alpha = Math.max(0, Math.min(1, this.accumulatorMs / this.fixedStepMs));

    // 6. Presentation Render Phase
    this.callbacks.onRender(this.alpha, clampedDeltaMs);
    this.callbacks.onPostRender?.(this.getStats());
  }

  // ---------------------------------------------------------------------------
  // Headless Deterministic Stepping API (Vitest / CI / Diagnostics)
  // ---------------------------------------------------------------------------

  /**
   * Advances simulation deterministically by an arbitrary delta in milliseconds.
   * Useful for unit tests advancing time without waiting on real wall time.
   */
  public step(customDeltaMs: number = this.fixedStepMs): void {
    const wasRunning = this._isRunning;
    const wasPaused = this._isPaused;

    this._isRunning = true;
    this._isPaused = false;

    // Simulate tick with explicit delta
    const virtualNow = this.lastTimeMs + customDeltaMs;
    this.tick(virtualNow);

    this._isRunning = wasRunning;
    this._isPaused = wasPaused;
  }

  /**
   * Simulates an exact count of fixed simulation ticks directly.
   * Pure deterministic simulation advancing state without accumulator residue.
   */
  public simulateTicks(count: number, tickDurationSec: number = this.fixedStepSec): void {
    for (let i = 0; i < count; i++) {
      this.callbacks.onFixedUpdate(tickDurationSec, this.stepCount);
      this.stepCount++;
      this.simulationTimeMs += tickDurationSec * 1000;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers & Platform Abstraction
  // ---------------------------------------------------------------------------

  private now(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  private scheduleNextTick(): void {
    if (!this._isRunning) return;

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      this.rafHandle = window.requestAnimationFrame(() => {
        this.tick();
        this.scheduleNextTick();
      });
    } else {
      // Node.js or headless fallback
      this.timerHandle = setTimeout(() => {
        this.tick();
        this.scheduleNextTick();
      }, 1000 / this.targetFps);
    }
  }

  private cancelScheduledTick(): void {
    if (this.rafHandle !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    if (this.timerHandle !== null) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private updateFps(nowMs: number): void {
    this.frameCount++;
    const elapsed = nowMs - this.fpsWindowStartMs;
    if (elapsed >= 1000) {
      this.actualFps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.fpsWindowStartMs = nowMs;
    }
  }
}
```

---

### 3.3 `src/core/loop/Interpolation.ts`

```typescript
import { Vector2 } from '../math/Vector2';
import { IInterpolatable } from './types';

/**
 * Forest RPG V2 — Alpha Interpolation Utilities
 * Provides zero-allocation interpolation functions for entities, coordinates, and angles.
 */
export class Interpolation {
  /**
   * Linear interpolation between two scalar values.
   */
  public static lerp(prev: number, curr: number, alpha: number): number {
    return prev + (curr - prev) * alpha;
  }

  /**
   * Linear interpolation between two 2D vectors.
   * Modifies out vector in-place if provided to avoid GC pressure in hot render loops.
   */
  public static lerpVector2(
    prev: { x: number; y: number },
    curr: { x: number; y: number },
    alpha: number,
    out?: { x: number; y: number }
  ): { x: number; y: number } {
    const rx = prev.x + (curr.x - prev.x) * alpha;
    const ry = prev.y + (curr.y - prev.y) * alpha;

    if (out) {
      out.x = rx;
      out.y = ry;
      return out;
    }
    return new Vector2(rx, ry);
  }

  /**
   * Interpolates an entity implementing IInterpolatable.
   * Computes renderX and renderY in-place.
   */
  public static interpolateEntity(entity: IInterpolatable, alpha: number): void {
    entity.renderX = entity.prevX + (entity.x - entity.prevX) * alpha;
    entity.renderY = entity.prevY + (entity.y - entity.prevY) * alpha;
  }

  /**
   * Snaps interpolation state immediately (used on teleport, respawn, or spawn).
   * Prevents sprite stretching/streaking across the map.
   */
  public static snapEntity(entity: IInterpolatable): void {
    entity.prevX = entity.x;
    entity.prevY = entity.y;
    entity.renderX = entity.x;
    entity.renderY = entity.y;
  }

  /**
   * Shortest-path angular interpolation in radians.
   * Handles 0/2π wrapping correctly without spinning 360 degrees.
   */
  public static lerpAngle(prevRad: number, currRad: number, alpha: number): number {
    let diff = (currRad - prevRad) % (2 * Math.PI);
    if (diff < -Math.PI) diff += 2 * Math.PI;
    if (diff > Math.PI) diff -= 2 * Math.PI;
    return prevRad + diff * alpha;
  }
}
```

---

## 4. Integration with Core Engine & Playwright Diagnostics

### 4.1 Diagnostics Gateway Contract Alignment
In `tests/e2e/helpers/types.ts`, `EngineState` and `GameDiagnosticsGateway` are defined as:
```typescript
export interface EngineState {
  isRunning: boolean;
  isPaused: boolean;
  targetFps: number;
  actualFps: number;
  fixedDeltaMs: number;
  accumulatorMs: number;
  stepCount: number;
  canvasWidth: number;
  canvasHeight: number;
  pixelRatio: number;
}
```

`GameLoop.getStats()` maps 1:1 with these fields:
```typescript
// Inside GameEngine or Diagnostics Provider:
public getEngineState(): EngineState {
  const stats = this.gameLoop.getStats();
  return {
    isRunning: stats.isRunning,
    isPaused: stats.isPaused,
    targetFps: stats.targetFps,
    actualFps: stats.actualFps,
    fixedDeltaMs: stats.fixedDeltaMs,
    accumulatorMs: stats.accumulatorMs,
    stepCount: stats.stepCount,
    canvasWidth: this.renderer.width,
    canvasHeight: this.renderer.height,
    pixelRatio: window.devicePixelRatio || 1,
  };
}
```

### 4.2 Playwright Test Control Hooks
`GameDiagnosticsGateway` methods map directly to `GameLoop`:
- `window.__GAME__.stepSimulation(dt)` $\rightarrow$ `gameLoop.step(dt ? dt * 1000 : undefined)`
- `window.__GAME__.pauseSimulation()` $\rightarrow$ `gameLoop.pause()`
- `window.__GAME__.resumeSimulation()` $\rightarrow$ `gameLoop.resume()`

---

## 5. Vitest Unit Test Suite Blueprints

### 5.1 `tests/unit/core/GameLoop.test.ts`

```typescript
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
    loop.start();
    let tickCount = 0;
    const trackingLoop = new GameLoop({
      onFixedUpdate: () => { tickCount++; },
      onRender,
    }, { maxStepsPerFrame: 5, maxAccumulatorBacklogMs: 100 });

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
      onRender: (alpha) => { capturedAlpha = alpha; },
    });

    alphaLoop.start();
    alphaLoop.tick(1000);
    // Advance by half a fixed step (8.333ms)
    alphaLoop.tick(1000 + (FIXED_STEP_MS / 2));

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
    expect(loop.currentStepCount).toBe(stepCountPaused); // delta from 3100-3100 is min 0.1ms < 16.667ms
  });

  it('runs simulateTicks for headless fast-forward', () => {
    loop.simulateTicks(60);
    expect(onFixedUpdate).toHaveBeenCalledTimes(60);
    expect(loop.currentStepCount).toBe(60);
    expect(loop.getStats().simulationTimeMs).toBeCloseTo(1000, 1);
  });
});
```

---

### 5.2 `tests/unit/core/Interpolation.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { Interpolation } from '@/core/loop/Interpolation';
import { Vector2 } from '@/core/math/Vector2';

describe('Interpolation Unit Test Suite', () => {
  it('correctly calculates scalar lerp', () => {
    expect(Interpolation.lerp(10, 20, 0.0)).toBe(10);
    expect(Interpolation.lerp(10, 20, 0.5)).toBe(15);
    expect(Interpolation.lerp(10, 20, 1.0)).toBe(20);
  });

  it('interpolates Vector2 in-place without garbage allocation', () => {
    const prev = new Vector2(100, 200);
    const curr = new Vector2(200, 400);
    const out = new Vector2();

    const res = Interpolation.lerpVector2(prev, curr, 0.25, out);
    expect(res).toBe(out);
    expect(out.x).toBe(125);
    expect(out.y).toBe(250);
  });

  it('interpolates entities implementing IInterpolatable', () => {
    const entity = {
      prevX: 50,
      prevY: 50,
      x: 100,
      y: 100,
      renderX: 0,
      renderY: 0,
    };

    Interpolation.interpolateEntity(entity, 0.5);
    expect(entity.renderX).toBe(75);
    expect(entity.renderY).toBe(75);
  });

  it('snaps entity coordinates on teleport', () => {
    const entity = {
      prevX: 50,
      prevY: 50,
      x: 500,
      y: 500,
      renderX: 0,
      renderY: 0,
    };

    Interpolation.snapEntity(entity);
    expect(entity.prevX).toBe(500);
    expect(entity.prevY).toBe(500);
    expect(entity.renderX).toBe(500);
    expect(entity.renderY).toBe(500);
  });

  it('computes shortest path angular interpolation across 0/2pi boundary', () => {
    // Going from 350 degrees to 10 degrees (wrapping across 0)
    const rad350 = (350 * Math.PI) / 180;
    const rad10 = (10 * Math.PI) / 180;

    const midRad = Interpolation.lerpAngle(rad350, rad10, 0.5);
    let midDeg = (midRad * 180) / Math.PI;
    if (midDeg < 0) midDeg += 360;

    expect(midDeg).toBeCloseTo(0, 1);
  });
});
```

---

## 6. Verification Method & Acceptance Criteria Checklist

| Requirement | Implementation Specification | Verification Check |
|---|---|---|
| **Authoritative 60Hz Step** | `FIXED_STEP_SEC = 1/60`, `FIXED_STEP_MS = 1000/60` | Unit test `T1.1.2` asserting step count advances by 15 in 250ms |
| **Delta Clamping [0.1, 50] ms** | `Math.max(0.1, Math.min(50.0, rawDeltaMs))` | Unit test verifying micro-delta 0.001ms clamped to 0.1ms; 5000ms clamped to 50ms |
| **Spiral-of-Death Capping** | Max 5 steps/frame; backlog drop when accumulator > 100ms | E2E `T2.2.4` and unit test verifying `accumulatorMs <= 100` after CPU freeze |
| **Alpha Calculation** | `alpha = accumulatorMs / FIXED_STEP_MS` | Unit test verifying alpha ranges from 0.0 to 0.999 without exceeding 1.0 |
| **Lifecycle Controls** | `start()`, `stop()`, `pause()`, `resume()` | E2E `T1.1.3` verifying stepCount freezes during pause and resumes seamlessly |
| **Headless Stepping API** | `step(dt)` and `simulateTicks(count)` | Vitest unit tests run under `environment: 'node'` without window/DOM |
| **Pacing Statistics** | `actualFps`, `simulationTimeMs`, `wallTimeMs`, `stepCount` | Diagnostics gateway `window.__GAME__.getState().engine` |
| **Strict TS & Zero Errors** | Strict mode, zero `any`, clean interfaces | `npm run typecheck` and `npm run lint` |
