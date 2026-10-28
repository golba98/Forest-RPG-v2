import { GameLoop } from '../core/loop/GameLoop';
import type { GameLoopStats } from '../core/loop/types';
import type { IEventBus } from '../core/events/types';
import type { InputAction } from '../core/input/types';
import type { InputManager } from '../core/input/InputManager';
import type { IRenderer } from '../types/render';
import type { ISimulation } from '../types/simulation';
import type { Difficulty, WorldData, WorldGenOptions } from '../types/world';
import { IntentMapper } from './IntentMapper';
import { randomSeed, type LaunchParams } from './LaunchParams';

export type SceneState =
  'loading' | 'menu' | 'playing' | 'paused' | 'gameover' | 'victory' | 'error';

export interface WorldFactory {
  generate(options: WorldGenOptions): WorldData;
  tutorial(): WorldData;
}

/**
 * Presentation hooks the game drives. Implemented by the DOM overlay layer;
 * every method is optional so the game runs headless (tests, benchmarks).
 */
export interface GameShell {
  onLoadingProgress?(progress: number, status: string): void;
  onLoadingFailed?(error: Error): void;
  onSceneChanged?(scene: SceneState, previous: SceneState): void;
  /** Called once per rendered frame after the world has been drawn. */
  onFrame?(frameDeltaMs: number): void;
  onTutorialComplete?(): void;
  /** System keys not handled by the game itself (terminal, character menu, minimap). */
  onSystemAction?(action: InputAction): void;
}

export interface GameDeps {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: IRenderer;
  readonly simulation: ISimulation;
  readonly input: InputManager;
  readonly bus: IEventBus;
  readonly worlds: WorldFactory;
  readonly params: LaunchParams;
  readonly shell?: GameShell;
  /** Viewport provider; defaults to the browser window. */
  readonly viewport?: () => { width: number; height: number; resolution: number };
}

export interface NewGameOptions {
  readonly tutorial?: boolean;
  readonly seed?: number;
  readonly difficulty?: Difficulty;
  readonly level?: number;
}

const SYSTEM_ACTIONS: readonly InputAction[] = ['toggleTerminal', 'characterMenu', 'toggleMinimap'];

/**
 * Composition root and lifecycle owner: wires the fixed-step loop to the
 * headless simulation and the renderer, and owns the scene state machine.
 */
export class Game {
  private readonly deps: GameDeps;
  private readonly loop: GameLoop;
  private readonly intents = new IntentMapper();
  private scene: SceneState = 'loading';
  private lastAlpha = 0;
  private timeScale = 1;
  private difficulty: Difficulty;
  private readonly disposers: Array<() => void> = [];

  constructor(deps: GameDeps) {
    this.deps = deps;
    this.difficulty = deps.params.difficulty ?? 'normal';
    this.loop = new GameLoop(
      {
        onFixedUpdate: (dtSec) => this.fixedUpdate(dtSec),
        onRender: (alpha, frameDeltaMs) => this.renderFrame(alpha, frameDeltaMs),
      },
      { renderWhilePaused: true },
    );
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Initialises the renderer and loads assets. Does not start gameplay. */
  public async boot(): Promise<void> {
    const { renderer, canvas, shell } = this.deps;
    const vp = this.viewport();
    try {
      shell?.onLoadingProgress?.(0, 'Starting renderer');
      await renderer.init({
        canvas,
        width: vp.width,
        height: vp.height,
        resolution: vp.resolution,
      });
      shell?.onLoadingProgress?.(0.1, 'Loading assets');
      await renderer.loadAssets((p) => shell?.onLoadingProgress?.(0.1 + p * 0.9, 'Loading assets'));
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.setScene('error');
      shell?.onLoadingFailed?.(error);
      throw error;
    }

    this.deps.input.attach(window, canvas);
    this.listen(window, 'resize', () => this.handleResize());
    this.listen(document, 'visibilitychange', () => {
      if (document.hidden && this.scene === 'playing') this.pause();
    });
    // Gameplay input is disabled while paused, so Escape-to-resume is handled at the
    // DOM level. Overlay menus that consume Escape themselves call preventDefault().
    this.listen(window, 'keydown', (ev) => {
      if (
        ev instanceof KeyboardEvent &&
        ev.code === 'Escape' &&
        !ev.defaultPrevented &&
        this.scene === 'paused'
      ) {
        this.resume();
      }
    });
    this.loop.start();
    this.setScene('menu');
  }

  public destroy(): void {
    this.loop.stop();
    for (const dispose of this.disposers.splice(0)) dispose();
    this.deps.input.detach();
    this.deps.renderer.destroy();
  }

  // ---------------------------------------------------------------------------
  // Game flow
  // ---------------------------------------------------------------------------

  public startNewGame(options: NewGameOptions = {}): void {
    if (options.difficulty) this.difficulty = options.difficulty;
    const world = options.tutorial
      ? this.deps.worlds.tutorial()
      : this.deps.worlds.generate({
          seed: options.seed ?? this.deps.params.seed ?? randomSeed(),
          level: options.level ?? 1,
          difficulty: this.difficulty,
        });
    this.loadWorld(world, 'new');
  }

  /** Loads an already-built world (new game, next level, or restored save). */
  public loadWorld(world: WorldData, mode: 'new' | 'loaded' = 'loaded'): void {
    this.deps.simulation.loadWorld(world);
    this.deps.renderer.setWorld(this.deps.simulation.world);
    this.intents.reset();
    if (this.loop.isPaused) this.loop.resume();
    this.setScene('playing');
    this.deps.bus.emit('game:started', { seed: world.meta.seed, mode });
  }

  /** Advance the current run without resetting player progression. */
  public advanceLevel(): void {
    const old = this.deps.simulation.player;
    const stats = { ...old.stats, coins: 0 };
    const inventory = { ...old.inventory };
    const speedBuffMs = old.speedBuffMs;
    const hauntedIntroComplete = old.hauntedIntroComplete ?? false;
    const level = this.deps.simulation.world.meta.level + 1;
    this.startNewGame({ level, difficulty: this.difficulty, seed: randomSeed() });
    Object.assign(this.deps.simulation.player.stats, stats);
    Object.assign(this.deps.simulation.player.inventory, inventory);
    this.deps.simulation.player.speedBuffMs = speedBuffMs;
    this.deps.simulation.player.hauntedIntroComplete = hauntedIntroComplete;
  }

  /** P key: a fresh procedural world at the current level. */
  public regenerateWorld(): void {
    const meta = this.deps.simulation.world.meta;
    this.startNewGame({ level: Math.max(1, meta.level), seed: randomSeed() });
  }

  public pause(): void {
    if (this.scene !== 'playing') return;
    this.loop.pause();
    this.setScene('paused');
  }

  public resume(): void {
    if (this.scene !== 'paused') return;
    this.loop.resume();
    this.setScene('playing');
  }

  public togglePause(): void {
    if (this.scene === 'playing') this.pause();
    else if (this.scene === 'paused') this.resume();
  }

  /** Ends the run (death or victory); simulation halts, rendering continues. */
  public endRun(outcome: 'gameover' | 'victory'): void {
    if (this.scene !== 'playing') return;
    this.loop.pause();
    this.setScene(outcome);
  }

  public returnToMenu(): void {
    if (!this.loop.isPaused) this.loop.pause();
    this.setScene('menu');
  }

  public async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (err) {
      console.warn('[Game] Fullscreen unavailable', err);
    }
  }

