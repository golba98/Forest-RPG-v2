import { TelemetryPipe } from './TelemetryPipe';
/* eslint-disable prefer-rest-params -- Preserve arguments without allocating rest arrays in hot hooks. */
import { activateCollector, type PerformanceCollector } from './FrameProfiler';
import { RouteDriver, type DriverOptions } from './RouteDriver';
import { GraphicsProbe } from './GraphicsProbe';
import { GameLoop } from '../core/loop/GameLoop';
import { Game } from '../game/Game';
import { IntentMapper } from '../game/IntentMapper';
import { Simulation } from '../simulation/Simulation';
import { EncounterSystem } from '../systems/EncounterSystem';
import { EnemyAISystem } from '../systems/EnemyAISystem';
import { EncounterDirector } from '../systems/EncounterDirector';
import { SurfaceMoisture, SurfaceSites } from '../systems/SurfaceMoisture';
import { InfiniteSession } from '../world/infinite/InfiniteSession';
import { ChunkSource } from '../world/infinite/ChunkSource';
import { WorldRepository } from '../persistence/WorldRepository';
import { SaveManager } from '../persistence/SaveManager';
import { PixiRenderer } from '../rendering/PixiRenderer';
import { TerrainChunks } from '../rendering/TerrainChunks';
import { WorldVisibility, WorldBoundsIndex } from '../rendering/WorldVisibility';
import { EntityAnimator } from '../rendering/EntityAnimator';
import { WorldObjects } from '../rendering/WorldObjects';
import { WaterLayer } from '../rendering/effects/WaterLayer';
import { SurfaceWaterLayer } from '../rendering/effects/SurfaceWaterLayer';
import { SkyLayer } from '../rendering/effects/SkyLayer';
import { WeatherLayer } from '../rendering/effects/WeatherLayer';
import { AmbientLayer } from '../rendering/effects/AmbientLayer';
import { EffectsLayer } from '../rendering/effects/EffectsLayer';
import { Minimap } from '../rendering/Minimap';
import { Hud } from '../rendering/Hud';
import { Container, Sprite, Texture } from 'pixi.js';

type Callable = (this: unknown, ...args: unknown[]) => unknown;
const fields = (value: object) => value as unknown as Record<string, unknown>;
export interface ProfileConfiguration {
  readonly maxFps?: number;
  readonly zoom?: number | 'auto';
  readonly weather?: 'clear' | 'rain' | null;
  readonly clouds?: boolean;
  readonly particles?: boolean;
  readonly lighting?: boolean;
  readonly preventDeath?: boolean;
  readonly gpu?: boolean;
}
function timed(
  metrics: PerformanceCollector,
  target: object,
  key: string,
  label: string,
  wall = false,
): () => void {
  const record = fields(target),
    original = record[key];
  if (typeof original !== 'function')
    throw new Error('Profiling hook missing: ' + label + ' (' + key + ')');
  const id = metrics.id(label),
    call = original as Callable;
  record[key] = function (this: unknown) {
    if (!metrics.active) return call.apply(this, arguments as unknown as unknown[]);
    const token = metrics.begin(id),
      start = wall ? performance.now() : 0;
    let value: unknown;
    try {
      value = call.apply(this, arguments as unknown as unknown[]);
    } finally {
      metrics.end(token);
    }
    if (wall && value instanceof Promise)
      return value.then(
        (result) => {
          metrics.event(label + '.wall', start, performance.now() - start);
          return result;
        },
        (error: unknown) => {
          metrics.event(label + '.wall', start, performance.now() - start, { failed: true });
          throw error;
        },
      );
    return value;
  };
  return () => {
    record[key] = original;
  };
}

