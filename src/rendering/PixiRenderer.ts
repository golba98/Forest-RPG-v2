import { BIOMES } from '../world/Biomes';
import { EntityLayer } from './entities/EntityLayer';
import { createLootTextures } from './lootArt';
import { TerrainChunks } from './TerrainChunks';
import { vegetationFor } from './vegetationArt';
import { WorldDepthLayer, WorldObjects } from './WorldObjects';
import { WorldVisibility } from './WorldVisibility';

import { Application, Container, Graphics, Text, TextureSource } from 'pixi.js';
import { surfaceSites, type MoistureView } from '../systems/SurfaceMoisture';
import type { Entity, PlayerInventory, PlayerStats } from '../types/entities';
import type { Language } from '../types/languages';
import type { IRenderer, RendererInitOptions, RenderSnapshot } from '../types/render';
import type { WorldData } from '../types/world';
import { DECOR_KINDS, decorAlias } from './assetCatalog';
import { createBridgeTextures } from './bridgeArt';
import { Camera } from './Camera';
import {
  DebugOverlay,
  type DebugCollider,
  type SpriteDebugInfo,
  type VisualDebugInfo,
} from './DebugOverlay';
import { AmbientLayer } from './effects/AmbientLayer';
import { EffectsLayer } from './effects/EffectsLayer';
import {
  createEffectTextures,
  destroyEffectTextures,
  type EffectTextures,
} from './effects/proceduralTextures';
import { SkyLayer } from './effects/SkyLayer';
import { SurfaceWaterLayer } from './effects/SurfaceWaterLayer';
import { WaterLayer } from './effects/WaterLayer';
import { WeatherLayer } from './effects/WeatherLayer';
import { EncounterView } from './EncounterView';
import { GroveView } from './GroveView';
import { Hud } from './Hud';
import { Minimap } from './Minimap';
import { NestView } from './NestView';
import { readSafeAreaInsets } from './safeArea';
import { TextureStore } from './TextureStore';
import { createWaterTextures } from './waterArt';

const TILE = 32;

export class PixiRenderer implements IRenderer {
  language: Language = 'English';
  cameraShakeEnabled = true;
  starsEnabled = true;
  firefliesEnabled = true;
  performanceEnabled = false;
  cloudsEnabled = true;
  paused = false;
  lightingEnabled = true;
  particlesEnabled = true;
  hudVisible = true;
  hudScale = 1;
  hudData: { stats: PlayerStats; inventory: PlayerInventory } | null = null;
  /** Dev-only visual diagnostics (off by default). */
  readonly debugOverlay = new DebugOverlay();

