import { PERF_BUILD } from './performance/FrameProfiler';
import { installProfiling } from './performance/install';
import { sessionFor } from './world/infinite/InfiniteSession';
import { enableLandscapeDiagnostics } from './world/LandscapeTrace';
import { Vector2 } from './core/math/Vector2';
import { EventBus } from './core/events/EventBus';
import { InputManager } from './core/input/InputManager';
import { Game } from './game/Game';
import { parseLaunchParams } from './game/LaunchParams';
import { createDiagnostics } from './game/Diagnostics';
import { PixiRenderer } from './rendering/PixiRenderer';
import { Simulation } from './simulation/Simulation';
import { generateWorld } from './world/WorldGenerator';
import { Terminal } from './ui/terminal/Terminal';
import { languageCode, translate } from './ui/i18n';
import { applyColorMode } from './ui/ColorMode';
import { GameShell } from './ui/GameShell';
import { SaveManager } from './persistence/SaveManager';
import { SettingsStore } from './persistence/SettingsStore';
import { SoundSynthesizer } from './audio/SoundSynthesizer';
import { MusicPlayer } from './audio/MusicPlayer';
import { registerAudioEvents } from './audio/AudioBridge';
import { generateTutorialWorld } from './world/TutorialMap';
import { attachVisualDebugControls } from './rendering/DebugOverlay';
import { queryColliders } from './systems/CollisionSystem';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Game canvas missing');
canvas.style.cssText = 'display:block;width:100vw;height:100vh;image-rendering:pixelated';
const loading = document.querySelector<HTMLElement>('#loading-screen');
const params = parseLaunchParams(location.search, import.meta.env.DEV);
enableLandscapeDiagnostics(params.debug);
const simulation = new Simulation();
simulation.onPortalChange = (change) => bus.emit('portal:stateChanged', change);
simulation.onRoundComplete = (status) => bus.emit('round:completed', status);
const input = new InputManager();
const renderer = new PixiRenderer();
renderer.prepareView = (width, height) => simulation.ensureView(width, height);
simulation.viewDimensions = () => ({
  width: innerWidth / renderer.getCamera().zoom / 32,
  height: innerHeight / renderer.getCamera().zoom / 32,
});
const settings = new SettingsStore(localStorage);
const synth = new SoundSynthesizer();
const music = new MusicPlayer();
const bus = new EventBus();
simulation.onEncounterCue = (kind) => {
  if (kind === 'nestWarning') synth.playNestWarning();
  else if (kind === 'ghostForm') synth.playGhostForm();
  else synth.playEnemySplat();
};
renderer.interactBinding = () =>
  String(input.getKeybinds().interact[0] ?? 'Unbound').replace(/^Key/, '');
