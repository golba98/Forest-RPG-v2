import { EventBus } from './core/events/EventBus';
import { InputManager } from './core/input/InputManager';
import { Game } from './game/Game';
import { parseLaunchParams } from './game/LaunchParams';
import { createDiagnostics } from './game/Diagnostics';
import { PixiRenderer } from './rendering/PixiRenderer';
import { Simulation } from './simulation/Simulation';
import { generateWorld } from './world/WorldGenerator';
import { generateTutorialWorld } from './world/TutorialMap';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Game canvas missing');
canvas.style.cssText = 'display:block;width:100vw;height:100vh;image-rendering:pixelated';
const loading = document.querySelector<HTMLElement>('#loading-screen');
const params = parseLaunchParams(location.search, import.meta.env.DEV);
const simulation = new Simulation();
const renderer = new PixiRenderer();
const game = new Game({ canvas, simulation, renderer, input: new InputManager(), bus: new EventBus(), params,
  worlds: { generate: generateWorld, tutorial: generateTutorialWorld },
  shell: {
    onLoadingProgress(progress, status) { const label = loading?.querySelector('span'); if (label) label.textContent = `${status} ${Math.round(progress * 100)}%`; },
    onLoadingFailed(error) { if (loading) loading.textContent = `Unable to start: ${error.message}`; },
  },
});
try {
  await game.boot();
  game.startNewGame({ tutorial: params.tutorial ?? false, seed: params.seed ?? 123, difficulty: params.difficulty ?? 'normal' });
  if (params.debug) window.__GAME__ = createDiagnostics(game, simulation, renderer);
  loading?.classList.add('hidden');
} catch (error) { console.error(error); }
