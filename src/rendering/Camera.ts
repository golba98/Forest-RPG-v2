import { GAME_CONFIG } from '../config/GameConfig';
import type { CameraView } from '../types/render';
import type { WorldRect } from './chunkMath';

/**
 * Forest RPG V2 — 2D camera (pure math, no PixiJS).
 *
 * Units:
 * - Camera centre, targets, world bounds and shake magnitude: world pixels.
 * - Viewport: CSS pixels; `resolution` = device pixels per CSS pixel.
 * - `zoom`: CSS pixels per world pixel (the scale applied to the world root).
 */

/** Legacy 60 Hz frame duration that the follow lerp factor was tuned for. */
export const REFERENCE_FRAME_MS = 1000 / 60;

/** Device-pixel viewport height per integer zoom step ('auto' zoom). */
export const AUTO_ZOOM_STEP_DEVICE_PX = 480;

export type ZoomSetting = number | 'auto';

export interface CameraTransform {
  /** Uniform world-root scale (CSS px per world px). */
  scale: number;
  /** World-root translation in CSS px, snapped to whole device pixels. */
  x: number;
  y: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface CameraOptions {
  readonly followLerp?: number;
  readonly zoom?: ZoomSetting;
}

// Shake: decaying envelope e^(-k·p)·(1-p) reaches exactly 0 at p = 1; two
// incommensurate angular frequencies (rad/ms, ~30 Hz) keep the motion
// deterministic yet non-repeating without Math.random.
const SHAKE_DECAY = 3;
const SHAKE_FREQ_X = 0.19;
const SHAKE_FREQ_Y = 0.23;
const SHAKE_PHASE_Y = 1.7;

export class Camera {
  private readonly followLerp: number;

  private x = 0;
  private y = 0;
  private targetX = 0;
  private targetY = 0;
  private boundsClamped = false;

  private viewportWidth = 1;
  private viewportHeight = 1;
  private resolution = 1;

  private worldWidth = 0;
  private worldHeight = 0;

  private zoomSetting: ZoomSetting;
  private zoom = 1;

  private shakeMagnitude = 0;
  private shakeDurationMs = 0;
  private shakeElapsedMs = 0;
  private shakeX = 0;
  private shakeY = 0;