  private weather = new WeatherLayer();
  private surfaceWater = new SurfaceWaterLayer();
  private moisture: MoistureView | undefined;
  private water = new WaterLayer();
  private performanceText = new Text({
    text: '',
    style: {
      fontFamily: 'monospace',
      fontSize: 12,
      fill: 0xffffff,
      stroke: { color: 0x102018, width: 3 },
    },
  });
  private impactHoldMs = 0;
  private damageNumbers: Array<{ text: Text; remaining: number }> = [];
  private encounterView = new EncounterView();
  private groveView = new GroveView();
  private nestView = new NestView();
  interactBinding: () => string = () => 'G';
  private hud: Hud | null = null;
  private minimap = new Minimap();
  private darkness = new Graphics();
  private visualTime = 0;
  private app = new Application();
  private textures = new TextureStore();
  private camera = new Camera();
  prepareView: ((widthTiles: number, heightTiles: number) => Promise<void>) | undefined;
  private viewRequest = 0;
  private desiredView: {
    width: number;
    height: number;
    resolution: number;
    zoom: number | 'auto';
  } | null = null;
  private requestView(
    change: Partial<{ width: number; height: number; resolution: number; zoom: number | 'auto' }>,
  ): void {
    const desired = {
      ...(this.desiredView ?? {
        width: this.app.screen.width,
        height: this.app.screen.height,
        resolution: this.app.renderer.resolution,
        zoom: this.camera.getZoomSetting(),
      }),
      ...change,
    };
    this.desiredView = desired;
    const ticket = ++this.viewRequest;
    const zoom =
      desired.zoom === 'auto'
        ? Camera.computeAutoZoom(desired.height, desired.resolution)
        : desired.zoom;
    void (
      this.prepareView?.(desired.width / zoom / TILE, desired.height / zoom / TILE) ??
      Promise.resolve()
    )
      .then(() => {
        if (ticket !== this.viewRequest) return;
        this.applyResize(desired.width, desired.height, desired.resolution);
        this.camera.setZoom(desired.zoom);
      })
      .catch((error) => console.warn('Cannot prepare camera view', error));
  }
  private root = new Container();
  private terrainChunks: TerrainChunks | null = null;
  private readonly visibility = new WorldVisibility();
  private residencyTime = 0;
  private renderCpuMs = 0;
  private readonly restoreTerrain = () => {
    if (this.world) {
      this.terrainChunks?.setWorld(this.world);
      this.visibility.reset();
    }
  };
  private bridgeGround = new Container();
  /** Flat decor (logs, flowers, pebbles, holes) drawn over terrain, never over actors. */
  private groundProps = new Container();
  private groundFx = new Container();
  private actors = new WorldDepthLayer();
  /** World-transformed layer drawn above the darkness overlay (fireflies). */
  private nightGlow = new Container();
  private streamingRebase = false;
  private teleportVersion = 0;
  private worldObjects = new WorldObjects(
    this.textures,
    this.actors,
    this.groundProps,
    this.bridgeGround,
    (sprite, asset, layer) => this.tag(sprite, asset, layer),
    (texture) => this.app.renderer.texture.initSource(texture.source),
  );
  private spriteInfo = new WeakMap<Container, SpriteDebugInfo>();
  private readonly entityLayer = new EntityLayer(
    this.textures,
    this.actors,
    this.groundFx,
    this.nestView,
    this.camera,
    this.spriteInfo,
    (sprite, asset, layer) => this.tag(sprite, asset, layer),
  );
  private renderedEntities = 0;
  private placeholderSprites = 0;
  private sky = new SkyLayer();
  private fx: EffectTextures | null = null;
  private ambient: AmbientLayer | null = null;
  private effects: EffectsLayer | null = null;
  private debugEntities: (() => readonly Entity[]) | null = null;
  /** Debug-only weather override for previewing rain (null follows the simulation). */
  weatherPreview: 'clear' | 'rain' | null = null;
  private debugColliders:
    | ((rect: { x: number; y: number; width: number; height: number }) => readonly DebugCollider[])
    | null = null;
  private world: WorldData | null = null;
  private visibleChunks = 0;

  async init(options: RendererInitOptions): Promise<void> {
    TextureSource.defaultOptions.scaleMode = 'nearest';
    await this.app.init({
      ...options,
      autoStart: false,
      sharedTicker: false,
      autoDensity: true,
      roundPixels: true,
      background: '#172c19',
    });
    this.app.stop();
    this.terrainChunks = new TerrainChunks(this.app.renderer, this.textures);
    this.app.canvas.addEventListener('webglcontextrestored', this.restoreTerrain);
    this.fx = createEffectTextures();
    this.ambient = new AmbientLayer(this.fx);
    this.effects = new EffectsLayer(this.actors, this.fx);
    this.groundFx.addChild(this.sky.shadows, this.effects.ground);
    this.root.addChild(
      this.terrainChunks.view,
      this.surfaceWater.view,
      this.water.view,
      this.weather.ground,
      this.bridgeGround,
      this.weather.deck,
      this.groundProps,
      this.groveView.ground,
      this.nestView.ground,
      this.groundFx,
      this.actors,
      this.encounterView.effects,
      this.nestView.particles,
      this.effects.overlay,
      this.ambient.leaves,
      this.sky.clouds,
      this.debugOverlay.worldLayer,
    );
    this.actors.sortableChildren = true;
    this.entityLayer.attach();
    this.nightGlow.addChild(this.ambient.fireflies, this.encounterView.glow);
    // Stars sit behind the world so they only show in the void around it.
    this.app.stage.addChild(
      this.ambient.stars,
      this.root,
      this.darkness,
      this.nightGlow,
      this.weather.sky,
      this.effects.transition,
      this.debugOverlay.screenLayer,
      this.minimap,
      this.performanceText,
    );
    this.resize(options.width, options.height, options.resolution);
  }