registerAudioEvents(bus, synth, music);
simulation.onCut = (x, y, propId) => {
  if (propId === undefined) renderer.invalidateTile(x, y);
  else renderer.removeProp(propId);
};
simulation.onHit = (enemy, damage) => {
  renderer.shake(1.5, 110);
  renderer.showDamage(enemy.x, enemy.y, damage);
  bus.emit('entity:damaged', {
    id: enemy.id,
    type: enemy.enemyType,
    amount: damage,
    currentHealth: enemy.health,
    maxHealth: enemy.maxHealth,
    position: new Vector2(enemy.x, enemy.y),
  });
};
simulation.onFeedback = (kind, p, enemy) => {
  const position = new Vector2(p.x, p.y);
  if (kind === 'swing')
    bus.emit('player:attackSwing', {
      direction: simulation.getPlayerAttack()?.direction ?? p.facing,
      comboStep: simulation.getPlayerAttack()?.comboStep ?? (p.comboCount || 3),
    });
  else if (kind === 'spin' || kind === 'bolt') {
    bus.emit('player:castSpell', {
      spellId: kind === 'spin' ? 'spin' : 'projectile',
      manaCost: kind === 'spin' ? 30 : 20,
      position,
    });
    if (kind === 'spin') {
      renderer.shake(3, 200);
      renderer.playEffect('spin', p.x, p.y);
    }
  } else if (kind === 'hurt')
    bus.emit('player:damaged', {
      amount: 1,
      currentHealth: p.stats.health,
      maxHealth: p.stats.maxHealth,
      source: 'enemy',
    });
  else if (kind === 'coin')
    bus.emit('player:coinCollected', { value: 1, totalCoins: p.stats.coins, position });
  else if (kind === 'level')
    bus.emit('player:levelUp', { newLevel: p.stats.level, statPoints: p.stats.statPoints });
  else if (kind === 'crush' && enemy)
    bus.emit('entity:crushed', {
      id: enemy.id,
      type: enemy.enemyType,
      position: new Vector2(enemy.x, enemy.y),
    });
};
function applySettings(): void {
  const v = settings.value;
  document.documentElement.lang = languageCode(v.language);
  renderer.language = v.language;
  if (canvas) applyColorMode(canvas, v.colorMode);
  game.setMaxFps(v.maxFps);
  renderer.lightingEnabled = v.lighting;
  renderer.particlesEnabled = v.particles;
  renderer.hudVisible = v.hud;
  renderer.cloudsEnabled = v.clouds;
  renderer.hudScale = v.uiScale;
  simulation.invertY = v.invertY;
  simulation.sensitivity = v.sensitivity;
  renderer.cameraShakeEnabled = v.shake;
  renderer.starsEnabled = v.showStars;
  renderer.firefliesEnabled = v.fireflies;
  renderer.performanceEnabled = v.performance;
  document.documentElement.style.setProperty('--ui-scale', String(v.uiScale));
  synth.setMasterVolume(v.masterVolume);
  synth.setSfxVolume(v.sfxVolume);
  music.setVolume(v.masterVolume * v.musicVolume);
}
const tutorialBanner = document.createElement('aside');
tutorialBanner.id = 'tutorial-banner';
tutorialBanner.setAttribute('role', 'status');
document.body.append(tutorialBanner);
const shell = new GameShell(settings, applySettings);
const game = new Game({
  canvas,
  simulation,
  renderer,
  input,
  bus,
  params,
  worlds: {
    generate: (options) =>
      new URLSearchParams(location.search).get('world') !== 'finite'
        ? simulation.prepareInfinite(options)
        : generateWorld(options),
    tutorial: generateTutorialWorld,
    release: (world) => sessionFor(world)?.dispose(),
  },
  shell: {
    onLoadingProgress: (p, text) => shell.onLoadingProgress(p, text),
    onLoadingFailed: (e) => shell.onLoadingFailed(e),
    onSceneChanged(scene) {
      shell.onSceneChanged(scene);
      renderer.paused = scene !== 'playing';
      if (audioUnlocked && scene === 'menu') void music.crossfadeTo('menu');
    },
    onSystemAction(action) {
      if (action === 'toggleTerminal') terminal?.open();
      else if (action === 'characterMenu') shell.showCharacter();
      else if (action === 'toggleMinimap') renderer.cycleMinimap();
    },
    onTutorialComplete() {
      shell.onboarding.value.complete = true;
      shell.onboarding.save();
    },
    onFrame() {
      const p = simulation.player;
      tutorialBanner.hidden =
        game.currentScene !== 'playing' ||
        !simulation.world.meta.isTutorial ||
        !settings.value.tutorials;
      const binding = (action: 'moveUp' | 'sprint' | 'attack') =>
        String(input.getKeybinds()[action]?.[0] ?? '')
          .replace('Key', '')
          .replace('Left', '')
          .replace('Mouse0', 'Left click');
      const t = (text: string) => translate(settings.value.language, text);
      tutorialBanner.textContent =
        [
          `${t('Explore the glade')} • ${t('Move with')} ${binding('moveUp')} ${t('and your direction keys')}`,
          `${t('Pick up the pace')} • ${t('Hold')} ${binding('sprint')} ${t('while moving')}`,
          `${t('Defeat the training beetle')} • ${t('Attack with')} ${binding('attack')}`,
          t('Collect the three gold coins'),
          `${t('The portal is open')} • ${t('Step inside to begin your adventure')}`,
        ][simulation.tutorial.stage] ?? '';

      renderer.hudData = { stats: p.stats, inventory: p.inventory };
    },
  },
});
shell.game = game;
shell.input = input;
shell.simulation = simulation;
input.loadFromStorage();
const saves = new SaveManager(
  localStorage,
  game,
  simulation,
  new URLSearchParams(location.search).get('world') !== 'finite',
);
shell.saves = saves;
const terminal = params.debug ? new Terminal(game, simulation, shell.onboarding, saves) : null;
window.setInterval(() => {
  if (game.currentScene === 'playing') {
    try {
      void Promise.resolve(saves.save()).catch((error) => console.warn('Autosave failed', error));
    } catch (error) {
      console.warn('Autosave failed', error);
    }
  }
}, 30000);
let audioUnlocked = false;
function unlockAudio(): void {
  if (audioUnlocked) return;
  audioUnlocked = true;
  void synth.init();
  void music
    .init()
    .then(() => music.play(game.currentScene === 'menu' ? 'menu' : 'game'))
    .catch((error) => console.warn('Audio unavailable', error));
}
document.addEventListener('pointerdown', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });
if (PERF_BUILD && new URLSearchParams(location.search).get('profile') === '1')
  installProfiling(game, simulation, renderer);