  constructor(options: CameraOptions = {}) {
    this.followLerp = options.followLerp ?? GAME_CONFIG.camera.followLerp;
    this.zoomSetting = options.zoom ?? 'auto';
    this.recomputeZoom();
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  public setViewport(cssWidth: number, cssHeight: number, resolution: number): void {
    this.viewportWidth = Math.max(1, cssWidth);
    this.viewportHeight = Math.max(1, cssHeight);
    this.resolution = resolution > 0 ? resolution : 1;
    this.recomputeZoom();
    this.applyClamp();
  }

  /** World size in world pixels; 0 disables bounds clamping. */
  public setWorldSize(widthPx: number, heightPx: number): void {
    this.worldWidth = Math.max(0, widthPx);
    this.worldHeight = Math.max(0, heightPx);
    this.applyClamp();
  }

  public setZoom(zoom: ZoomSetting): void {
    this.zoomSetting = zoom === 'auto' || (Number.isFinite(zoom) && zoom > 0) ? zoom : 'auto';
    this.recomputeZoom();
    this.applyClamp();
  }

  public getZoom(): number {
    return this.zoom;
  }

  public getZoomSetting(): ZoomSetting {
    return this.zoomSetting;
  }

  /**
   * Integer zoom in DEVICE pixels from the device viewport height
   * (1080 → 2×, 1440 → 3×, 2160 → 4×, never below 1×), converted to CSS
   * scale so each world pixel covers a whole number of device pixels.
   */
  public static computeAutoZoom(cssHeight: number, resolution: number): number {
    const res = resolution > 0 ? resolution : 1;
    const deviceHeight = Math.max(0, cssHeight) * res;
    const deviceZoom = Math.max(1, Math.floor(deviceHeight / AUTO_ZOOM_STEP_DEVICE_PX));
    return deviceZoom / res;
  }

  // ---------------------------------------------------------------------------
  // Per-frame update
  // ---------------------------------------------------------------------------

  /**
   * Eases toward the target. The legacy per-60 Hz-frame lerp is converted to
   * `1 - (1 - lerp)^(dt / 16.667)` so convergence is frame-rate independent.
   */
  public follow(targetX: number, targetY: number, frameDeltaMs: number): void {
    this.setTarget(targetX, targetY);
    if (frameDeltaMs > 0) {
      const k = 1 - (1 - this.followLerp) ** (frameDeltaMs / REFERENCE_FRAME_MS);
      this.x += (this.targetX - this.x) * k;
      this.y += (this.targetY - this.y) * k;
    }
    this.update(frameDeltaMs);
  }

  /** Advances time-based effects (shake) without moving toward a target. */
  public update(frameDeltaMs: number): void {
    if (this.shakeDurationMs <= 0) return;
    this.shakeElapsedMs += Math.max(0, frameDeltaMs);
    if (this.shakeElapsedMs >= this.shakeDurationMs) {
      this.clearShake();
      return;
    }
    const amplitude = this.currentShakeAmplitude();
    this.shakeX = amplitude * Math.sin(this.shakeElapsedMs * SHAKE_FREQ_X);
    this.shakeY = amplitude * Math.sin(this.shakeElapsedMs * SHAKE_FREQ_Y + SHAKE_PHASE_Y);
  }

  /** Jumps instantly (new world, teleport, load). */
  public snapTo(targetX: number, targetY: number): void {
    this.setTarget(targetX, targetY);
    this.x = this.targetX;
    this.y = this.targetY;
  }

  /** Starts a shake unless a stronger one is already running. Magnitude in world px. */
  public shake(magnitude: number, durationMs: number): void {
    if (!(magnitude > 0) || !(durationMs > 0)) return;
    if (this.shakeDurationMs > 0 && this.currentShakeAmplitude() > magnitude) return;
    this.shakeMagnitude = magnitude;
    this.shakeDurationMs = durationMs;
    this.shakeElapsedMs = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  public getView(): CameraView {
    return {
      x: this.x,
      y: this.y,
      targetX: this.targetX,
      targetY: this.targetY,
      zoom: this.zoom,
      shakeMagnitude: this.shakeDurationMs > 0 ? this.currentShakeAmplitude() : 0,
      shakeRemainingMs: Math.max(0, this.shakeDurationMs - this.shakeElapsedMs),
      boundsClamped: this.boundsClamped,
    };
  }

  public getShakeOffset(out: ScreenPoint = { x: 0, y: 0 }): ScreenPoint {
    out.x = this.shakeX;
    out.y = this.shakeY;
    return out;
  }

  /** World-root transform with the translation snapped to whole device pixels. */
  public getTransform(out: CameraTransform = { scale: 1, x: 0, y: 0 }): CameraTransform {
    const zoom = this.zoom;
    const rawX = this.viewportWidth / 2 - (this.x + this.shakeX) * zoom;
    const rawY = this.viewportHeight / 2 - (this.y + this.shakeY) * zoom;
    out.scale = zoom;
    out.x = Math.round(rawX * this.resolution) / this.resolution;
    out.y = Math.round(rawY * this.resolution) / this.resolution;
    return out;
  }

  /** World-pixel rectangle currently covered by the viewport. */
  public getVisibleRect(out: WorldRect = { x: 0, y: 0, width: 0, height: 0 }): WorldRect {
    const t = this.getTransform(scratchTransform);
    out.x = -t.x / t.scale;
    out.y = -t.y / t.scale;
    out.width = this.viewportWidth / t.scale;
    out.height = this.viewportHeight / t.scale;
    return out;
  }

  /** World px → CSS px, using the same snapped transform the renderer applies. */
  public worldToScreen(worldX: number, worldY: number, out: ScreenPoint = { x: 0, y: 0 }): ScreenPoint {
    const t = this.getTransform(scratchTransform);
    out.x = worldX * t.scale + t.x;
    out.y = worldY * t.scale + t.y;
    return out;
  }

  /** CSS px → world px. Inverse of {@link worldToScreen}. */
  public screenToWorld(screenX: number, screenY: number, out: ScreenPoint = { x: 0, y: 0 }): ScreenPoint {
    const t = this.getTransform(scratchTransform);
    out.x = (screenX - t.x) / t.scale;
    out.y = (screenY - t.y) / t.scale;
    return out;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private recomputeZoom(): void {
    this.zoom =
      this.zoomSetting === 'auto'
        ? Camera.computeAutoZoom(this.viewportHeight, this.resolution)
        : this.zoomSetting;
  }

  private setTarget(targetX: number, targetY: number): void {
    const cx = this.clampAxis(targetX, this.worldWidth, this.viewportWidth);
    const cy = this.clampAxis(targetY, this.worldHeight, this.viewportHeight);
    this.boundsClamped = cx !== targetX || cy !== targetY;
    this.targetX = cx;
    this.targetY = cy;
  }

  /** Re-clamps the current position and target after viewport/zoom/world changes. */
  private applyClamp(): void {
    this.x = this.clampAxis(this.x, this.worldWidth, this.viewportWidth);
    this.y = this.clampAxis(this.y, this.worldHeight, this.viewportHeight);
    this.targetX = this.clampAxis(this.targetX, this.worldWidth, this.viewportWidth);
    this.targetY = this.clampAxis(this.targetY, this.worldHeight, this.viewportHeight);
  }

  /** Clamps a centre coordinate; centres the world when it is smaller than the view. */
  private clampAxis(value: number, worldSize: number, viewportSize: number): number {
    if (worldSize <= 0) return value;
    const halfView = viewportSize / this.zoom / 2;
    if (worldSize <= halfView * 2) return worldSize / 2;
    return Math.min(worldSize - halfView, Math.max(halfView, value));
  }

  private currentShakeAmplitude(): number {
    const p = Math.min(1, this.shakeElapsedMs / this.shakeDurationMs);
    return this.shakeMagnitude * Math.exp(-SHAKE_DECAY * p) * (1 - p);
  }

  private clearShake(): void {
    this.shakeMagnitude = 0;
    this.shakeDurationMs = 0;
    this.shakeElapsedMs = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }
}

const scratchTransform: CameraTransform = { scale: 1, x: 0, y: 0 };