  async loadAssets(progress?: (p: number) => void): Promise<void> {
    await this.textures.load(progress);
    for (const [alias, texture] of createWaterTextures())
      this.textures.registerRuntime(alias, texture);
    for (const [alias, texture] of createLootTextures())
      this.textures.registerRuntime(alias, texture);
    for (const [alias, texture] of createBridgeTextures())
      this.textures.registerRuntime(alias, texture);
    const environmentTextures = [
      this.textures.get('lpc_trees'),
      this.textures.get('lpc_plants'),
      ...DECOR_KINDS.map((kind) => this.textures.get(decorAlias(kind))),
      ...(this.fx?.clouds ?? []),
    ];
    for (const texture of environmentTextures) this.app.renderer.texture.initSource(texture.source);
    this.hud = new Hud(this.textures.get('ui_heart'), [
      this.textures.get('item_potion_health'),
      this.textures.get('item_potion_speed'),
    ]);
    this.hud.layout(this.app.screen.width, this.app.screen.height, this.hudScale);
    this.app.stage.addChild(this.hud, this.encounterView.hud);
  }

  /** Authoritative entity list for the collision overlay (debug builds only). */
  setDebugEntitySource(source: () => readonly Entity[]): void {
    this.debugEntities = source;
  }

  /** Authoritative object colliders (tile units) inside a visible world-px rect, when the simulation provides them. */
  setDebugColliderSource(
    source: (rect: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) => readonly DebugCollider[],
  ): void {
    this.debugColliders = source;
  }

  private tag<T extends Container>(sprite: T, assetId: string, layer: string): T {
    this.spriteInfo.set(sprite, { assetId, layer });
    return sprite;
  }

  async prepareWorld(world: WorldData): Promise<void> {
    const aliases = new Set<string>();
    if ((world.window?.descriptor.generatorVersion ?? 0) >= 15)
      for (const id of new Set(world.environment?.biome ?? [0]))
        aliases.add(`${BIOMES[id]!.assets}_upland`);
    if (world.environment)
      for (const id of new Set(world.environment.biome)) aliases.add(BIOMES[id]!.assets);
    for (const prop of world.props) {
      const frame = vegetationFor(prop, world);
      if (frame?.atlas.startsWith('environment_')) aliases.add(frame.atlas);
    }
    await this.textures.ensure([...aliases]);
  }
  private releaseBiomeAssets(world: WorldData): void {
    const keep = new Set<string>();
    if ((world.window?.descriptor.generatorVersion ?? 0) >= 15)
      for (const id of new Set(world.environment?.biome ?? [0]))
        keep.add(`${BIOMES[id]!.assets}_upland`);
    if (world.environment)
      for (const id of new Set(world.environment.biome)) keep.add(BIOMES[id]!.assets);
    for (const prop of world.props) {
      const frame = vegetationFor(prop, world);
      if (frame) keep.add(frame.atlas);
    }
    this.textures.releaseEnvironmentExcept(keep);
  }
  isReady(): boolean {
    return !!this.world;
  }
  setWorld(world: WorldData): void {
    this.viewRequest++;
    this.desiredView = null;
    this.terrainChunks?.setWorld(world);
    this.worldObjects.clear();
    this.visibility.reset();
    this.residencyTime = 0;
    this.entityLayer.resetActors();
    this.effects?.clear();
    for (const n of this.damageNumbers) n.text.destroy();
    this.damageNumbers = [];
    // Walking into an open portal swaps the world: play the transition over the new one.
    if (this.entityLayer.enteringPortal) this.effects?.startTransition();
    this.entityLayer.enteringPortal = false;
    this.world = world;
    this.teleportVersion = world.window?.teleportVersion ?? 0;
    this.entityLayer.resetLoot();
    this.weatherPreview = null;
    this.weather.reset();
    this.surfaceWater.reset();
    this.water.reset(world);
    this.encounterView.reset();
    this.groveView.reset();
    this.nestView.reset();
    this.sky.setWorld(
      world.meta.width,
      world.meta.height,
      world.meta.seed,
      this.fx?.clouds ?? [],
      world.spawn.x,
      world.spawn.y,
    );
    this.worldObjects.setWorld(world);
    this.releaseBiomeAssets(world);
    this.ambient?.reset();
    this.camera.setWorldSize(
      world.window ? 0 : world.meta.width * TILE,
      world.window ? 0 : world.meta.height * TILE,
    );
    this.camera.snapTo((world.spawn.x + 0.5) * TILE, (world.spawn.y + 0.5) * TILE);
  }

