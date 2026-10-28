import type { AnimState, Direction, EntityKind } from './entities';
import type { WorldData } from './world';

export type WeatherKind = 'clear' | 'leaves' | 'rain' | 'storm';

/**
 * Read-only view of one entity for the renderer. Built by the simulation each
 * render frame; the renderer must never mutate simulation state.
 * Coordinates are in tiles; the renderer interpolates prev→current with alpha.
 */
export interface RenderEntityView {
  readonly id: string;
  readonly kind: EntityKind;
  /** Animation-set key, e.g. 'player', 'mantis', 'coin', 'portal', 'acid'. */
  readonly spriteKey: string;
  readonly x: number;
  readonly y: number;
  readonly prevX: number;
  readonly prevY: number;
  readonly facing: Direction;
  readonly anim: AnimState;
  readonly animTimeMs: number;
  /** Vertical lift in tiles (jump arc), drawn as upward offset without changing depth. */
  readonly lift: number;
  /** Player is standing in water, not on a bridge or airborne. */
  readonly submerged?: boolean;
  /** 0..1 */
  readonly alpha: number;
  /** True while the entity should flash after being hit. */
  readonly hurtFlash: boolean;
  /** Optional state flag (e.g. portal active). */
  readonly active?: boolean;
}

export interface LightSource {
  /** Tile coordinates. */
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
  /** 0xRRGGBB */
  readonly color: number;
  /** 0..1 */
  readonly intensity: number;
}

export interface EnvironmentView {
  /** 0..1 fraction through the 480 s day cycle (0 = midnight, 0.5 = noon). */
  readonly timeOfDay: number;
  /** 0..1 ambient darkness applied by the lighting layer. */
  readonly darkness: number;
  readonly weather: WeatherKind;
  readonly lights: readonly LightSource[];
}

export interface RenderSnapshot {
  readonly world: WorldData;
  /** Increments whenever `world` is replaced (new level, load, regeneration). */
  readonly worldVersion: number;
  readonly entities: readonly RenderEntityView[];
  readonly playerId: string;
  readonly environment: EnvironmentView;
}

export interface CameraView {
  /** Camera centre in world pixels. */
  readonly x: number;
  readonly y: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly zoom: number;
  readonly shakeMagnitude: number;
  readonly shakeRemainingMs: number;
  readonly boundsClamped: boolean;
}

export interface RendererStats {
  readonly backend: 'webgl' | 'webgpu' | 'canvas' | 'unknown';
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly pixelRatio: number;
  readonly visibleChunks: number;
  readonly totalChunks: number;
  readonly renderedEntities: number;
}

export interface RendererInitOptions {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly resolution: number;
  readonly preference?: 'webgl' | 'webgpu';
}

/**
 * Rendering engine boundary. Implemented in src/rendering; consumed by src/game.
 */
export interface IRenderer {
  init(options: RendererInitOptions): Promise<void>;
  /** Loads texture bundles; `onProgress` receives 0..1. */
  loadAssets(onProgress?: (progress: number) => void): Promise<void>;
  /** Rebuilds static terrain for a new world. Safe to call repeatedly (frees old GPU resources). */
  setWorld(world: WorldData): void;
  /** Rebuilds the chunk containing the tile after a terrain mutation. */
  invalidateTile(tileX: number, tileY: number): void;
  render(snapshot: RenderSnapshot, alpha: number, frameDeltaMs: number): void;
  resize(width: number, height: number, resolution: number): void;
  shake(magnitude: number, durationMs: number): void;
  setZoom(zoom: number | 'auto'): void;
  getCamera(): CameraView;
  getStats(): RendererStats;
  /** World-pixel → screen-pixel (CSS px). */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number };
  screenToWorld(screenX: number, screenY: number): { x: number; y: number };
  destroy(): void;
}
