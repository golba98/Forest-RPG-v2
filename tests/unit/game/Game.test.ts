// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Game, type SceneState } from '@/game/Game';
import { EventBus } from '@/core/events/EventBus';
import { InputManager } from '@/core/input/InputManager';
import { parseLaunchParams } from '@/game/LaunchParams';
import { createDiagnostics } from '@/game/Diagnostics';
import { FakeRenderer, FakeSimulation, FakeWorldFactory } from './fakes';

describe('Game lifecycle', () => {
  let renderer: FakeRenderer;
  let simulation: FakeSimulation;
  let worlds: FakeWorldFactory;
  let input: InputManager;
  let game: Game;
  let scenes: SceneState[];

  beforeEach(async () => {
    renderer = new FakeRenderer();
    simulation = new FakeSimulation();
    worlds = new FakeWorldFactory();
    input = new InputManager();
    scenes = [];
    game = new Game({
      canvas: document.createElement('canvas'),
      renderer,
      simulation,
      input,
      bus: new EventBus(),
      worlds,
      params: parseLaunchParams('?seed=42', false),
      shell: { onSceneChanged: (s) => scenes.push(s) },
      viewport: () => ({ width: 800, height: 600, resolution: 1 }),
    });
    await game.boot();
  });

  afterEach(() => {
    game.destroy();
  });

  it('boots the renderer and lands on the menu without simulating', () => {
    expect(renderer.initialized).toBe(true);
    expect(game.currentScene).toBe('menu');
    game.stepOnce();
    expect(simulation.steps).toHaveLength(0);
  });

  it('starts a new game from the launch seed and simulates while playing', () => {
    game.startNewGame();
    expect(worlds.generated[0]?.seed).toBe(42);
    expect(renderer.worldsSet).toBe(1);
    expect(game.currentScene).toBe('playing');

    game.stepOnce();
    expect(simulation.steps).toHaveLength(1);
    expect(renderer.frames).toBe(1);
  });

  it('starts the tutorial world when requested', () => {
    game.startNewGame({ tutorial: true });
    expect(simulation.world.meta.isTutorial).toBe(true);
  });

  it('advances a level while preserving progression and inventory', () => {
    game.startNewGame();
    simulation.player.stats.health = 3;
    simulation.player.stats.level = 4;
    simulation.player.stats.xp = 12;
    simulation.player.stats.coins = 20;
    simulation.player.inventory.healthPotions = 2;
    game.advanceLevel();
    expect(worlds.generated[1]?.level).toBe(2);
    expect(simulation.player.stats).toMatchObject({ health: 3, level: 4, xp: 12, coins: 0 });
    expect(simulation.player.inventory.healthPotions).toBe(2);
  });

  it('pauses and resumes; no simulation while paused; input disabled while paused', () => {
    game.startNewGame();
    game.pause();
    expect(game.currentScene).toBe('paused');
    expect(input.enabled).toBe(false);
    expect(game.getLoopStats().isPaused).toBe(true);

    game.resume();
    expect(game.currentScene).toBe('playing');
    expect(input.enabled).toBe(true);
  });

  it('auto-pauses when the tab is hidden', () => {
    game.startNewGame();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(game.currentScene).toBe('paused');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });

  it('Escape resumes from pause at the DOM level', () => {
    game.startNewGame();
    game.pause();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(game.currentScene).toBe('playing');
  });

  it('P regenerates a new world while playing', () => {
    game.startNewGame();
    input.simulateKeyDown('KeyP');
    game.stepOnce();
    expect(worlds.generated).toHaveLength(2);
    expect(simulation.worldVersion).toBe(2);
  });

  it('forwards resize to the renderer', () => {
    window.dispatchEvent(new Event('resize'));
    expect(renderer.resized).toEqual([[800, 600, 1]]);
  });

  it('exposes a diagnostics snapshot', () => {
    game.startNewGame();
    const diag = createDiagnostics(game, simulation, renderer);
    const state = diag.getState();
    expect(state.world.seed).toBe(42);
    expect(state.player.health).toBe(7);
    expect(state.engine.isRunning).toBe(true);

    diag.setPlayerHealth(99);
    expect(diag.getState().player.health).toBe(7);
    expect(diag.executeCommand('/help')).toBe('Terminal unavailable');
  });

  it('records scene transitions in order', () => {
    game.startNewGame();
    game.pause();
    game.returnToMenu();
    expect(scenes).toEqual(['menu', 'playing', 'paused', 'menu']);
  });
});

describe('parseLaunchParams', () => {
  it('parses seed, tutorial, difficulty and debug flags', () => {
    const p = parseLaunchParams('?seed=123&tutorial=1&difficulty=hard&debug=1', false);
    expect(p).toMatchObject({ seed: 123, tutorial: true, difficulty: 'hard', debug: true });
  });

  it('rejects malformed values', () => {
    const p = parseLaunchParams('?seed=abc&difficulty=nightmare', false);
    expect(p.seed).toBeNull();
    expect(p.difficulty).toBeNull();
    expect(p.debug).toBe(false);
  });

  it('enables debug in dev builds', () => {
    expect(parseLaunchParams('', true).debug).toBe(true);
  });
});

describe('GameLoop frame limiter', () => {
  it('presents at most the capped rate on a 240 Hz display while keeping simulation speed', async () => {
    const { GameLoop } = await import('@/core/loop/GameLoop');
    let rafCb: ((t: number) => void) | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
      rafCb = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});

    let renders = 0;
    let steps = 0;
    const loop = new GameLoop({ onFixedUpdate: () => steps++, onRender: () => renders++ });
    loop.setMaxFps(60);

    let t = 0;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => t);
    loop.start();
    // 1 second of 240 Hz vsync callbacks
    for (let i = 0; i < 240; i++) {
      t += 1000 / 240;
      (rafCb as ((t: number) => void) | null)?.(t);
    }
    loop.stop();
    nowSpy.mockRestore();
    vi.unstubAllGlobals();

    expect(renders).toBeGreaterThanOrEqual(59);
    expect(renders).toBeLessThanOrEqual(61);
    expect(steps).toBeGreaterThanOrEqual(58);
    expect(steps).toBeLessThanOrEqual(60);
  });
});