  invalidateTile(x: number, y: number): void {
    this.terrainChunks?.invalidateTile(x, y);
  }

  removeProp(id: import('../types/world').WorldObjectId): void {
    this.worldObjects.removeProp(id);
  }

  render(snapshot: RenderSnapshot, alpha: number, dt: number): void {
    if (snapshot.world !== this.world && snapshot.world.window && this.world?.window) {
      this.streamingRebase = true;
      const dx = snapshot.world.window.originX - this.world.window.originX;
      const dy = snapshot.world.window.originY - this.world.window.originY;
      const camera = this.camera.getView();
      const player = snapshot.entities.find((e) => e.id === snapshot.playerId);
      if (player && Math.max(Math.abs(dx), Math.abs(dy)) > 64)
        this.camera.snapTo(player.x * TILE, player.y * TILE);
      else this.camera.snapTo(camera.x - dx * TILE, camera.y - dy * TILE);
      this.terrainChunks?.rebase(snapshot.world, dx, dy);
      this.worldObjects.setWorld(snapshot.world);
      this.releaseBiomeAssets(snapshot.world);
      this.sky.rebase(dx * TILE, dy * TILE, snapshot.world.meta.width, snapshot.world.meta.height);
      this.ambient?.rebase(dx * TILE, dy * TILE);
      this.effects?.rebase(dx * TILE, dy * TILE);
      this.entityLayer.rebase(dx * TILE, dy * TILE);
      for (const n of this.damageNumbers) {
        n.text.x -= dx * TILE;
        n.text.y -= dy * TILE;
      }
      this.world = snapshot.world;
      this.water.rebase(snapshot.world, dx * TILE, dy * TILE);
      this.surfaceWater.reset();
    }
    if (snapshot.world.window && snapshot.world.window.teleportVersion !== this.teleportVersion) {
      this.teleportVersion = snapshot.world.window.teleportVersion;
      const p = snapshot.entities.find((e) => e.id === snapshot.playerId);
      if (p) this.camera.snapTo(p.x * TILE, p.y * TILE);
    }
    const renderStart = performance.now();
    const fx = this.fx,
      effects = this.effects,
      ambient = this.ambient;
    if (!fx || !effects || !ambient) return;
    this.moisture = snapshot.moisture;
    const player = snapshot.entities.find((e) => e.id === snapshot.playerId);
    if (player)
      this.camera.follow(
        (player.prevX + (player.x - player.prevX) * alpha) * TILE,
        (player.prevY + (player.y - player.prevY) * alpha) * TILE,
        dt,
      );
    const transform = this.camera.getTransform();
    this.root.scale.set(transform.scale);
    this.root.position.set(transform.x, transform.y);
    this.nightGlow.scale.copyFrom(this.root.scale);
    this.nightGlow.position.copyFrom(this.root.position);
    const rect = this.camera.getVisibleRect();
    this.residencyTime += Math.max(0, dt);
    const regions = this.visibility.update(rect, dt);
    this.terrainChunks?.update(regions, this.residencyTime);
    this.worldObjects.update(
      regions,
      this.residencyTime,
      player ? { x: player.x * TILE, y: player.y * TILE } : undefined,
    );
    this.visibleChunks = this.terrainChunks?.info.visibleChunks ?? 0;
    const view = this.camera.getView();
    const weather = this.weatherPreview ?? snapshot.environment.weather;
    const raining = weather === 'rain' || weather === 'storm';
    this.sky.update(
      dt,
      view.x,
      view.y,
      this.paused,
      this.cloudsEnabled,
      raining,
      regions.preparation,
    );
    if (!this.paused) this.visualTime += dt;
    this.water.update(dt, this.paused, rect, snapshot.world);
    this.surfaceWater.update(
      snapshot.world,
      snapshot.moisture,
      rect,
      snapshot.elapsedMs ?? this.visualTime,
    );

    this.groveView.update(snapshot.encounters?.sites ?? [], this.actors, this.textures, fx.glow);
    this.nestView.update(snapshot, this.actors, this.textures, this.visualTime);
    this.entityLayer.render(snapshot, alpha, dt, player, fx, effects, {
      paused: this.paused,
      language: this.language,
      visualTime: this.visualTime,
      impactHoldMs: this.impactHoldMs,
      streamingRebase: this.streamingRebase,
      renderer: this.app.renderer,
    });
    this.renderedEntities = this.entityLayer.renderedEntities;
    this.placeholderSprites = this.entityLayer.placeholderSprites;
    this.streamingRebase = false;
    this.placeholderSprites += this.groveView.placeholderCount(this.textures);
    this.encounterView.update(
      snapshot,
      this.visualTime,
      this.app.screen.width,
      this.app.screen.height,
      this.interactBinding(),
      this.language,
    );
    this.encounterView.hud.visible = this.hudVisible;

    for (const n of this.damageNumbers) {
      if (!this.paused) {
        n.remaining -= dt;
        n.text.y -= dt * 0.025;
      }
      n.text.alpha = Math.min(1, n.remaining / 250);
    }
    this.damageNumbers = this.damageNumbers.filter((n) => {
      if (n.remaining > 0) return true;
      n.text.destroy();
      return false;
    });
    if (!this.paused) this.impactHoldMs = Math.max(0, this.impactHoldMs - dt);

    this.darkness.clear();
    if (this.lightingEnabled && snapshot.environment.darkness > 0) {
      const light = snapshot.environment.lights[0];
      const screen = light ? this.camera.worldToScreen(light.x * TILE, light.y * TILE) : null;
      for (let i = 0; i < 6; i++) {
        this.darkness
          .rect(0, 0, this.app.screen.width, this.app.screen.height)
          .fill({ color: 0x071129, alpha: snapshot.environment.darkness / 6 });
        if (light && screen)
          this.darkness
            .circle(screen.x, screen.y, light.radiusPx * transform.scale * (0.35 + i * 0.13))
            .cut();
      }
    }
    ambient.stars.visible = this.starsEnabled && snapshot.environment.darkness > 0.6;
    ambient.update(dt, rect, {
      paused: this.paused,
      leaves: this.particlesEnabled,
      fireflies: this.firefliesEnabled,
      darkness: snapshot.environment.darkness,
      worldWidth: snapshot.world.meta.width * TILE,
      worldHeight: snapshot.world.meta.height * TILE,
    });

    this.weather.update(dt, raining, {
      paused: this.paused,
      enabled: this.particlesEnabled,
      screenWidth: this.app.screen.width,
      screenHeight: this.app.screen.height,
      view: rect,
      world: snapshot.world,
      moisture: snapshot.moisture,
      player,
      worldToScreen: (x, y) => this.camera.worldToScreen(x, y),
    });
    effects.update(dt, this.paused, this.app.screen.width, this.app.screen.height);

    this.performanceText.visible = this.performanceEnabled;
    this.performanceText.text = `${dt > 0 ? Math.round(1000 / dt) : 0} FPS | ${this.visibleChunks}/${this.terrainChunks?.info.residentChunks ?? 0} chunks`;
    this.performanceText.position.set(20, this.app.screen.height - 24);
    const screenScale = this.hudScale * Math.max(1, Math.min(2, this.app.screen.height / 1080));
    this.minimap.visible =
      this.hudVisible &&
      this.minimap.currentMode !== 'hidden' &&
      !(snapshot.encounters?.boss && this.app.screen.width < 650);
    this.minimap.layout(this.app.screen.width, this.app.screen.height, screenScale);
    this.minimap.setView(rect);
    this.minimap.update(snapshot);
    if (this.hud) {
      this.hud.layout(
        this.app.screen.width,
        this.app.screen.height,
        screenScale,
        readSafeAreaInsets(),
        this.minimap.visible && this.minimap.currentMode === 'radar'
          ? this.minimap.getBounds()
          : null,
      );
      this.hud.visible = this.hudVisible;
      if (this.hudData) this.hud.update(this.hudData.stats, this.hudData.inventory, this.language);
    }
    if (this.debugOverlay.getFlags().enabled) {
      this.debugOverlay.update(
        {
          world: snapshot.world,
          entities: this.debugEntities?.() ?? [],
          colliders: this.debugColliders?.(rect) ?? null,
          visible: rect,
          actors: this.actors,
          spriteInfo: this.spriteInfo,
          screenToWorld: (x, y) => this.camera.screenToWorld(x, y),
          extraLines: [
            `portal ${this.entityLayer.portalStates.join(',') || '-'}  placeholders ${this.placeholderSprites}  fx ${effects.activeCount}  clouds ${this.sky.cloudCount}`,
          ],
        },
        this.app.screen.height,
      );
    }
    this.app.render();
    this.renderCpuMs = performance.now() - renderStart;
  }

