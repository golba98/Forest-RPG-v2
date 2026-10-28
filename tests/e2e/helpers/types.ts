/**
 * E2E Test Suite Types and Contracts for Forest RPG V2
 * Authoritative diagnostic state schemas exposed on `window.__GAME__`
 */

export type Direction = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export type EnemyType = 'mantis' | 'maggot' | 'beetle' | 'ghost';

export type EnemyAIState = 'idle' | 'patrol' | 'chase' | 'attack' | 'flee' | 'dead';

export interface PlayerState {
  x: number;
  y: number;
  renderX: number;
  renderY: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  stamina: number;
  maxStamina: number;
  level: number;
  xp: number;
  xpToNextLevel: number;
  statPoints: number;
  baseDamage: number;
  isJumping: boolean;
  isDashing: boolean;
  isSprinting: boolean;
  jumpProgress: number;
  hurtTimer: number;
  comboCount: number;
  direction: Direction;
  coins: number;
  potions: {
    health: number;
    speed: number;
  };
  speedBuffTimer: number;
  isInvulnerable: boolean;
}

export interface EnemyState {
  id: string;
  type: EnemyType;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  direction: Direction;
  state: EnemyAIState;
  isAggro: boolean;
  isPanicking: boolean;
  hurtTimer: number;
  resistsKnockback: boolean;
  immuneToCrush: boolean;
}

export interface CameraState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  zoom: number;
  shakeMagnitude: number;
  shakeDuration: number;
  boundsClamped: boolean;
}

export interface EngineState {
  isRunning: boolean;
  isPaused: boolean;
  targetFps: number;
  actualFps: number;
  fixedDeltaMs: number;
  accumulatorMs: number;
  stepCount: number;
  canvasWidth: number;
  canvasHeight: number;
  pixelRatio: number;
}

export interface WorldState {
  width: number;
  height: number;
  cellSize: number;
  seed: number;
  isTutorial: boolean;
  isPortalActive: boolean;
  portalPos: { x: number; y: number };
  activeEnemiesCount: number;
  coinCount: number;
  daylightCycleRatio: number;
  weather: 'clear' | 'leaves' | 'rain' | 'storm' | 'night';
  ambientDarknessAlpha: number;
  starCount: number;
}

export interface UIState {
  currentMenu: string | null;
  isTerminalOpen: boolean;
  isHUDVisible: boolean;
  activeDialog: string | null;
  compassVisible: boolean;
  compassAngle: number;
}

export interface GameSnapshot {
  timestamp: number;
  engine: EngineState;
  player: PlayerState;
  camera: CameraState;
  world: WorldState;
  enemies: EnemyState[];
  ui: UIState;
}

export interface LegacyActiveMapPayload {
  persistentGameId: string;
  timestamp: number;
  logicalW: number;
  logicalH: number;
  cellSize: number;
  mapStates: number[];
  terrainLayer: number[];
  treeObjects: Array<{ x: number; y: number }>;
  decorativeObjects?: Array<{ id: string; type: string; tileX: number; tileY: number }>;
  playerPosition?: { x: number; y: number };
  portalPos?: { x: number; y: number };
  isPortalActive?: boolean;
  enemies?: Array<{
    type: EnemyType;
    x: number;
    y: number;
    health: number;
    maxHealth: number;
    direction: Direction;
    moveTimer?: number;
  }>;
}

export interface LegacySettingsPayload {
  v: number;
  masterVol: number;
  musicVol: number;
  sfxVol: number;
  textSizeSetting: number;
  uiScale: number;
  difficulty: 'easy' | 'normal' | 'hard';
  fpsMode: string;
  targetFps: number;
  performanceOverlay: boolean;
  performanceOverlayEnabled: boolean;
  sensitivitySetting: number;
  invertYAxis: boolean;
  hudEnabled: boolean;
  showHUD: boolean;
  showTutorialsSetting: boolean;
  showTutorials: boolean;
  colorModeSetting: string;
  languageSetting: string;
  showStars: boolean;
  screenShakeEnabled: boolean;
  showParticles: boolean;
  showFireflyLighting: boolean;
}

export interface GameDiagnosticsGateway {
  getState(): GameSnapshot;
  stepSimulation(fixedDeltaSec?: number): void;
  pauseSimulation(): void;
  resumeSimulation(): void;
  setTimeScale(scale: number): void;
  executeCommand(command: string): string;
  saveGame(slot?: string): boolean;
  loadGame(slot?: string): boolean;
  loadLegacySave(payload: unknown): boolean;
  setPlayerPosition(x: number, y: number): void;
  setPlayerHealth(hp: number): void;
  setPlayerMana(mana: number): void;
  setPlayerStamina(stamina: number): void;
  spawnEnemy(type: EnemyType, x: number, y: number): string;
  triggerCameraShake(magnitude: number, durationMs: number): void;
  setDaylightRatio(ratio: number): void;
}

declare global {
  interface Window {
    __GAME__?: GameDiagnosticsGateway;
  }
}