  public handleResize(): void {
    const vp = this.viewport();
    this.deps.renderer.resize(vp.width, vp.height, vp.resolution);
  }

  public setMaxFps(fps: number): void {
    this.loop.setMaxFps(fps);
  }

  // ---------------------------------------------------------------------------
  // Diagnostics / debug
  // ---------------------------------------------------------------------------

  public get currentScene(): SceneState {
    return this.scene;
  }

  public get currentDifficulty(): Difficulty {
    return this.difficulty;
  }

  public getLoopStats(): GameLoopStats {
    return this.loop.getStats();
  }

  /** Advances exactly one fixed step regardless of pause state (debug only). */
  public stepOnce(dtSec?: number): void {
    const stepMs = (dtSec ?? this.loop.getStats().fixedDeltaSec) * 1000;
    this.loop.step(stepMs);
  }

  public setTimeScale(scale: number): void {
    this.timeScale = Number.isFinite(scale) ? Math.min(Math.max(scale, 0), 8) : 1;
  }

  // ---------------------------------------------------------------------------
  // Loop callbacks
  // ---------------------------------------------------------------------------

  private fixedUpdate(dtSec: number): void {
    if (this.scene !== 'playing') return;
    const intent = this.intents.nextIntent(this.deps.input);
    const sim = this.deps.simulation;
    sim.step(dtSec * this.timeScale, intent);
    if (sim.player.stats.health <= 0) {
      this.endRun('gameover');
      return;
    }
    if (sim.claimPortalTransition()) {
      if (sim.world.meta.isTutorial) {
        this.deps.shell?.onTutorialComplete?.();
        this.startNewGame({ difficulty: this.difficulty });
      } else this.advanceLevel();
    }
  }

  private renderFrame(alpha: number, frameDeltaMs: number): void {
    const { input, renderer, simulation, shell } = this.deps;

    if (this.scene === 'playing') this.intents.collect(input);
    this.handleSystemKeys();
    input.clearFrameState();
    this.intents.endFrame();

    // While paused the loop reports alpha 0; keep the last alpha so nothing snaps back a step.
    if (!this.loop.isPaused) this.lastAlpha = alpha;
    if (this.scene !== 'loading' && this.scene !== 'error' && simulation.worldVersion > 0) {
      renderer.render(simulation.buildRenderSnapshot(), this.lastAlpha, frameDeltaMs);
    }
    shell?.onFrame?.(frameDeltaMs);
  }

  private handleSystemKeys(): void {
    const { input, shell } = this.deps;
    if (input.isActionJustPressed('pause')) this.togglePause();
    if (input.isActionJustPressed('fullscreen')) void this.toggleFullscreen();
    if (this.scene === 'playing' && input.isActionJustPressed('regenerateWorld'))
      this.regenerateWorld();
    for (const action of SYSTEM_ACTIONS) {
      if (input.isActionJustPressed(action)) shell?.onSystemAction?.(action);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private setScene(next: SceneState): void {
    if (next === this.scene) return;
    const previous = this.scene;
    this.scene = next;
    // Gameplay owns the keyboard only while playing; menus get normal DOM keys.
    this.deps.input.setEnabled(next === 'playing');
    this.deps.bus.emit('game:paused', { paused: next !== 'playing' });
    this.deps.shell?.onSceneChanged?.(next, previous);
  }

  private viewport(): { width: number; height: number; resolution: number } {
    if (this.deps.viewport) return this.deps.viewport();
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      resolution: window.devicePixelRatio || 1,
    };
  }

  private listen(target: EventTarget, type: string, handler: (ev: Event) => void): void {
    target.addEventListener(type, handler);
    this.disposers.push(() => target.removeEventListener(type, handler));
  }
}