  resize(width: number, height: number, resolution: number): void {
    if (this.world?.window && this.prepareView) {
      this.requestView({ width, height, resolution });
      return;
    }
    this.applyResize(width, height, resolution);
  }
  private applyResize(width: number, height: number, resolution: number): void {
    this.app.renderer.resolution = resolution;
    this.app.renderer.resize(width, height);
    this.camera.setViewport(width, height, resolution);
    this.ambient?.resizeStars(width, height);
  }

  showDamage(x: number, y: number, amount: number): void {
    this.impactHoldMs = 55;
    // Impact: sparks and a small ring where the blow landed.
    this.effects?.burst(x * TILE, y * TILE - 10, 0xfff1b0, 9, y * TILE + 50, 0.09);
    this.effects?.ring(x * TILE, y * TILE - 10, 18, 0xffffff, 180);
    const text = new Text({
      text: String(amount),
      style: {
        fontFamily: 'Georgia',
        fontSize: 18,
        fontWeight: 'bold',
        fill: 0xffe1a4,
        stroke: { color: 0x341816, width: 3 },
      },
    });
    text.anchor.set(0.5, 1);
    text.position.set(x * TILE, y * TILE - 28);
    text.zIndex = y * TILE + 100;
    this.actors.addChild(text);
    this.damageNumbers.push({ text, remaining: 700 });
  }
  /** One-off combat effects triggered by the game layer (tile coordinates). */
  playEffect(kind: 'spin', x: number, y: number): void {
    if (kind === 'spin') this.effects?.ring(x * TILE, y * TILE - 8, 3.5 * TILE, 0xbfe8ff, 320);
  }

