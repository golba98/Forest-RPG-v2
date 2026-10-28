import {
  FIXED_STEP_SEC,
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
  private resumeBaselinePending = false;
  private firstTickPending = false;

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
    this.resumeBaselinePending = false;
    this.firstTickPending = true;
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
    this.resumeBaselinePending = false;
    this.firstTickPending = false;
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
    this.resumeBaselinePending = true;
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
    let isBaselineReset = false;
    if (this.firstTickPending || this.resumeBaselinePending) {
      this.lastTimeMs = now;
      this.fpsWindowStartMs = now;
      this.firstTickPending = false;
      this.resumeBaselinePending = false;
      isBaselineReset = true;
    }

    const rawDeltaMs = now - this.lastTimeMs;
    this.lastTimeMs = now;

    // 1. Clamp frame delta to [minDeltaMs, maxDeltaMs]; a baseline reset contributes no time
    const clampedDeltaMs = isBaselineReset
      ? 0
      : Math.max(this.minDeltaMs, Math.min(this.maxDeltaMs, rawDeltaMs));
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
    while (this.accumulatorMs >= this.fixedStepMs - 1e-4 && stepsThisFrame < this.maxStepsPerFrame) {
      this.callbacks.onFixedUpdate(this.fixedStepSec, this.stepCount);
      this.accumulatorMs -= this.fixedStepMs;
      this.stepCount++;
      this.simulationTimeMs += this.fixedStepMs;
      stepsThisFrame++;
    }

    if (Math.abs(this.accumulatorMs) < 1e-4) {
      this.accumulatorMs = 0;
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
    const wasFirstTick = this.firstTickPending;
    const wasResumeBaseline = this.resumeBaselinePending;

    this._isRunning = true;
    this._isPaused = false;
    this.firstTickPending = false;
    this.resumeBaselinePending = false;

    // Simulate tick with explicit delta
    const virtualNow = this.lastTimeMs + customDeltaMs;
    this.tick(virtualNow);

    this._isRunning = wasRunning;
    this._isPaused = wasPaused;
    this.firstTickPending = wasFirstTick;
    this.resumeBaselinePending = wasResumeBaseline;
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
