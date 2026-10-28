import { EventBus } from './core/events/EventBus';
import { InputManager } from './core/input/InputManager';
import { Game } from './game/Game';
import { parseLaunchParams } from './game/LaunchParams';
import { createDiagnostics } from './game/Diagnostics';
import { PixiRenderer } from './rendering/PixiRenderer';
import { Simulation } from './simulation/Simulation';
import { generateWorld } from './world/WorldGenerator';
import { GameShell } from './ui/GameShell';
import { SettingsStore } from './persistence/SettingsStore';
import { SoundSynthesizer } from './audio/SoundSynthesizer';
import { MusicPlayer } from './audio/MusicPlayer';
import { registerAudioEvents } from './audio/AudioBridge';
import { generateTutorialWorld } from './world/TutorialMap';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Game canvas missing');
canvas.style.cssText = 'display:block;width:100vw;height:100vh;image-rendering:pixelated';
const loading = document.querySelector<HTMLElement>('#loading-screen');
const params = parseLaunchParams(location.search, import.meta.env.DEV);
const simulation = new Simulation();
const renderer = new PixiRenderer();
const settings = new SettingsStore(localStorage);
const synth = new SoundSynthesizer();
const music = new MusicPlayer();
const bus = new EventBus();
registerAudioEvents(bus, synth, music);
function applySettings(): void {
  const v = settings.value;
  game.setMaxFps(v.maxFps); renderer.lightingEnabled = v.lighting; renderer.particlesEnabled = v.particles; renderer.hudVisible = v.hud;
  synth.setMasterVolume(v.masterVolume); synth.setSfxVolume(v.sfxVolume); music.setVolume(v.masterVolume * v.musicVolume);
}
const shell = new GameShell(settings, applySettings);
const game = new Game({ canvas, simulation, renderer, input: new InputManager(), bus, params,
  worlds: { generate: generateWorld, tutorial: generateTutorialWorld },
  shell: { onLoadingProgress: (p, text) => shell.onLoadingProgress(p, text), onLoadingFailed: e => shell.onLoadingFailed(e),
    onSceneChanged(scene) { shell.onSceneChanged(scene); },
    onFrame() {
      const p = simulation.player;
      if (game.currentScene === 'playing') {
        if (p.stats.health <= 0) game.endRun('gameover');
        const portal = simulation.getEntities().find(e => e.kind === 'portal' && e.active);
        if (portal && Math.hypot(portal.x - p.x, portal.y - p.y) < 0.8) game.endRun('victory');
      }
      renderer.hudText = `HP ${p.stats.health}/${p.stats.maxHealth}   Mana ${Math.floor(p.stats.mana)}   Stamina ${Math.floor(p.stats.stamina)}\nLevel ${p.stats.level}   XP ${p.stats.xp}/${p.stats.xpToNextLevel}   Coins ${p.stats.coins}`;
    },
  },
});
shell.game = game;
let audioUnlocked = false;
function unlockAudio(): void {
  if (audioUnlocked) return;
  audioUnlocked = true;
  void synth.init();
  void music.init().then(() => music.play(game.currentScene === 'menu' ? 'menu' : 'game')).catch(error => console.warn('Audio unavailable', error));
}
document.addEventListener('pointerdown', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });
try {
  await game.boot();
  applySettings();
  if (params.autostart) game.startNewGame({ tutorial: params.tutorial ?? false, seed: params.seed ?? 123, difficulty: params.difficulty ?? 'normal' });
  if (params.debug) window.__GAME__ = createDiagnostics(game, simulation, renderer);
  loading?.classList.add('hidden');
} catch (error) { console.error(error); }