export function installProfiling(game: Game, simulation: Simulation, renderer: PixiRenderer): void {
  const metrics = activateCollector(),
    graphics = new GraphicsProbe(metrics),
    pipe = new TelemetryPipe(metrics),
    undo: Array<() => void> = [];
  const hook = (target: object, key: string, label: string, wall = false) =>
    undo.push(timed(metrics, target, key, label, wall));
  const groups: [object, string, string[]][] = [
    [Game.prototype, 'game', ['fixedUpdate', 'renderFrame']],
    [IntentMapper.prototype, 'input', ['collect', 'nextIntent']],
    [
      Simulation.prototype,
      'simulation',
      [
        'step',
        'buildRenderSnapshot',
        'installStream',
        'loadWorld',
        'restoreInfinite',
        'getRuntimeState',
      ],
    ],
    [EncounterDirector.prototype, 'director', ['step', 'afterCombat']],
    [EncounterSystem.prototype, 'combat', ['step']],
    [EnemyAISystem.prototype, 'ai', ['step', 'navigate', 'separate', 'rebase']],
    [SurfaceMoisture.prototype, 'moisture', ['step', 'save', 'restore']],
    [
      InfiniteSession.prototype,
      'window',
      ['buildWindow', 'capture', 'hydrate', 'restoreMoisture', 'reveal', 'prune'],
    ],
    [WorldVisibility.prototype, 'visibility', ['update']],
    [WorldObjects.prototype, 'objects', ['setWorld', 'update']],
    [WorldBoundsIndex.prototype, 'objectIndex', ['query']],
    [EntityAnimator.prototype, 'animation', ['resolve']],
    [TerrainChunks.prototype, 'terrain', ['update', 'startJob', 'finishJob', 'rebase']],
    [PixiRenderer.prototype, 'renderer', ['setWorld', 'render', 'renderEntities']],
    [WaterLayer.prototype, 'water', ['update']],
    [SurfaceWaterLayer.prototype, 'puddles', ['update']],
    [SkyLayer.prototype, 'sky', ['update']],
    [WeatherLayer.prototype, 'weather', ['update']],
    [AmbientLayer.prototype, 'ambient', ['update']],
    [EffectsLayer.prototype, 'effects', ['update']],
    [Minimap.prototype, 'minimap', ['update', 'rebuild']],
    [Hud.prototype, 'hud', ['update']],
  ];
  for (const [target, prefix, keys] of groups)
    for (const key of keys) hook(target, key, prefix + '.' + key);
  hook(SurfaceSites, 'prepare', 'index.surfaceSites.prepare', true);
  hook(InfiniteSession.prototype, 'stageWindow', 'window.stageWindow', true);
  for (const key of ['prepareAt', 'checkpoint'])
    hook(InfiniteSession.prototype, key, 'window.' + key, true);
  for (const key of ['prepare', 'generate'])
    hook(ChunkSource.prototype, key, 'source.' + key, true);
  for (const key of ['establish', 'readChunk', 'checkpoint', 'compact', 'load', 'fork'])
    hook(WorldRepository.prototype, key, 'storage.' + key, true);
  for (const key of ['save', 'load', 'exportFile', 'importArchive'])
    hook(SaveManager.prototype, key, 'save.' + key, true);

  let pendingReady:
    { t: number; version: number; origin: { x: number; y: number }; visible: boolean } | undefined;
  const mount = fields(simulation).installStream as Callable;
  fields(simulation).installStream = function (this: unknown) {
    const result = mount.apply(this, arguments as unknown as unknown[]);
    pendingReady = {
      t: performance.now(),
      version: simulation.worldVersion,
      origin: simulation.stream?.origin ?? { x: 0, y: 0 },
      visible: false,
    };
    metrics.event('window.installed', pendingReady.t, 0, {
      version: pendingReady.version,
      origin: pendingReady.origin,
    });
    return result;
  };
  undo.push(() => {
    delete fields(simulation).installStream;
  });
  const readiness = () => {
    if (!pendingReady || !metrics.active) return;
    const ready = pendingReady;
    if (ready.t < metrics.startedAt) {
      pendingReady = undefined;
      return;
    }
    const terrain = fields(renderer).terrainChunks as TerrainChunks | null;
    if (!terrain) return;
    const record = fields(terrain),
      visible = record.visible as Set<string>,
      cache = record.cache as { entries: Map<string, unknown> };
    if (
      !pendingReady.visible &&
      visible.size &&
      [...visible].every((key) => cache.entries.has(key))
    ) {
      pendingReady.visible = true;
      const dataChunks = [
        ...new Set(
          [...visible].map((key) => {
            const [x, y] = key.split(',').map(Number);
            return (
              Math.floor(((x ?? 0) + ready.origin.x) / 32) +
              ',' +
              Math.floor(((y ?? 0) + ready.origin.y) / 32)
            );
          }),
        ),
      ];
      metrics.event('window.firstSafeFrame', pendingReady.t, performance.now() - pendingReady.t, {
        version: pendingReady.version,
        origin: pendingReady.origin,
        dataChunks,
      });
    }
    if (
      pendingReady.visible &&
      terrain.info.queuedChunks === 0 &&
      terrain.info.stagingBytes === 0
    ) {
      metrics.event('window.allPrepared', pendingReady.t, performance.now() - pendingReady.t, {
        version: pendingReady.version,
      });
      pendingReady = undefined;
    }
  };
  const loop = fields(GameLoop.prototype),
    tick = loop.tick as Callable,
    shouldRun = loop.shouldRunFrame as Callable;
  loop.shouldRunFrame = function (this: unknown, t: number) {
    metrics.raf(t);
    return shouldRun.call(this, t);
  };
  loop.tick = function (this: unknown) {
    if (metrics.active && game.currentScene !== 'playing' && metrics.label !== 'bootstrap') {
      metrics.event('scenario.interrupted.scene', performance.now(), 0, {
        scene: game.currentScene,
      });
      metrics.stop();
    }
    if (!metrics.active) return tick.apply(this, arguments as unknown as unknown[]);
    metrics.beginFrame();
    graphics.beginFrame();
    try {
      return tick.apply(this, arguments as unknown as unknown[]);
    } finally {
      graphics.endFrame();
      metrics.endFrame();
      readiness();
    }
  };
  undo.push(() => {
    loop.tick = tick;
    loop.shouldRunFrame = shouldRun;
  });
  hook(fields(renderer).actors as object, 'sortChildren', 'depth.sortChildren');
  const driver = new RouteDriver(simulation, (message) => {
    metrics.event('driver.interrupted', performance.now(), 0, { message });
    metrics.stop();
  });
  let preventDeath = false;
  const update = fields(game).fixedUpdate as Callable;
  fields(game).fixedUpdate = function (this: unknown) {
    if (preventDeath && simulation.player) {
      simulation.player.stats.health = simulation.player.stats.maxHealth;
    }
    return update.apply(this, arguments as unknown as unknown[]);
  };
  undo.push(() => {
    delete fields(game).fixedUpdate;
  });
  const simulate = simulation.step.bind(simulation);
  simulation.step = (dt, intent) => {
    simulate(dt, intent);
    if (preventDeath) simulation.player.stats.health = Math.max(1, simulation.player.stats.health);
  };
  undo.push(() => {
    delete fields(simulation).step;
  });
  const wait = simulation.isWaitingForWorld.bind(simulation),
    waitCount = metrics.id('stream.wait.fixedSteps');
  simulation.isWaitingForWorld = () => {
    const value = wait();
    if (value) {
      metrics.count(waitCount);
      metrics.count(metrics.id('stream.wait.' + (simulation.getWorldWaitReason() ?? 'other')));
    }
    return value;
  };
  undo.push(() => {
    delete fields(simulation).isWaitingForWorld;
    delete fields(renderer).init;
  });
  const init = renderer.init.bind(renderer);
  renderer.init = async (options) => {
    await init(options);
    const app = fields(renderer).app as { renderer: { gl: WebGL2RenderingContext } };
    graphics.attach(app.renderer.gl);
    graphics.attachBatches();
    const submit = app.renderer as unknown as Record<string, unknown>;
    undo.push(timed(metrics, submit, 'render', 'pixi.submit'));
    const render = submit.render as Callable;
    submit.render = function (this: unknown, options: { target?: unknown }) {
      const previous = graphics.terrainPass;
      graphics.terrainPass = !!options.target;
      try {
        return render.apply(this, arguments as unknown as unknown[]);
      } finally {
        graphics.terrainPass = previous;
      }
    };
  };
  let observer: PerformanceObserver | undefined;
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (entry.startTime >= metrics.startedAt)
          metrics.event('longtask', entry.startTime, entry.duration);
    });
    observer.observe({ entryTypes: ['longtask'] });
  }
  window.__PERF__ = {
    start: (label) => metrics.start(label),
    stop: () => metrics.stop(),
    reset: () => metrics.clear(),
    drain: () => metrics.drain(),
    configure(options) {
      if (options.maxFps !== undefined) game.setMaxFps(options.maxFps);
      if (options.zoom !== undefined) renderer.setZoom(options.zoom);
      if (options.weather !== undefined) {
        simulation.weatherOverride = options.weather;
        renderer.weatherPreview = options.weather;
      }
      if (options.clouds !== undefined) renderer.cloudsEnabled = options.clouds;
      if (options.particles !== undefined) renderer.particlesEnabled = options.particles;
      if (options.lighting !== undefined) renderer.lightingEnabled = options.lighting;
      if (options.preventDeath !== undefined) preventDeath = options.preventDeath;
      if (options.gpu !== undefined) graphics.gpuSampling = options.gpu;
    },
    snapshot() {
      const stream = simulation.stream,
        entities = simulation.getEntities();
      return {
        collector: metrics.snapshot(),
        transport: pipe.snapshot(),
        graphics: graphics.capabilities,
        scene: game.currentScene,
        streaming: simulation.getStreamingDebug(),
        renderer: renderer.getStats(),
        objects: (fields(renderer).worldObjects as WorldObjects).info,
        entities: entities.length,
        liveEnemies: entities.filter((e) => e.kind === 'enemy' && e.alive).length,
        props: simulation.world?.props.length,
        worldVersion: simulation.worldVersion,
        windowSize: simulation.world?.meta.width,
        seed: simulation.world?.meta.seed,
        generatorVersion: simulation.world?.meta.generatorVersion,
        deltaChunks: stream?.deltas.size ?? 0,
        player: {
          x: simulation.player?.x,
          y: simulation.player?.y,
          health: simulation.player?.stats.health,
        },
        loop: (fields(game).loop as GameLoop).getStats(),
        elapsedMs: simulation.elapsedMs,
        weather: simulation.getWeather(),
        preventDeath,
      };
    },
    startPipe: (url) => pipe.start(url),
    flushPipe: () => pipe.flush(),
    resources: () => resources(renderer),
    async fingerprint() {
      const world = simulation.world;
      const body = JSON.stringify({
        seed: world.meta.seed,
        origin: world.window && { x: world.window.originX, y: world.window.originY },
        tiles: Array.from(world.tiles),
        props: world.props,
      });
      const bytes = new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)),
      );
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    },
    editFixture() {
      const world = simulation.world,
        origin = simulation.stream?.origin;
      const prop = world.props.find(
        (p) =>
          p.kind === 'flower_pink' &&
          p.tileX > 48 &&
          p.tileY > 48 &&
          p.tileX < world.meta.width - 48 &&
          p.tileY < world.meta.height - 48,
      );
      if (!prop || !origin) throw new Error('Missing removable fixture');
      const record = { id: String(prop.id), x: prop.tileX + origin.x, y: prop.tileY + origin.y };
      simulation.applyWorldEdit({ kind: 'remove', ...record });
      return record;
    },
    pickups() {
      const origin = simulation.stream?.origin ?? { x: 0, y: 0 };
      return simulation
        .getEntities()
        .filter((e) => e.kind === 'pickup')
        .map((e) => ({ ...e, x: e.x + origin.x, y: e.y + origin.y }));
    },
    route: (options) => driver.start(options),
    stopRoute: () => driver.stop(),
    routeState: () => driver.snapshot(),
    kit: () => {
      simulation.player.inventory.healthPotions = 500;
      simulation.player.inventory.speedPotions = 500;
    },
    dispose() {
      metrics.clear();
      driver.stop();
      observer?.disconnect();
      graphics.dispose();
      pipe.dispose();
      for (const restore of undo.reverse()) restore();
      delete window.__PERF__;
    },
  };
  metrics.start('bootstrap');
}

