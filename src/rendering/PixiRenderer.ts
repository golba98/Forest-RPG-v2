import { TerrainChunks } from './TerrainChunks';
import { WorldDepthLayer, WorldObjects } from './WorldObjects';
import { WorldVisibility } from './WorldVisibility';
import { createLootTextures } from './lootArt';
import { LootView } from './LootView';

import { GroveView } from './GroveView';
import { surfaceSites, type MoistureView } from '../systems/SurfaceMoisture';
import { SurfaceWaterLayer } from './effects/SurfaceWaterLayer';
import { NestView } from './NestView';
import { EncounterView } from './EncounterView';
import { readSafeAreaInsets } from './safeArea';
import { nearbyWaterBounds, wadingPose } from './wadingGeometry';
import { Application, ColorMatrixFilter, Container, Graphics, Text, Sprite, type Texture, TextureSource } from 'pixi.js';
import type { IRenderer, RendererInitOptions, RenderEntityView, RenderSnapshot } from '../types/render';
import type { Entity } from '../types/entities';
import type { WorldData } from '../types/world';
import { translate } from '../ui/i18n';
import type { Language } from '../types/languages';
import { Minimap } from './Minimap';
import { Hud } from './Hud';
import type { PlayerInventory, PlayerStats } from '../types/entities';
import { Camera } from './Camera';
import { TextureStore } from './TextureStore';
import { DECOR_KINDS, decorAlias, PORTAL_ART_ALIAS } from './assetCatalog';
import { createWaterTextures, WATER_PALETTE } from './waterArt';
import { WaterLayer } from './effects/WaterLayer';
import { createBridgeTextures } from './bridgeArt';
import { resolveSpriteFrame } from '../animation/resolveSpriteFrame';
import { EntityAnimator } from './EntityAnimator';
import { PortalView } from './PortalView';
import { PORTAL_ENTER_RADIUS_ASSUMED, PortalVisualMachine } from './portalVisualState';
import { SkyLayer } from './effects/SkyLayer';
import { WeatherLayer } from './effects/WeatherLayer';
import { AmbientLayer } from './effects/AmbientLayer';
import { EffectsLayer } from './effects/EffectsLayer';
import { createEffectTextures, destroyEffectTextures, type EffectTextures } from './effects/proceduralTextures';
import { DebugOverlay, type DebugCollider, type SpriteDebugInfo, type VisualDebugInfo } from './DebugOverlay';

const TILE = 32;

const HURT_WHITE_MS = 70;
/** After the white flash the hurt tint stays red this long, then the sprite blinks for the rest of the invulnerability. */
const HURT_RED_MS = 220;
const FACING_ANGLE: Readonly<Record<string, number>> = { E: 0, SE: Math.PI / 4, S: Math.PI / 2, SW: (3 * Math.PI) / 4, W: Math.PI, NW: (-3 * Math.PI) / 4, N: -Math.PI / 2, NE: -Math.PI / 4 };
/** Matches the simulation's death display window (codex/gameplay-repair keeps dead enemies 450 ms). */
const DEATH_FADE_MS = 450;

/** Last drawn state of an entity sprite, kept so removals can fade out. */
interface EntityVisual {
  readonly sprite: Sprite;
  kind: RenderEntityView['kind'];
  spriteKey: string;
  hurtSince: number;
  /** The snapshot already showed this entity dying (`dead`), so removal needs no fade. */
  diedInView: boolean;
  quietRemoval: boolean;
  /** Soft ground shadow under characters and pickups (ground layer). */
  shadow: Sprite | null;
  lastAnim: string;
  lastAnimTimeMs: number;
  lastSwingId: number | null;
  /** Clip actually assigned to the sprite, retained during impact frame holds. */
  displayed: Pick<RenderEntityView, 'anim' | 'facing' | 'animTimeMs'> | null;
}

interface PortalEntry {
  readonly view: PortalView;
  readonly machine: PortalVisualMachine;
}

/** Player alpha while blinking out the post-hit invulnerability (~12 Hz). */
export function hurtBlinkAlpha(sinceHurtMs: number): number {
  return Math.floor(sinceHurtMs / 42) % 2 === 0 ? 0.35 : 1;
}

/**
 * Animation-set key for an entity. Projectiles arrive as `spriteKey:
 * 'projectile'`; their `projectileType` selects acid or magic-bolt art.
 */
function artKey(e: RenderEntityView): string {
  if (e.kind === 'projectile' && e.spriteKey === 'projectile') return e.projectileType ?? 'magic_bolt';
  return e.spriteKey;
}

