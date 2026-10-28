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
const input = new InputManager();
const renderer = new PixiRenderer();
const settings = new SettingsStore(localStorage);
const synth = new SoundSynthesizer();
const music = new MusicPlayer();
const bus = new EventBus();
registerAudioEvents(bus, synth, music);
function applySettings(): void {
  const v = settings.value;
  game.setMaxFps(v.maxFps); renderer.lightingEnabled = v.lighting; renderer.particlesEnabled = v.particles; renderer.hudVisible = v.hud; renderer.cloudsEnabled = v.clouds; renderer.hudScale = v.uiScale; simulation.invertY = v.invertY;
  document.documentElement.style.setProperty('--ui-scale', String(v.uiScale));
  synth.setMasterVolume(v.masterVolume); synth.setSfxVolume(v.sfxVolume); music.setVolume(v.masterVolume * v.musicVolume);
}
const tutorialBanner = document.createElement('aside'); tutorialBanner.id = 'tutorial-banner'; tutorialBanner.setAttribute('role', 'status'); document.body.append(tutorialBanner);
const shell = new GameShell(settings, applySettings);
const game = new Game({ canvas, simulation, renderer, input, bus, params,
  worlds: { generate: generateWorld, tutorial: generateTutorialWorld },
  shell: { onLoadingProgress: (p, text) => shell.onLoadingProgress(p, text), onLoadingFailed: e => shell.onLoadingFailed(e),
    onSceneChanged(scene) { shell.onSceneChanged(scene); renderer.paused = scene !== 'playing'; },
    onFrame() {
      const p = simulation.player;
      tutorialBanner.hidden = game.currentScene !== 'playing' || !simulation.world.meta.isTutorial || !settings.value.tutorials;
      const binding = (action: 'moveUp' | 'sprint' | 'attack') => String(input.getKeybinds()[action]?.[0] ?? '').replace('Key', '').replace('Left', '').replace('Mouse0', 'Left click');
      tutorialBanner.textContent = [`Explore the glade • Move with ${binding('moveUp')} and your direction keys`, `Pick up the pace • Hold ${binding('sprint')} while moving`, `Defeat the training beetle • Attack with ${binding('attack')}`, 'Collect the three gold coins', 'The portal is open • Step inside to begin your adventure'][simulation.tutorial.stage] ?? '';

      if (game.currentScene === 'playing') {
        if (p.stats.health <= 0) game.endRun('gameover');
        const portal = simulation.getEntities().find(e => e.kind === 'portal' && e.active);
        if (portal && Math.hypot(portal.x - p.x, portal.y - p.y) < 0.8) {
          if (simulation.world.meta.isTutorial) { shell.onboarding.value.complete = true; shell.onboarding.save(); game.startNewGame({ difficulty: settings.value.difficulty }); }
          else game.endRun('victory');
        }
      }
      renderer.hudText = `HP ${p.stats.health}/${p.stats.maxHealth}   Mana ${Math.floor(p.stats.mana)}   Stamina ${Math.floor(p.stats.stamina)}\nLevel ${p.stats.level}   XP ${p.stats.xp}/${p.stats.xpToNextLevel}   Coins ${p.stats.coins}`;
    },
  },
});
shell.game = game; shell.input = input; input.loadFromStorage();
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