function resources(renderer: PixiRenderer) {
  const app = fields(renderer).app as { stage: Container };
  const stack: Container[] = [app.stage],
    sources = new Set<Texture['source']>();
  let containers = 0,
    sprites = 0,
    visibleSprites = 0;
  while (stack.length) {
    const item = stack.pop();
    if (!item) break;
    containers++;
    if (item instanceof Sprite) {
      sprites++;
      if (item.isRenderable) visibleSprites++;
      sources.add(item.texture.source);
    }
    for (const child of item.children) stack.push(child);
  }
  const textures = fields(fields(renderer).textures as object),
    owned = textures.owned as Set<Texture>;
  for (const texture of owned) sources.add(texture.source);
  let estimatedSourceBytes = 0;
  for (const source of sources) estimatedSourceBytes += source.pixelWidth * source.pixelHeight * 4;
  return {
    containers,
    sprites,
    visibleSprites,
    sourceTextures: sources.size,
    ownedSubtextures: owned.size,
    estimatedSourceBytes,
    weather: (fields(renderer).weather as WeatherLayer).info,
    damageNumbers: (fields(renderer).damageNumbers as unknown[]).length,
    activeEffects: (fields(renderer).effects as EffectsLayer).activeCount,
    activeClouds: (fields(renderer).sky as SkyLayer).cloudCount,
  };
}
export type PerformanceEndpoint = NonNullable<Window['__PERF__']>;
declare global {
  interface Window {
    __PERF__?: {
      startPipe(url: string): void;
      flushPipe(): Promise<void>;
      start(label: string): void;
      stop(): void;
      reset(): void;
      drain(): ReturnType<PerformanceCollector['drain']>;
      configure(options: ProfileConfiguration): void;
      route(options: DriverOptions): void;
      stopRoute(): void;
      routeState(): ReturnType<RouteDriver['snapshot']>;
      kit(): void;
      snapshot(): unknown;
      resources(): unknown;
      fingerprint(): Promise<string>;
      editFixture(): { id: string; x: number; y: number };
      pickups(): unknown[];
      dispose(): void;
    };
  }
}