export class PixiRenderer implements IRenderer {
  private readonly lootView = new LootView();
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
  private performanceText = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 12, fill: 0xffffff, stroke: { color: 0x102018, width: 3 } } });
  private impactHoldMs = 0;
  private damageNumbers: Array<{ text: Text; remaining: number }> = [];
  private encounterView = new EncounterView();
  private groveView = new GroveView();
  private nestView = new NestView();
  interactBinding: () => string = () => 'G';
  private waterMask = new Graphics();
  private waterRipple = new Graphics();
  private waterFxMask = new Graphics();
  private wading: ReturnType<typeof wadingPose> | null = null;
  private hud: Hud | null = null;
  private minimap = new Minimap();
  private darkness = new Graphics();
  private visualTime = 0;
  private app = new Application();
  private textures = new TextureStore();
  private camera = new Camera();
  prepareView:((widthTiles:number,heightTiles:number)=>Promise<void>)|undefined;
  private viewRequest=0;
  private desiredView:{width:number;height:number;resolution:number;zoom:number|'auto'}|null=null;
  private requestView(change:Partial<{width:number;height:number;resolution:number;zoom:number|'auto'}>):void{
    const desired={...(this.desiredView??{width:this.app.screen.width,height:this.app.screen.height,resolution:this.app.renderer.resolution,zoom:this.camera.getZoomSetting()}),...change};
    this.desiredView=desired;const ticket=++this.viewRequest;
    const zoom=desired.zoom==='auto'?Camera.computeAutoZoom(desired.height,desired.resolution):desired.zoom;
    void (this.prepareView?.(desired.width/zoom/TILE,desired.height/zoom/TILE)??Promise.resolve()).then(()=>{
      if(ticket!==this.viewRequest)return;
      this.applyResize(desired.width,desired.height,desired.resolution);this.camera.setZoom(desired.zoom);
    }).catch(error=>console.warn('Cannot prepare camera view',error));
  }
  private root = new Container();
  private terrainChunks: TerrainChunks | null = null;
  private readonly visibility = new WorldVisibility();
  private residencyTime = 0;
  private renderCpuMs = 0;
  private readonly restoreTerrain = () => {
    if (this.world) { this.terrainChunks?.setWorld(this.world); this.visibility.reset(); }
  };
  private bridgeGround = new Container();
  /** Flat decor (logs, flowers, pebbles, holes) drawn over terrain, never over actors. */
  private groundProps = new Container();
  private groundFx = new Container();
  private actors = new WorldDepthLayer();
  /** World-transformed layer drawn above the darkness overlay (fireflies). */
  private nightGlow = new Container();
  private streamingRebase = false;
  private teleportVersion=0;
  private entities = new Map<string, EntityVisual>();
  private portals = new Map<string, PortalEntry>();
  private worldObjects = new WorldObjects(this.textures, this.actors, this.groundProps, this.bridgeGround, (sprite, asset, layer) => this.tag(sprite, asset, layer), texture => this.app.renderer.texture.initSource(texture.source));
  private spriteInfo = new WeakMap<Container, SpriteDebugInfo>();
  private animator = new EntityAnimator();
  private sky = new SkyLayer();
  private fx: EffectTextures | null = null;
  private ambient: AmbientLayer | null = null;
  private effects: EffectsLayer | null = null;
  private hurtFilter = new ColorMatrixFilter();
  /** Lifts dark enemy sprites off the grass. */
  private enemyFilter = new ColorMatrixFilter();
  private debugEntities: (() => readonly Entity[]) | null = null;
  /** Debug-only weather override for previewing rain (null follows the simulation). */
  weatherPreview: 'clear' | 'rain' | null = null;
  private debugColliders: ((rect: { x: number; y: number; width: number; height: number }) => readonly DebugCollider[]) | null = null;
  private world: WorldData | null = null;
  private visibleChunks = 0;
  private renderedEntities = 0;
  private placeholderSprites = 0;
  /** Previous frame showed an open portal with the player inside its entry radius. */
  private enteringPortal = false;

  async init(options: RendererInitOptions): Promise<void> {
    TextureSource.defaultOptions.scaleMode = 'nearest';
    await this.app.init({ ...options, autoStart: false, sharedTicker: false, autoDensity: true, roundPixels: true, background: '#172c19' });
    this.app.stop();
    this.terrainChunks = new TerrainChunks(this.app.renderer, this.textures);
    this.app.canvas.addEventListener('webglcontextrestored', this.restoreTerrain);
    this.fx = createEffectTextures();
    this.ambient = new AmbientLayer(this.fx);
    this.effects = new EffectsLayer(this.actors, this.fx);
    this.hurtFilter.brightness(2.4, false);
    this.enemyFilter.brightness(1.18, false);
    this.groundFx.addChild(this.sky.shadows, this.effects.ground);
    this.root.addChild(this.terrainChunks.view, this.surfaceWater.view, this.water.view, this.weather.ground, this.bridgeGround, this.weather.deck, this.groundProps, this.groveView.ground, this.nestView.ground, this.groundFx, this.actors, this.encounterView.effects, this.nestView.particles, this.effects.overlay, this.ambient.leaves, this.sky.clouds, this.debugOverlay.worldLayer);
    this.actors.sortableChildren = true;
    this.actors.addChild(this.waterMask, this.waterRipple, this.waterFxMask);
    this.waterRipple.mask = this.waterFxMask;
    this.nightGlow.addChild(this.ambient.fireflies, this.encounterView.glow);
    // Stars sit behind the world so they only show in the void around it.
    this.app.stage.addChild(this.ambient.stars, this.root, this.darkness, this.nightGlow, this.weather.sky, this.effects.transition, this.debugOverlay.screenLayer, this.minimap, this.performanceText);
    this.resize(options.width, options.height, options.resolution);
  }

  async loadAssets(progress?: (p: number) => void): Promise<void> {
    await this.textures.load(progress);
    for (const [alias, texture] of createWaterTextures()) this.textures.registerRuntime(alias, texture);
    for (const [alias, texture] of createLootTextures()) this.textures.registerRuntime(alias, texture);
    for (const [alias, texture] of createBridgeTextures()) this.textures.registerRuntime(alias, texture);
    const environmentTextures = [
      this.textures.get('lpc_trees'), this.textures.get('lpc_plants'),
      ...DECOR_KINDS.map(kind => this.textures.get(decorAlias(kind))), ...(this.fx?.clouds ?? []),
    ];
    for (const texture of environmentTextures) this.app.renderer.texture.initSource(texture.source);
    this.hud = new Hud(this.textures.get('ui_heart'), [this.textures.get('item_potion_health'), this.textures.get('item_potion_speed')]);
    this.hud.layout(this.app.screen.width, this.app.screen.height, this.hudScale);
    this.app.stage.addChild(this.hud, this.encounterView.hud);
  }

  /** Authoritative entity list for the collision overlay (debug builds only). */
  setDebugEntitySource(source: () => readonly Entity[]): void {
    this.debugEntities = source;
  }

  /** Authoritative object colliders (tile units) inside a visible world-px rect, when the simulation provides them. */
  setDebugColliderSource(source: (rect: { x: number; y: number; width: number; height: number }) => readonly DebugCollider[]): void {
    this.debugColliders = source;
  }

  private tag<T extends Container>(sprite: T, assetId: string, layer: string): T {
    this.spriteInfo.set(sprite, { assetId, layer });
    return sprite;
  }

  setWorld(world: WorldData): void {
    this.viewRequest++;this.desiredView=null;
    this.terrainChunks?.setWorld(world);
    this.worldObjects.clear();
    this.visibility.reset();
    this.residencyTime = 0;
    for (const visual of this.entities.values()) { visual.sprite.destroy(); visual.shadow?.destroy(); }
    this.entities.clear();
    for (const { view } of this.portals.values()) view.destroy({ children: true });
    this.portals.clear();
    this.animator.clear();
    this.effects?.clear();
    for (const n of this.damageNumbers) n.text.destroy();
    this.damageNumbers = [];
    // Walking into an open portal swaps the world: play the transition over the new one.
    if (this.enteringPortal) this.effects?.startTransition();
    this.enteringPortal = false;
    this.world = world;
    this.teleportVersion=world.window?.teleportVersion??0;
    this.lootView.reset();
    this.actors.addChild(this.lootView.container);
    this.lootView.container.zIndex = 1e8;
    this.weatherPreview = null; this.weather.reset(); this.surfaceWater.reset(); this.water.reset(world);
    this.encounterView.reset();
    this.groveView.reset();
    this.nestView.reset();
    this.sky.setWorld(world.meta.width, world.meta.height, world.meta.seed, this.fx?.clouds ?? [], world.spawn.x, world.spawn.y);
    this.worldObjects.setWorld(world);
    this.ambient?.reset();
    this.camera.setWorldSize(world.window ? 0 : world.meta.width * TILE, world.window ? 0 : world.meta.height * TILE);
    this.camera.snapTo((world.spawn.x + 0.5) * TILE, (world.spawn.y + 0.5) * TILE);
  }

  invalidateTile(x: number, y: number): void { this.terrainChunks?.invalidateTile(x, y); }

  removeProp(id: import('../types/world').WorldObjectId): void { this.worldObjects.removeProp(id); }

  render(snapshot: RenderSnapshot, alpha: number, dt: number): void {
    if (snapshot.world !== this.world && snapshot.world.window && this.world?.window) {
      this.streamingRebase = true;
      const dx = snapshot.world.window.originX - this.world.window.originX;
      const dy = snapshot.world.window.originY - this.world.window.originY;
      const camera = this.camera.getView();
      const player=snapshot.entities.find(e=>e.id===snapshot.playerId);
      if(player && Math.max(Math.abs(dx),Math.abs(dy))>64)this.camera.snapTo(player.x*TILE,player.y*TILE);
      else this.camera.snapTo(camera.x-dx*TILE,camera.y-dy*TILE);
      this.terrainChunks?.rebase(snapshot.world,dx,dy);
      this.worldObjects.setWorld(snapshot.world);
      this.sky.rebase(dx*TILE,dy*TILE,snapshot.world.meta.width,snapshot.world.meta.height);
      this.ambient?.rebase(dx*TILE,dy*TILE);
      this.effects?.rebase(dx*TILE,dy*TILE);
      this.lootView.rebase(dx*TILE,dy*TILE);
      this.animator.rebase(dx*TILE,dy*TILE);
      for (const n of this.damageNumbers) { n.text.x -= dx*TILE; n.text.y -= dy*TILE; }
      this.world = snapshot.world;
      this.water.rebase(snapshot.world,dx*TILE,dy*TILE);
      this.surfaceWater.reset();
    }
    if(snapshot.world.window&&snapshot.world.window.teleportVersion!==this.teleportVersion){
      this.teleportVersion=snapshot.world.window.teleportVersion;
      const p=snapshot.entities.find(e=>e.id===snapshot.playerId);if(p)this.camera.snapTo(p.x*TILE,p.y*TILE);
    }
    const renderStart = performance.now();
    const fx = this.fx, effects = this.effects, ambient = this.ambient;
    if (!fx || !effects || !ambient) return;
    this.moisture = snapshot.moisture;
    const player = snapshot.entities.find(e => e.id === snapshot.playerId);
    if (player) this.camera.follow((player.prevX + (player.x - player.prevX) * alpha) * TILE, (player.prevY + (player.y - player.prevY) * alpha) * TILE, dt);
    const transform = this.camera.getTransform(); this.root.scale.set(transform.scale); this.root.position.set(transform.x, transform.y);
    this.nightGlow.scale.copyFrom(this.root.scale); this.nightGlow.position.copyFrom(this.root.position);
    const rect = this.camera.getVisibleRect();
    this.residencyTime += Math.max(0, dt);
    const regions = this.visibility.update(rect, dt);
    this.terrainChunks?.update(regions, this.residencyTime);
    this.worldObjects.update(regions, this.residencyTime);
    this.visibleChunks = this.terrainChunks?.info.visibleChunks ?? 0;
    const view = this.camera.getView();
    const weather = this.weatherPreview ?? snapshot.environment.weather;
    const raining = weather === 'rain' || weather === 'storm';
    this.sky.update(dt, view.x, view.y, this.paused, this.cloudsEnabled, raining, regions.preparation);
    if (!this.paused) this.visualTime += dt;
    this.water.update(dt, this.paused, rect, snapshot.world);
    this.surfaceWater.update(snapshot.world, snapshot.moisture, rect, snapshot.elapsedMs ?? this.visualTime);

    this.groveView.update(snapshot.encounters?.sites ?? [], this.actors, this.textures, fx.glow);
    this.nestView.update(snapshot, this.actors, this.textures, this.visualTime);
    this.renderEntities(snapshot, alpha, dt, player, fx, effects);
    this.placeholderSprites += this.groveView.placeholderCount(this.textures);
    this.encounterView.update(snapshot, this.visualTime, this.app.screen.width, this.app.screen.height, this.interactBinding(), this.language);
    this.encounterView.hud.visible = this.hudVisible;

    for (const n of this.damageNumbers) { if (!this.paused) { n.remaining -= dt; n.text.y -= dt * 0.025; } n.text.alpha = Math.min(1, n.remaining / 250); }
    this.damageNumbers = this.damageNumbers.filter(n => { if (n.remaining > 0) return true; n.text.destroy(); return false; });
    if (!this.paused) this.impactHoldMs = Math.max(0, this.impactHoldMs - dt);

    this.darkness.clear();
    if (this.lightingEnabled && snapshot.environment.darkness > 0) {
      const light = snapshot.environment.lights[0];
      const screen = light ? this.camera.worldToScreen(light.x * TILE, light.y * TILE) : null;
      for (let i = 0; i < 6; i++) {
        this.darkness.rect(0, 0, this.app.screen.width, this.app.screen.height).fill({ color: 0x071129, alpha: snapshot.environment.darkness / 6 });
        if (light && screen) this.darkness.circle(screen.x, screen.y, light.radiusPx * transform.scale * (0.35 + i * 0.13)).cut();
      }
    }
    ambient.stars.visible = this.starsEnabled && snapshot.environment.darkness > 0.6;
    ambient.update(dt, rect, { paused: this.paused, leaves: this.particlesEnabled, fireflies: this.firefliesEnabled, darkness: snapshot.environment.darkness, worldWidth: snapshot.world.meta.width * TILE, worldHeight: snapshot.world.meta.height * TILE });

    this.weather.update(dt, raining, { paused: this.paused, enabled: this.particlesEnabled, screenWidth: this.app.screen.width, screenHeight: this.app.screen.height, view: rect, world: snapshot.world, moisture: snapshot.moisture, player, worldToScreen: (x, y) => this.camera.worldToScreen(x, y) });
    effects.update(dt, this.paused, this.app.screen.width, this.app.screen.height);

    this.performanceText.visible = this.performanceEnabled; this.performanceText.text = `${dt > 0 ? Math.round(1000 / dt) : 0} FPS | ${this.visibleChunks}/${this.terrainChunks?.info.residentChunks ?? 0} chunks`; this.performanceText.position.set(20, this.app.screen.height - 24);
    const screenScale = this.hudScale * Math.max(1, Math.min(2, this.app.screen.height / 1080));
    this.minimap.visible = this.hudVisible && this.minimap.currentMode !== 'hidden' && !(snapshot.encounters?.boss && this.app.screen.width < 650); this.minimap.layout(this.app.screen.width, this.app.screen.height, screenScale); this.minimap.setView(rect); this.minimap.update(snapshot);
    if (this.hud) { this.hud.layout(this.app.screen.width, this.app.screen.height, screenScale, readSafeAreaInsets(), this.minimap.visible && this.minimap.currentMode === 'radar' ? this.minimap.getBounds() : null); this.hud.visible = this.hudVisible; if (this.hudData) this.hud.update(this.hudData.stats, this.hudData.inventory, this.language); }
    if (this.debugOverlay.getFlags().enabled) {
      this.debugOverlay.update({
        world: snapshot.world, entities: this.debugEntities?.() ?? [], colliders: this.debugColliders?.(rect) ?? null, visible: rect, actors: this.actors, spriteInfo: this.spriteInfo,
        screenToWorld: (x, y) => this.camera.screenToWorld(x, y),
        extraLines: [`portal ${[...this.portals.values()].map(p => p.machine.state).join(',') || '-'}  placeholders ${this.placeholderSprites}  fx ${effects.activeCount}  clouds ${this.sky.cloudCount}`],
      }, this.app.screen.height);
    }
    this.app.render();
    this.renderCpuMs = performance.now() - renderStart;
  }

  /** Pixel-art wading: submerged silhouette, stepped waterline, dotted ripple rings, trailing splash. */
  private drawWading(cx: number, cut: number, half: number, dx: number, dy: number): void {
    const g = this.waterRipple, t = this.visualTime, moving = dx !== 0 || dy !== 0;
    // Body under the surface: a dark, narrowing silhouette instead of a hard cut.
    for (let row = 0; row < 4; row++) g.rect(cx - half + row, cut + 1 + row, (half - row) * 2, 1).fill({ color: WATER_PALETTE.deep, alpha: 0.45 - row * 0.08 });
    // Collar: a steady pixel ellipse hugging the body at the surface.
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      g.rect(Math.round(cx + Math.cos(a) * (half + 2)), Math.round(cut + Math.sin(a) * 3), 1, 1).fill({ color: WATER_PALETTE.foam, alpha: 0.9 });
    }
    // Ripple rings: dotted ellipses that expand and fade; quicker while moving.
    const period = moving ? 620 : 1300;
    for (let k = 0; k < 2; k++) {
      const phase = (t / period + k / 2) % 1;
      const rx = half + 4 + phase * 14, ry = Math.max(2, rx * 0.34), dots = 16 + Math.round(phase * 12);
      for (let i = 0; i < dots; i++) {
        const a = (i / dots) * Math.PI * 2;
        g.rect(Math.round(cx + Math.cos(a) * rx), Math.round(cut + Math.sin(a) * ry), i % 3 ? 1 : 2, 1).fill({ color: WATER_PALETTE.foam, alpha: (1 - phase) * 0.95 });
      }
    }
    // Waterline: bright lip with a stepped, shorter row beneath it.
    g.rect(cx - half, cut - 1, half * 2, 1).fill({ color: WATER_PALETTE.foam, alpha: 0.95 });
    g.rect(cx - half + 2, cut, half * 2 - 4, 1).fill({ color: WATER_PALETTE.wave, alpha: 0.9 });
    if (!moving) return;
    // Splash droplets kicked up on the trailing side.
    const len = Math.hypot(dx, dy) || 1, bx = -dx / len, by = -dy / len;
    for (let i = 0; i < 4; i++) {
      const phase = (t / 340 + i / 4) % 1, side = (i % 2 ? 1 : -1) * (2 + i);
      const px = cx + bx * (half + phase * 7) - by * side, py = cut + by * phase * 4 + bx * side * 0.3 - Math.sin(phase * Math.PI) * 6;
      const size = phase < 0.6 ? 2 : 1;
      g.rect(Math.round(px), Math.round(py), size, size).fill({ color: i % 2 ? WATER_PALETTE.foam : WATER_PALETTE.glint, alpha: 1 - phase });
    }
  }

  private renderEntities(snapshot: RenderSnapshot, alpha: number, dt: number, player: RenderEntityView | undefined, fx: EffectTextures, effects: EffectsLayer): void {
    this.lootView.update(snapshot, this.paused ? 0 : dt, effects);
    this.waterMask.clear(); this.waterRipple.clear(); this.waterFxMask.clear(); effects.ground.clear();
    this.wading = null;
    effects.syncPlayerSlash(null);
    this.animator.beginFrame();
    const alive = new Set<string>(); this.renderedEntities = snapshot.entities.length; this.placeholderSprites = 0;
    let entering = false;
    for (const e of snapshot.entities) {
      alive.add(e.id);
      const x = (e.prevX + (e.x - e.prevX) * alpha) * TILE;
      const y = (e.prevY + (e.y - e.prevY) * alpha - e.lift) * TILE;
      if (e.kind === 'portal') { if (this.renderPortal(e, x, y, dt, snapshot, player, fx)) entering = true; continue; }
      const spriteKey = artKey(e);

      let visual = this.entities.get(e.id);
      const isNew = !visual;
      if (!visual) {
        visual = { sprite: new Sprite(), kind: e.kind, spriteKey, hurtSince: -1, diedInView: false, quietRemoval: false, shadow: null, lastAnim: e.anim, lastAnimTimeMs: e.animTimeMs, lastSwingId: null, displayed: null };
        if (e.kind !== 'projectile') {
          visual.shadow = new Sprite(fx.glow);
          visual.shadow.anchor.set(0.5);
          visual.shadow.tint = 0x000000;
          this.groundFx.addChild(visual.shadow);
        }
        this.actors.addChild(visual.sprite); this.entities.set(e.id, visual);
      }
      const sprite = visual.sprite;
      visual.kind = e.kind; visual.spriteKey = spriteKey;
      visual.quietRemoval = e.quietRemoval === true;
      const anim = this.animator.resolve(e.nestEmergence ? { ...e, spriteKey, anim: 'walk', moving: true, animTimeMs: e.nestEmergence.progress * 800 } : spriteKey === e.spriteKey ? e : { ...e, spriteKey }, this.paused ? 0 : dt, e.kind === 'player' ? { x, y: y + e.lift * TILE } : undefined);
      const f = resolveSpriteFrame(anim);
      const started = e.kind === 'player'
        ? !!e.attack && e.attack.swingId !== visual.lastSwingId
        : e.anim === 'attack' && (visual.lastAnim !== 'attack' || e.animTimeMs + 1 < visual.lastAnimTimeMs);
      // Hold a frame within its clip, never an old pose from another facing or
      // animation. A new swing must display its own first frame immediately.
      const holdFrame = this.impactHoldMs > 0 && !isNew && !started &&
        visual.displayed?.anim === anim.anim && visual.displayed.facing === anim.facing &&
        (e.kind === 'player' || e.kind === 'enemy');
      if (!holdFrame) {
        let texture: Texture;
        if (e.chest) texture = this.textures.get(`woodland_chest_${e.chest.variant}_${e.chest.state === 'closed' ? 0 : e.chest.state === 'opened' ? 3 : Math.min(2, 1 + Math.floor(e.chest.elapsedMs / 300))}`);
        else if (spriteKey === 'magic_bolt') texture = fx.bolt;
        else if (f.placeholder) texture = this.textures.getPlaceholder();
        else texture = this.textures.getRect(f.textureAlias, f.frame.x, f.frame.y, f.frame.w, f.frame.h);
        sprite.texture = texture;
        visual.displayed = { anim: anim.anim, facing: anim.facing, animTimeMs: anim.animTimeMs };
        this.spriteInfo.set(sprite, { assetId: spriteKey === 'magic_bolt' ? 'procedural:magic_bolt' : f.textureAlias || 'placeholder', layer: `actors/${e.kind}` });
      }
      if (this.textures.isPlaceholder(sprite.texture)) this.placeholderSprites++;

      const flip = f.flipX ? -1 : 1;
      let sx = f.scale * flip, sy = f.scale;
      if (spriteKey === 'coin') sx = sy = 1;
      if (anim.telegraph > 0) {
        // Wind-up: squash and a red ground ring under the attacker.
        sx *= 1 + 0.1 * anim.telegraph; sy *= 1 - 0.1 * anim.telegraph;
        effects.ground.circle(x, (e.y + 0.3) * TILE, 9 + (1 - anim.telegraph) * 8).stroke({ width: 1.5, color: 0xff4a3a, alpha: 0.85 * anim.telegraph });
      }
      if (spriteKey === 'magic_bolt') { sx = sy = 1; if (!this.paused) effects.trail(x, y, y - 1); }
      sprite.anchor.set(f.anchorX, f.anchorY); sprite.scale.set(sx, sy);
      sprite.position.set(x, y);
      if (spriteKey === 'coin') sprite.y -= Math.round(2 + Math.sin(e.animTimeMs / 190) * 2);
      sprite.zIndex = y + e.lift * TILE; sprite.alpha = e.alpha;
      if (e.kind === 'enemy') this.nestView.apply(e, sprite);
      if (e.formation !== undefined) {
        const progress = Math.max(1 / 16, Math.round(e.formation * 16) / 16);
        const growth = e.spriteKey === 'ghost' ? 0.5 + progress * 0.5 : progress;
        sprite.scale.y *= growth; sprite.y += 10 * (1 - growth);
      }
      if (e.dead) {
        // Death shown by the simulation: fade and shrink over its death window.
        const t = Math.min(1, anim.animTimeMs / DEATH_FADE_MS);
        visual.diedInView = true;
        sprite.alpha = e.alpha * (1 - t);
        sprite.scale.set(sx * (1 - 0.4 * t), sy * (1 - 0.4 * t));
      }

      // Hurt: a short white flash, a brief red tint, then (player) a blink for
      // the rest of the invulnerability instead of staying solid red.
      if (e.hurtFlash) {
        if (visual.hurtSince < 0) visual.hurtSince = this.visualTime;
        const since = this.visualTime - visual.hurtSince;
        const white = since < HURT_WHITE_MS, red = !white && since < HURT_RED_MS;
        sprite.filters = white ? [this.hurtFilter] : e.kind === 'enemy' ? [this.enemyFilter] : null;
        sprite.tint = red || (e.kind === 'enemy' && !white) ? 0xff8080 : 0xffffff;
        if (e.kind === 'player' && !white && !red) sprite.alpha *= hurtBlinkAlpha(since);
        if (e.kind === 'enemy' && since < 160) sprite.x += Math.sin(since / 18) * 1.5;
      } else {
        visual.hurtSince = -1;
        sprite.filters = e.kind === 'enemy' ? [this.enemyFilter] : null;
        sprite.tint = e.dead ? 0xffc4c4 : 0xffffff;
      }

      // Ground shadow: stays on the ground during a jump and shrinks with height.
      // The remaster's 64 px cell includes padding; preserve the old 40 px
      // player presentation width for shadows and water ripples.
      const effectWidth = e.kind === 'player' ? 40 : Math.abs(sprite.width);
      if (visual.shadow) {
        const groundY = (e.prevY + (e.y - e.prevY) * alpha) * TILE + (e.kind === 'pickup' ? 9 : 8);
        const w = Math.max(14, Math.min(46, effectWidth * 0.7)) * (1 - Math.min(0.5, e.lift * 0.3));
        visual.shadow.position.set(x, groundY);
        visual.shadow.scale.set(w / 64, (w * 0.34) / 64);
        visual.shadow.alpha = e.nestEmergence ? 0 : 0.42 * sprite.alpha;
      }

      // The simulation owns swing identity, combo and age. Following the same
      // interpolated origin as the actor keeps moving attacks aligned.
      if (e.kind === 'player') {
        effects.syncPlayerSlash(e.attack ? {
          swingId: e.attack.swingId, comboStep: e.attack.comboStep,
          x, y: y - 12, angle: FACING_ANGLE[e.attack.direction] ?? Math.PI / 2,
          age: e.attack.elapsedMs,
        } : null);
        visual.lastSwingId = e.attack?.swingId ?? null;
      }
      visual.lastAnim = e.anim; visual.lastAnimTimeMs = e.animTimeMs;

      if (e.kind === 'player') {
        if (e.submerged) {
          const pose = wadingPose(x, y);
          this.wading = pose;
          sprite.y = pose.spriteY;
          const height = Math.abs(sprite.height);
          const top = sprite.y - f.anchorY * height;
          const cut = Math.round(pose.waterlineY);
          this.waterMask.rect(sprite.x - 100, top - 5, 200, cut - top + 5).fill(0xffffff);
          sprite.mask = this.waterMask;
          for (const b of nearbyWaterBounds(snapshot.world, x, pose.waterlineY))
            this.waterFxMask.rect(b.minX * TILE, b.minY * TILE, (b.maxX - b.minX) * TILE, (b.maxY - b.minY) * TILE).fill(0xffffff);
          this.drawWading(Math.round(sprite.x), cut, Math.max(6, Math.round(effectWidth * 0.26)), e.x - e.prevX, e.y - e.prevY);
          // The ground shadow would show through the water as a dark blob.
          if (visual.shadow) visual.shadow.alpha = 0;
          this.waterRipple.zIndex = y + 1;
        } else sprite.mask = null;
      }
    }
    this.enteringPortal = entering;

    for (const [id, visual] of this.entities) {
      if (alive.has(id)) continue;
      const s = visual.sprite;
      if (!this.streamingRebase && !this.paused && !s.destroyed && !visual.quietRemoval) {
        if (visual.kind === 'enemy' && visual.diedInView) effects.burst(s.x, s.y - 10, 0xd9d2c4, 7, s.zIndex + 1, 0.05);
        else if (visual.kind === 'enemy') effects.spawnDeath(s.texture, s.x, s.y, s.anchor.x, s.anchor.y, s.scale.x, s.scale.y, s.zIndex);
        else if (visual.kind === 'pickup') effects.burst(s.x, s.y, visual.spriteKey === 'coin' ? 0xffd84a : 0xf0f0ff, 8, s.zIndex + 1);
        else if (visual.kind === 'projectile') effects.burst(s.x, s.y, visual.spriteKey === 'acid' ? 0x9be04a : 0x8fe3ff, 5, s.zIndex + 1, 0.04);
      }
      visual.shadow?.destroy();
      s.destroy(); this.entities.delete(id);
    }
    for (const [id, entry] of this.portals) if (!alive.has(id)) { entry.view.destroy({ children: true }); this.portals.delete(id); }
    this.animator.sweep();
    this.streamingRebase = false;
  }

  /** Draws one portal; returns true when the player is inside an open portal's entry radius. */
  private renderPortal(e: RenderEntityView, x: number, y: number, dt: number, snapshot: RenderSnapshot, player: RenderEntityView | undefined, fx: EffectTextures): boolean {
    if(snapshot.world.window){
      const rect=this.camera.getVisibleRect();
      if(x<rect.x-128||y<rect.y-128||x>rect.x+rect.width+128||y>rect.y+rect.height+128){const offscreen=this.portals.get(e.id);if(offscreen)offscreen.view.visible=false;return false;}
    }
    let entry = this.portals.get(e.id);
    if (!entry) {
      const view = this.tag(new PortalView(this.textures.get(PORTAL_ART_ALIAS), fx), PORTAL_ART_ALIAS, 'actors/portal');
      entry = { view, machine: new PortalVisualMachine() };
      this.actors.addChild(view); this.portals.set(e.id, entry);
    }
    if (this.textures.isPlaceholder(entry.view.artTexture)) this.placeholderSprites++;
    entry.view.visible=true;
    const distance = player ? Math.hypot(e.x - player.x, e.y - player.y) : Infinity;
    const state = entry.machine.update({ active: e.active === true, explicit: e.portalState, playerDistance: distance, dtMs: this.paused ? 0 : dt });
    let label: string;
    if (state === 'open' || state === 'transitioning') label = translate(this.language, 'PORTAL OPEN');
    else {
      const coins = snapshot.round?.coinsRemaining ?? snapshot.entities.filter(item => item.spriteKey === 'coin' && item.requiredForCompletion !== false).length;
      const enemies = snapshot.round?.enemiesRemaining ?? snapshot.entities.filter(item => item.kind === 'enemy' && item.spriteKey !== 'ghost').length + (snapshot.encounters?.pendingBosses ?? 0);
      const progress = `${coins} ${translate(this.language, 'Coins')} • ${enemies} ${translate(this.language, 'foes')}`;
      label = state === 'reacting' ? `${translate(this.language, 'Portal sealed')}\n${progress}` : progress;
    }
    // Foot point = bottom edge of the portal tile; the steps cover the entry point.
    entry.view.position.set(x, y + TILE / 2);
    entry.view.zIndex = entry.view.y;
    entry.view.update(state, entry.machine.reactProgress, dt, this.paused, label);
    // Generous margin: at low frame rates a sprinting player can cross the
    // entry radius between two rendered frames.
    return (state === 'open' || state === 'transitioning') && distance <= PORTAL_ENTER_RADIUS_ASSUMED + 0.8;
  }

  resize(width: number, height: number, resolution: number): void {
    if(this.world?.window&&this.prepareView){this.requestView({width,height,resolution});return;}
    this.applyResize(width,height,resolution);
  }
  private applyResize(width:number,height:number,resolution:number):void{
    this.app.renderer.resolution = resolution; this.app.renderer.resize(width, height); this.camera.setViewport(width, height, resolution);
    this.ambient?.resizeStars(width, height);
  }

  showDamage(x: number, y: number, amount: number): void {
    this.impactHoldMs = 55;
    // Impact: sparks and a small ring where the blow landed.
    this.effects?.burst(x * TILE, y * TILE - 10, 0xfff1b0, 9, y * TILE + 50, 0.09);
    this.effects?.ring(x * TILE, y * TILE - 10, 18, 0xffffff, 180);
    const text = new Text({ text: String(amount), style: { fontFamily: 'Georgia', fontSize: 18, fontWeight: 'bold', fill: 0xffe1a4, stroke: { color: 0x341816, width: 3 } } });
    text.anchor.set(0.5, 1); text.position.set(x * TILE, y * TILE - 28); text.zIndex = y * TILE + 100;
    this.actors.addChild(text); this.damageNumbers.push({ text, remaining: 700 });
  }
  /** One-off combat effects triggered by the game layer (tile coordinates). */
  playEffect(kind: 'spin', x: number, y: number): void {
    if (kind === 'spin') this.effects?.ring(x * TILE, y * TILE - 8, 3.5 * TILE, 0xbfe8ff, 320);
  }

  /** M key: radar → full map → hidden. */
  cycleMinimap(): void {
    this.minimap.cycle();
  }

  shake(magnitude: number, durationMs: number): void { if (this.cameraShakeEnabled) this.camera.shake(magnitude, durationMs); }
  setZoom(zoom: number | 'auto'): void {
    if(this.world?.window&&this.prepareView){this.requestView({zoom:zoom==='auto'?'auto':Number.isFinite(zoom)?Math.max(.5,zoom):'auto'});return;}
    this.camera.setZoom(zoom);
  }
  getCamera() { return this.camera.getView(); }
  getStats() { return { backend: 'webgl' as const, canvasWidth: this.app.canvas.width, canvasHeight: this.app.canvas.height, pixelRatio: this.app.renderer.resolution, visibleChunks: this.visibleChunks, totalChunks: this.world ? Math.ceil(this.world.meta.width / 16) * Math.ceil(this.world.meta.height / 16) : 0, renderedEntities: this.renderedEntities, placeholderSprites: this.placeholderSprites, residency: this.terrainChunks ? { ...this.terrainChunks.info, renderCpuMs: this.renderCpuMs } : undefined }; }
  /** Debug-only counters for visual regression tests. */
  getVisualDebugInfo(): VisualDebugInfo {
    const player = [...this.entities.values()].find(v => v.kind === 'player');
    const sprite = player?.sprite;
    const bounds = sprite?.getBounds();
    const objects = this.worldObjects.debugRecords;
    const objectInfo = this.worldObjects.info;
    return {
      playerSlash: this.effects?.getPlayerSlash() ?? null,
      playerSprite: sprite && player?.displayed && bounds ? {
        ...player.displayed,
        position: { x: sprite.x, y: sprite.y },
        assetId: this.spriteInfo.get(sprite)?.assetId ?? 'placeholder',
        frame: { x: sprite.texture.frame.x, y: sprite.texture.frame.y, w: sprite.texture.frame.width, h: sprite.texture.frame.height },
        scaleX: sprite.scale.x, scaleY: sprite.scale.y, rotation: sprite.rotation,
        transform: { a: sprite.worldTransform.a, b: sprite.worldTransform.b, c: sprite.worldTransform.c, d: sprite.worldTransform.d },
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      } : null,
      propViews: objectInfo.propViews,
      worldObjects: objects,
      residency: { ...this.terrainChunks?.info, ...objectInfo, renderCpuMs: this.renderCpuMs },
      atmosphere: this.sky.info,
      groveViews: this.groveView.info,
      hilltopViews: objects.filter(r => r.hilltop && r.resident).map(r => ({ id: r.id ?? -1, x: r.x, y: r.y, depth: r.depth, visible: r.visible })),
      playerDepth: [...this.entities.values()].find(v => v.kind === 'player')?.sprite.zIndex,
      wading: this.wading,
      hud: this.hud?.getLayoutDebug() ?? null,
      placeholderSprites: this.placeholderSprites,
      portalStates: [...this.portals.values()].map(p => p.machine.state),
      portalViews: this.portals.size,
      portalTextures: [...this.portals].map(([id, { view }]) => ({ id, width: view.artTexture.width, height: view.artTexture.height, placeholder: this.textures.isPlaceholder(view.artTexture) })),
      clouds: this.sky.cloudCount,
      raining: this.weather.raining,
      weather: this.weather.info,
      puddles: this.world && this.moisture ? [...surfaceSites(this.world).pools].filter(([i]) => (this.moisture?.puddles[i] ?? 0) >= 0.08).map(([i, site]) => ({ x: site.x, y: site.y, amount: this.moisture?.puddles[i] ?? 0 })) : [],
      riverRepairSkipped: this.world?.meta.riverRepairSkipped ?? [],
      effects: this.effects?.activeCount ?? 0,
      minimapMode: this.minimap.currentMode,
      transitionActive: this.effects?.transitionActive ?? false,
      actorChildren: this.actors.children.length,
      projectiles: [...this.entities.values()].filter(v => v.kind === 'projectile').length,
      forestTrees: objectInfo.forestTrees,
      bridges: this.world?.bridges?.length ?? 0,
      bridgeRailSprites: objectInfo.bridgeRailSprites,
    };
  }
  worldToScreen(x: number, y: number) { return this.camera.worldToScreen(x, y); }
  screenToWorld(x: number, y: number) { return this.camera.screenToWorld(x, y); }
  destroy(): void {
    this.groveView.reset();
    this.sky.clear(); this.effects?.clear();
    this.worldObjects.clear(); this.terrainChunks?.clear();
    this.app.canvas.removeEventListener('webglcontextrestored', this.restoreTerrain);
    this.app.destroy(true, { children: true }); this.textures.destroy();
    if (this.fx) destroyEffectTextures(this.fx);
  }
}
