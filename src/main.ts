import { Application } from 'pixi.js';

export async function bootstrapGame(): Promise<Application> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!canvas) {
    throw new Error('Game canvas element #game-canvas not found');
  }

  const app = new Application();
  await app.init({
    canvas,
    width: 1280,
    height: 720,
    backgroundColor: 0x111e14,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    roundPixels: true,
  });

  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    loadingScreen.classList.add('hidden');
  }

  return app;
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    bootstrapGame().catch((err) => {
      console.error('Failed to initialize Forest RPG V2 engine:', err);
    });
  });
}
