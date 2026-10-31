import type { EnemyType, Entity, PlayerEntity, PlayerIntent } from '@/types/entities';
import type {
  CameraView,
  IRenderer,
  RendererInitOptions,
  RendererStats,
  RenderSnapshot,
} from '@/types/render';
import type { ISimulation } from '@/types/simulation';
import type { WorldData, WorldGenOptions } from '@/types/world';
import { Tile } from '@/types/tiles';
import { WORLD_GENERATOR_VERSION } from '@/types/world';
import type { WorldFactory } from '@/game/Game';

export function makeWorld(seed = 1, isTutorial = false): WorldData {
  const width = 8;
  const height = 8;
  return {
    meta: {
      seed,
      generatorVersion: WORLD_GENERATOR_VERSION,
      width,
      height,
      isTutorial,
      level: isTutorial ? 0 : 1,
      difficulty: 'normal',
    },
    tiles: new Uint8Array(width * height).fill(Tile.GRASS),
    props: [],
    spawn: { x: 4, y: 4 },
    portal: { x: 6, y: 6 },
    enemySpawns: [],
    pickupSpawns: [],
  };
}

export class FakeWorldFactory implements WorldFactory {
  public generated: WorldGenOptions[] = [];
  generate(options: WorldGenOptions): WorldData {
    this.generated.push(options);
    return makeWorld(options.seed);
  }
  tutorial(): WorldData {
    return makeWorld(0, true);
  }
}

function makePlayer(): PlayerEntity {
  return {
    id: 'player',
    kind: 'player',
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    halfSize: 0.3,
    facing: 'S',
    anim: 'idle',
    animTimeMs: 0,
    alive: true,
    vx: 0,
    vy: 0,
    stats: {
      health: 7,
      maxHealth: 7,
      mana: 100,
      maxMana: 100,
      stamina: 100,
      maxStamina: 100,
      level: 1,
      xp: 0,
      xpToNextLevel: 100,
      statPoints: 0,
      baseDamage: 1,
      coins: 0,
    },
    inventory: { healthPotions: 0, speedPotions: 0 },
    isSprinting: false,
    sprintLockoutMs: 0,
    isJumping: false,
    jumpProgress: 0,
    isDashing: false,
    hurtTimerMs: 0,
    comboCount: 0,
    speedBuffMs: 0,
  };
}

export class FakeSimulation implements ISimulation {
  public world: WorldData = makeWorld();
  public player: PlayerEntity = makePlayer();
  public worldVersion = 0;
  public elapsedMs = 0;
  public steps: PlayerIntent[] = [];
  private timeOfDay = 0.3;

  loadWorld(world: WorldData): void {
    this.world = world;
    this.worldVersion++;
    this.player = makePlayer();
    this.player.x = world.spawn.x + 0.5;
    this.player.y = world.spawn.y + 0.5;
  }
  step(dtSec: number, intent: PlayerIntent): void {
    this.steps.push(intent);
    this.elapsedMs += dtSec * 1000;
  }
  claimPortalTransition(): boolean {
    return false;
  }
  getEntities(): readonly Entity[] {
    return [this.player];
  }
  getPlayerAttack(): null {
    return null;
  }
  buildRenderSnapshot(): RenderSnapshot {
    return {
      world: this.world,
      worldVersion: this.worldVersion,
      entities: [],
      playerId: this.player.id,
      environment: { timeOfDay: this.timeOfDay, darkness: 0, weather: 'clear', lights: [] },
    };
  }
  setPlayerPosition(x: number, y: number): void {
    this.player.x = x;
    this.player.y = y;
  }
  spawnEnemy(type: EnemyType): string {
    return `${type}-1`;
  }
  setTimeOfDay(ratio: number): void {
    this.timeOfDay = ratio;
  }
  getTimeOfDay(): number {
    return this.timeOfDay;
  }
}

export class FakeRenderer implements IRenderer {
  public initialized = false;
  public worldsSet = 0;
  public frames = 0;
  public lastAlpha = -1;
  public resized: Array<[number, number, number]> = [];
  public destroyed = false;

  async init(_options: RendererInitOptions): Promise<void> {
    this.initialized = true;
  }
  async loadAssets(onProgress?: (p: number) => void): Promise<void> {
    onProgress?.(1);
  }
  setWorld(): void {
    this.worldsSet++;
  }
  invalidateTile(): void {}
  render(_snapshot: RenderSnapshot, alpha: number): void {
    this.frames++;
    this.lastAlpha = alpha;
  }
  resize(width: number, height: number, resolution: number): void {
    this.resized.push([width, height, resolution]);
  }
  shake(): void {}
  setZoom(): void {}
  getCamera(): CameraView {
    return {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      zoom: 2,
      shakeMagnitude: 0,
      shakeRemainingMs: 0,
      boundsClamped: false,
    };
  }
  getStats(): RendererStats {
    return {
      backend: 'unknown',
      canvasWidth: 800,
      canvasHeight: 600,
      pixelRatio: 1,
      visibleChunks: 0,
      totalChunks: 0,
      renderedEntities: 0,
    };
  }
  worldToScreen(x: number, y: number) {
    return { x, y };
  }
  screenToWorld(x: number, y: number) {
    return { x, y };
  }
  destroy(): void {
    this.destroyed = true;
  }
}
