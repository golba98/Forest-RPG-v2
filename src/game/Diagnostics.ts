import type { EnemyEntity, Entity } from '../types/entities';
import type {
  EnemyState,
  GameDiagnosticsGateway,
  GameSnapshot,
  UIState,
  WorldState,
} from '../types/diagnostics';
import type { IRenderer } from '../types/render';
import type { ISimulation } from '../types/simulation';
import type { Game } from './Game';

/**
 * Optional hooks for features owned by other layers (terminal, persistence, UI).
 * Unimplemented hooks make the gateway report failure instead of throwing.
 */
export interface DiagnosticsHooks {
  executeCommand?(command: string): string;
  saveGame?(slot?: string): boolean;
  loadGame?(slot?: string): boolean;
  loadLegacySave?(payload: unknown): boolean;
  getUiState?(): UIState;
}

const DEFAULT_UI: UIState = {
  currentMenu: null,
  isTerminalOpen: false,
  isHUDVisible: true,
  activeDialog: null,
  compassVisible: false,
  compassAngle: 0,
};

function isEnemy(e: Entity): e is EnemyEntity {
  return e.kind === 'enemy';
}

/**
 * Builds the `window.__GAME__` gateway used by Playwright and the debug console.
 * Only installed in debug mode (dev build or `?debug=1`).
 */
export function createDiagnostics(
  game: Game,
  simulation: ISimulation,
  renderer: IRenderer,
  hooks: DiagnosticsHooks = {},
): GameDiagnosticsGateway {
  const getState = (): GameSnapshot => {
    const loop = game.getLoopStats();
    const rStats = renderer.getStats();
    const cam = renderer.getCamera();
    const world = simulation.world;
    const p = simulation.player;
    const entities = simulation.getEntities();
    const env = simulation.buildRenderSnapshot().environment;
    const scene = game.currentScene;

    const enemies: EnemyState[] = entities.filter(isEnemy).map((e) => ({
      id: e.id,
      type: e.enemyType,
      x: e.x,
      y: e.y,
      health: e.health,
      maxHealth: e.maxHealth,
      direction: e.facing,
      state: e.aiState,
      isAggro: e.aggressive && (e.aiState === 'chase' || e.aiState === 'attack'),
      isPanicking: e.aiState === 'flee',
      hurtTimer: e.hurtTimerMs,
      resistsKnockback: e.enemyType === 'beetle' || e.enemyType === 'ghost',
      immuneToCrush: e.enemyType === 'beetle' || e.enemyType === 'ghost',
    }));

    const portal = entities.find((e) => e.kind === 'portal');
    const worldState: WorldState = {
      level: world.meta.level,
      width: world.meta.width,
      height: world.meta.height,
      cellSize: 32,
      seed: world.meta.seed,
      isTutorial: world.meta.isTutorial,
      isPortalActive: portal?.kind === 'portal' ? portal.active : false,
      portalPos: { x: world.portal.x, y: world.portal.y },
      activeEnemiesCount: enemies.filter((e) => e.health > 0).length,
      coinCount: entities.filter((e) => e.kind === 'pickup' && e.pickupType === 'coin' && e.alive)
        .length,
      daylightCycleRatio: env.timeOfDay,
      weather: env.darkness > 0.6 ? 'night' : env.weather,
      ambientDarknessAlpha: env.darkness,
      starCount: env.darkness > 0.6 ? 500 : 0,
    };

    const ui = hooks.getUiState?.() ?? {
      ...DEFAULT_UI,
      currentMenu: scene === 'playing' ? null : scene,
    };

    return {
      timestamp: performance.now(),
      engine: {
        isRunning: loop.isRunning,
        isPaused: loop.isPaused || scene !== 'playing',
        targetFps: loop.targetFps,
        actualFps: loop.actualFps,
        fixedDeltaMs: loop.fixedDeltaMs,
        accumulatorMs: loop.accumulatorMs,
        stepCount: loop.stepCount,
        canvasWidth: rStats.canvasWidth,
        canvasHeight: rStats.canvasHeight,
        pixelRatio: rStats.pixelRatio,
      },
      player: {
        x: p.x,
        y: p.y,
        renderX: p.x,
        renderY: p.y,
        health: p.stats.health,
        maxHealth: p.stats.maxHealth,
        mana: p.stats.mana,
        maxMana: p.stats.maxMana,
        stamina: p.stats.stamina,
        maxStamina: p.stats.maxStamina,
        level: p.stats.level,
        xp: p.stats.xp,
        xpToNextLevel: p.stats.xpToNextLevel,
        statPoints: p.stats.statPoints,
        baseDamage: p.stats.baseDamage,
        isJumping: p.isJumping,
        isDashing: p.isDashing,
        isSprinting: p.isSprinting,
        jumpProgress: p.jumpProgress,
        hurtTimer: p.hurtTimerMs,
        comboCount: p.comboCount,
        direction: p.facing,
        coins: p.stats.coins,
        potions: { health: p.inventory.healthPotions, speed: p.inventory.speedPotions },
        speedBuffTimer: p.speedBuffMs,
        isInvulnerable: p.hurtTimerMs > 0,
      },
      camera: {
        x: cam.x,
        y: cam.y,
        targetX: cam.targetX,
        targetY: cam.targetY,
        zoom: cam.zoom,
        shakeMagnitude: cam.shakeMagnitude,
        shakeDuration: cam.shakeRemainingMs,
        boundsClamped: cam.boundsClamped,
      },
      world: worldState,
      enemies,
      ui,
    };
  };

  return {
    getState,
    getGameplayDebug: () => simulation.getGameplayDebug?.() ?? null,
    stepSimulation: (fixedDeltaSec) => game.stepOnce(fixedDeltaSec),
    pauseSimulation: () => game.pause(),
    resumeSimulation: () => game.resume(),
    setTimeScale: (scale) => game.setTimeScale(scale),
    executeCommand: (command) => hooks.executeCommand?.(command) ?? 'Terminal unavailable',
    saveGame: (slot) => hooks.saveGame?.(slot) ?? false,
    loadGame: (slot) => hooks.loadGame?.(slot) ?? false,
    loadLegacySave: (payload) => hooks.loadLegacySave?.(payload) ?? false,
    setPlayerPosition: (x, y) => simulation.setPlayerPosition(x, y),
    setPlayerHealth: (hp) => {
      const s = simulation.player.stats;
      s.health = Math.max(0, Math.min(hp, s.maxHealth));
    },
    setPlayerMana: (mana) => {
      const s = simulation.player.stats;
      s.mana = Math.max(0, Math.min(mana, s.maxMana));
    },
    setPlayerStamina: (stamina) => {
      const s = simulation.player.stats;
      s.stamina = Math.max(0, Math.min(stamina, s.maxStamina));
    },
    spawnEnemy: (type, x, y) => simulation.spawnEnemy(type, x, y),
    triggerCameraShake: (magnitude, durationMs) => renderer.shake(magnitude, durationMs),
    setDaylightRatio: (ratio) => simulation.setTimeOfDay(ratio),
  };
}