  /** M key: radar → full map → hidden. */
  cycleMinimap(): void {
    this.minimap.cycle();
  }

  shake(magnitude: number, durationMs: number): void {
    if (this.cameraShakeEnabled) this.camera.shake(magnitude, durationMs);
  }
  setZoom(zoom: number | 'auto'): void {
    if (this.world?.window && this.prepareView) {
      this.requestView({
        zoom: zoom === 'auto' ? 'auto' : Number.isFinite(zoom) ? Math.max(0.5, zoom) : 'auto',
      });
      return;
    }
    this.camera.setZoom(zoom);
  }
  getCamera() {
    return this.camera.getView();
  }
  getStats() {
    return {
      backend: 'webgl' as const,
      canvasWidth: this.app.canvas.width,
      canvasHeight: this.app.canvas.height,
      pixelRatio: this.app.renderer.resolution,
      visibleChunks: this.visibleChunks,
      totalChunks: this.world
        ? Math.ceil(this.world.meta.width / 16) * Math.ceil(this.world.meta.height / 16)
        : 0,
      renderedEntities: this.renderedEntities,
      placeholderSprites: this.placeholderSprites,
      residency: this.terrainChunks
        ? { ...this.terrainChunks.info, renderCpuMs: this.renderCpuMs }
        : undefined,
    };
  }
  /** Debug-only counters for visual regression tests. */
  getVisualDebugInfo(): VisualDebugInfo {
    const objects = this.worldObjects.debugRecords;
    const objectInfo = this.worldObjects.info;
    return {
      ...this.entityLayer.getDebugInfo(),
      environment: {
        ready: !!this.world,
        prefetching: false,
        residentChunks: this.terrainChunks?.info.residentChunks ?? 0,
        residentProps: objectInfo.residentObjects,
        visibleObjects: objects.filter((o) => o.visible).length,
        assetLoads: this.textures.environmentLoadStats,
        chunkBuildMs: [this.terrainChunks?.info.preparationMs ?? 0],
      },
      playerSlash: this.effects?.getPlayerSlash() ?? null,
      propViews: objectInfo.propViews,
      worldObjects: objects,
      residency: { ...this.terrainChunks?.info, ...objectInfo, renderCpuMs: this.renderCpuMs },
      atmosphere: this.sky.info,
      groveViews: this.groveView.info,
      hilltopViews: objects
        .filter((r) => r.hilltop && r.resident)
        .map((r) => ({ id: r.id ?? -1, x: r.x, y: r.y, depth: r.depth, visible: r.visible })),
      hud: this.hud?.getLayoutDebug() ?? null,
      placeholderSprites: this.placeholderSprites,
      clouds: this.sky.cloudCount,
      raining: this.weather.raining,
      weather: this.weather.info,
      puddles:
        this.world && this.moisture
          ? [...surfaceSites(this.world).pools]
              .filter(([i]) => (this.moisture?.puddles[i] ?? 0) >= 0.08)
              .map(([i, site]) => ({
                x: site.x,
                y: site.y,
                amount: this.moisture?.puddles[i] ?? 0,
              }))
          : [],
      riverRepairSkipped: this.world?.meta.riverRepairSkipped ?? [],
      effects: this.effects?.activeCount ?? 0,
      minimapMode: this.minimap.currentMode,
      transitionActive: this.effects?.transitionActive ?? false,
      actorChildren: this.actors.children.length,
      forestTrees: objectInfo.forestTrees,
      bridges: this.world?.bridges?.length ?? 0,
      bridgeRailSprites: objectInfo.bridgeRailSprites,
    };
  }
  worldToScreen(x: number, y: number) {
    return this.camera.worldToScreen(x, y);
  }
  screenToWorld(x: number, y: number) {
    return this.camera.screenToWorld(x, y);
  }
  destroy(): void {
    this.entityLayer.destroy();
    this.groveView.reset();
    this.sky.clear();
    this.effects?.clear();
    this.worldObjects.clear();
    this.terrainChunks?.clear();
    this.app.canvas.removeEventListener('webglcontextrestored', this.restoreTerrain);
    this.app.destroy(true, { children: true });
    this.textures.destroy();
    if (this.fx) destroyEffectTextures(this.fx);
  }
}
