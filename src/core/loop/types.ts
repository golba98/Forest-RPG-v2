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