try {
  shell.onLoadingProgress(0, 'Checking saved games');
  await saves.initialize();
  await game.boot();
  applySettings();
  if (params.autostart)
    game.startNewGame({
      tutorial: params.tutorial ?? false,
      seed: params.seed ?? 123,
      difficulty: params.difficulty ?? 'normal',
    });
  if (params.debug)
    window.__GAME__ = createDiagnostics(game, simulation, renderer, {
      executeCommand: (command) => terminal?.execute(command) ?? 'Debug mode is disabled',
      saveGame: (slot) => {
        try {
          const result = saves.save(slot);
          return result instanceof Promise
            ? result.then(
                () => true,
                () => false,
              )
            : true;
        } catch {
          return false;
        }
      },
      loadGame: (slot) => {
        try {
          const result = saves.load(slot);
          return result instanceof Promise
            ? result.then(
                () => true,
                () => false,
              )
            : true;
        } catch {
          return false;
        }
      },
      loadLegacySave: (payload) => {
        try {
          const result = saves.import(JSON.stringify(payload));
          return result instanceof Promise
            ? result.then(
                () => true,
                () => false,
              )
            : true;
        } catch {
          return false;
        }
      },
    });
  if (params.debug) {
    renderer.setDebugEntitySource(() => simulation.getEntities());
    renderer.setDebugColliderSource((r) =>
      queryColliders(simulation.world, {
        minX: r.x / 32,
        minY: r.y / 32,
        maxX: (r.x + r.width) / 32,
        maxY: (r.y + r.height) / 32,
      }),
    );
    const controls = attachVisualDebugControls(canvas, renderer.debugOverlay);
    window.__RENDER_DEBUG__ = {
      getResidency: () => renderer.getStats().residency ?? null,
      setZoom: (zoom) => renderer.setZoom(zoom),
      setFlags: (flags) => {
        renderer.debugOverlay.setFlags(flags);
        controls.sync();
      },
      getFlags: () => renderer.debugOverlay.getFlags(),
      getInfo: () => renderer.getVisualDebugInfo(),
      setWeatherPreview: (weather) => {
        simulation.weatherOverride = weather;
        renderer.weatherPreview = weather;
      },
    };
  }
  loading?.classList.add('hidden');
} catch (error) {
  shell.onLoadingFailed(error instanceof Error ? error : new Error(String(error)));
  console.error(error);
}
