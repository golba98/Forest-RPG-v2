import { Application, Container, Graphics, Text, Sprite, Texture, TextureSource } from 'pixi.js';
import type { IRenderer, RendererInitOptions, RenderSnapshot } from '../types/render';
import type { WorldData } from '../types/world';
import { Tile } from '../types/tiles';
import { translate } from '../ui/i18n';
import type { Language } from '../types/languages';
import { Minimap } from './Minimap';
import { Hud } from './Hud';
import type { PlayerInventory, PlayerStats } from '../types/entities';
import { Camera } from './Camera';
import { TextureStore } from './TextureStore';
import { getTileArt, getPropArt, type TileArtLayer } from './terrainArt';
import { resolveSpriteFrame } from '../animation/resolveSpriteFrame';

export class PixiRenderer implements IRenderer {
  language: Language = 'English';
  cameraShakeEnabled = true;
  starsEnabled = true;
  firefliesEnabled = true;
  performanceEnabled = false;
  private stars = new Graphics();
  private fireflies = new Graphics();
  private rain = new Graphics();
  private performanceText = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 12, fill: 0xffffff, stroke: { color: 0x102018, width: 3 } } });
  cloudsEnabled = true;
  paused = false;
  private clouds: Sprite[] = [];
  private sky = new Container();
  private skyMask = new Graphics();
  private impactHoldMs = 0;
  private damageNumbers: Array<{ text: Text; remaining: number }> = [];
  private portalLabel = new Text({ text: '', style: { fontFamily: 'Georgia', fontSize: 11, fill: 0xffe8ae, stroke: { color: 0x152718, width: 3 } } });
  private waterMask = new Graphics();
  private waterRipple = new Graphics();
  lightingEnabled = true;
  particlesEnabled = true;
  hudVisible = true;
  minimapVisible = true;
  hudScale = 1;
  hudData: { stats: PlayerStats; inventory: PlayerInventory } | null = null;
  private hud: Hud | null = null;
  private minimap = new Minimap();
  private ambient = new Graphics();
  private leaves = new Graphics();
  private visualTime = 0;
  private app = new Application();
  private textures = new TextureStore();
  private camera = new Camera();
  private root = new Container();
  private terrain = new Container();
  private actors = new Container();
  private chunks = new Map<string, Container>();
  private sprites = new Map<string, Sprite>();
  private objects: Sprite[] = [];
  private propSprites = new Map<number, Sprite>();
  private world: WorldData | null = null;
  private visibleChunks = 0;
  private renderedEntities = 0;
  async init(options: RendererInitOptions): Promise<void> {
    TextureSource.defaultOptions.scaleMode = 'nearest';
    await this.app.init({ ...options, autoStart: false, sharedTicker: false, autoDensity: true, roundPixels: true, background: '#172c19' });
    this.app.stop(); this.app.stage.addChild(this.root); this.root.addChild(this.terrain, this.actors); this.actors.sortableChildren = true;
    this.root.addChild(this.sky, this.skyMask); this.sky.mask = this.skyMask; this.actors.addChild(this.waterMask, this.waterRipple, this.portalLabel); this.portalLabel.anchor.set(0.5, 1);
    this.app.stage.addChild(this.ambient, this.stars, this.fireflies, this.rain, this.leaves, this.minimap, this.performanceText);
    this.resize(options.width, options.height, options.resolution);
  }
  async loadAssets(progress?: (p: number) => void): Promise<void> { await this.textures.load(progress); this.hud = new Hud(this.textures.get('ui_heart')); this.hud.position.set(20, 20); this.app.stage.addChild(this.hud); }
  private art(layer: TileArtLayer): Sprite {
    const s = layer.source;
    const texture = s.type === 'grid' ? this.textures.getGridFrame(layer.alias, s.col, s.row, s.cols, s.rows) : s.type === 'cell' ? this.textures.getFrame(layer.alias, s.frameX, s.frameY, s.frameW, s.frameH) : this.textures.get(layer.alias);
    const sprite = new Sprite(texture);
    sprite.tint = layer.tint;
    if (layer.fit === 'fill') { sprite.width = 32; sprite.height = 32; }
    else sprite.scale.set(Math.min(1, 32 * layer.maxWidthTiles / texture.width, 32 * layer.maxHeightTiles / texture.height));
    sprite.x = (32 - sprite.width) / 2 + layer.offsetX;
    sprite.y = (layer.align === 'bottom' ? 32 - sprite.height : (32 - sprite.height) / 2) + layer.offsetY;
    return sprite;
  }
  setWorld(world: WorldData): void {
    for (const chunk of this.chunks.values()) chunk.destroy({ children: true });
    this.chunks.clear();
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    for (const sprite of this.objects) sprite.destroy();
    this.objects = [];
    this.propSprites.clear();
    this.skyMask.clear().rect(0, 0, world.meta.width * 32, world.meta.height * 32).fill(0xffffff);
    for (const n of this.damageNumbers) n.text.destroy(); this.damageNumbers = [];
    this.world = world;
    for (const cloud of this.clouds) cloud.destroy();
    this.clouds = [];
    const cloudCount = Math.min(16, Math.max(2, Math.floor(world.meta.width * world.meta.height / 1000)));
    for (let i = 0; i < cloudCount; i++) {
      const cloud = new Sprite(this.textures.get(`cloud_${i % 4 + 1}`));
      cloud.scale.set(1.1 + (i % 3) * 0.2); cloud.alpha = 0.25;
      cloud.position.set((i * 739 % (world.meta.width * 32)), (i * 491 % (world.meta.height * 32)));
      if (i < 3) cloud.position.set(world.spawn.x * 32 - 600 + i * 240, world.spawn.y * 32 - 500 + (i % 3) * 300);
      this.sky.addChild(cloud); this.clouds.push(cloud);
    }
    for (let y = 0; y < world.meta.height; y++) for (let x = 0; x < world.meta.width; x++) {
      const tile = world.tiles[y * world.meta.width + x];
      if (tile !== Tile.FOREST && tile !== Tile.BORDER) continue;
      if (tile === Tile.FOREST && (x % 2 !== 0 || y % 2 !== 0)) continue;
      const tree = new Sprite(this.textures.get('tile_tree'));
      tree.anchor.set(0.5, 1); tree.width = 64; tree.height = 64;
      tree.position.set((x + 0.5) * 32, (y + 1) * 32); tree.zIndex = tree.y;
      this.actors.addChild(tree); this.objects.push(tree);
    }
    for (const p of world.props) {
      const sprite = p.kind === 'tree' ? new Sprite(this.textures.get('tile_tree')) : this.art(getPropArt(p.kind));
      if (p.kind === 'tree') { sprite.anchor.set(0.5, 1); sprite.width = 64; sprite.height = 64; sprite.position.set(16, 32); }
      sprite.x += p.tileX * 32; sprite.y += p.tileY * 32; sprite.zIndex = (p.tileY + 1) * 32;
      this.actors.addChild(sprite); this.objects.push(sprite);
      this.propSprites.set(p.id, sprite);
    }
    this.camera.setWorldSize(world.meta.width * 32, world.meta.height * 32);
    this.camera.snapTo((world.spawn.x + 0.5) * 32, (world.spawn.y + 0.5) * 32);
    for (let y = 0; y < world.meta.height; y += 16) for (let x = 0; x < world.meta.width; x += 16) this.buildChunk(x, y);
  }
  private buildChunk(x: number, y: number): void {
    const world = this.world;
    if (!world) return;
    const key = `${x},${y}`;
    this.chunks.get(key)?.destroy({ children: true });
    const chunk = new Container(); chunk.position.set(x * 32, y * 32);
    for (let ty = y; ty < Math.min(y + 16, world.meta.height); ty++) for (let tx = x; tx < Math.min(x + 16, world.meta.width); tx++) {
      for (const layer of getTileArt(world.tiles[ty * world.meta.width + tx] ?? 0, tx, ty)) {
        const sprite = this.art(layer); sprite.x += (tx - x) * 32; sprite.y += (ty - y) * 32; chunk.addChild(sprite);
      }
    }
    // Ground-only chunks have exact integer bounds and nearest cache sampling.
    chunk.cacheAsTexture({ resolution: 1, antialias: false }); this.terrain.addChild(chunk); this.chunks.set(key, chunk);
  }
  invalidateTile(x: number, y: number): void { this.buildChunk(Math.floor(x / 16) * 16, Math.floor(y / 16) * 16); }
  removeProp(id: number): void {
    const sprite = this.propSprites.get(id);
    if (!sprite) return;
    this.propSprites.delete(id); this.objects = this.objects.filter(object => object !== sprite); sprite.destroy();
  }
  render(snapshot: RenderSnapshot, alpha: number, dt: number): void {
    const player = snapshot.entities.find(e => e.id === snapshot.playerId);
    if (player) this.camera.follow((player.prevX + (player.x - player.prevX) * alpha) * 32, (player.prevY + (player.y - player.prevY) * alpha) * 32, dt);
    const transform = this.camera.getTransform(); this.root.scale.set(transform.scale); this.root.position.set(transform.x, transform.y);
    const rect = this.camera.getVisibleRect(); this.visibleChunks = 0;
    for (const chunk of this.chunks.values()) {
      chunk.visible = chunk.x < rect.x + rect.width && chunk.x + 512 > rect.x && chunk.y < rect.y + rect.height && chunk.y + 512 > rect.y;
      if (chunk.visible) this.visibleChunks++;
    }
    for (const sprite of this.objects) sprite.visible = sprite.x + 64 > rect.x && sprite.x - 64 < rect.x + rect.width && sprite.y > rect.y && sprite.y - 64 < rect.y + rect.height;
    this.sky.visible = this.cloudsEnabled;
    if (!this.paused) for (const cloud of this.clouds) {
      cloud.x += dt * 0.02;
      if (cloud.x > snapshot.world.meta.width * 32 + cloud.width) cloud.x = -cloud.width;
    }
    this.waterMask.clear(); this.waterRipple.clear();
    const alive = new Set<string>(); this.renderedEntities = snapshot.entities.length;
    for (const e of snapshot.entities) {
      alive.add(e.id);
      let sprite = this.sprites.get(e.id);
      const newSprite = !sprite;
      if (!sprite) { sprite = new Sprite(); this.actors.addChild(sprite); this.sprites.set(e.id, sprite); }
      const f = resolveSpriteFrame(e);
      if (this.impactHoldMs <= 0 || newSprite || (e.kind !== 'player' && e.kind !== 'enemy')) sprite.texture = f.placeholder ? Texture.WHITE : this.textures.getFrame(f.textureAlias, f.frame.x / f.frame.w, f.frame.y / f.frame.h, f.frame.w, f.frame.h);
      if (e.kind === 'projectile') sprite.texture = Texture.WHITE;
      if (e.kind === 'portal') sprite.texture = this.textures.get('portal_forest');
      sprite.anchor.set(f.anchorX, f.anchorY); sprite.scale.set(f.scale * (f.flipX ? -1 : 1), f.scale);
      sprite.position.set((e.prevX + (e.x - e.prevX) * alpha) * 32, (e.prevY + (e.y - e.prevY) * alpha - e.lift) * 32);
      sprite.zIndex = sprite.y + e.lift * 32; sprite.alpha = e.alpha; sprite.tint = e.hurtFlash ? 0xff7777 : 0xffffff;
      if (e.kind === 'portal') {
        sprite.anchor.set(0.5, 1); sprite.width = 86; sprite.height = 80;
        sprite.tint = e.active ? 0xffffff : 0xa5aa9f; sprite.alpha = e.active ? 1 : 0.9;
        const coins = snapshot.entities.filter(item => item.spriteKey === 'coin').length;
        const enemies = snapshot.entities.filter(item => item.kind === 'enemy' && item.spriteKey !== 'ghost').length;
        this.portalLabel.text = e.active ? translate(this.language, 'PORTAL OPEN') : `${coins} ${translate(this.language, 'Coins')} • ${enemies} ${translate(this.language, 'foes')}`;
        this.portalLabel.position.set(sprite.x, sprite.y - 72); this.portalLabel.zIndex = sprite.y + 3;
      }
      if (e.kind === 'player') {
        if (e.submerged) {
          const height = Math.abs(sprite.height);
          const top = sprite.y - f.anchorY * height;
          this.waterMask.rect(sprite.x - 100, top - 5, 200, height * 0.65 + 5).fill(0xffffff);
          sprite.mask = this.waterMask;
          this.waterRipple.ellipse(sprite.x, top + height * 0.65, 16 + Math.sin(this.visualTime / 250) * 2, 4).stroke({ width: 1.5, color: 0xa6e9e7, alpha: 0.85 });
          if (e.x !== e.prevX || e.y !== e.prevY) {
            for (let i = 0; i < 3; i++) {
              const phase = (this.visualTime / 180 + i / 3) % 1;
              const x = sprite.x + (i - 1) * 7 + Math.sin(this.visualTime / 160 + i) * 2;
              this.waterRipple.circle(x, top + height * 0.65 - phase * 9, 1.2).fill({ color: 0xdaf9ef, alpha: 1 - phase });
            }
          }
          this.waterRipple.zIndex = sprite.y + 1;
        } else sprite.mask = null;
      }
      if (e.kind === 'projectile') { sprite.width = 10; sprite.height = 6; sprite.tint = 0xbfeaff; }
    }
    for (const [id, sprite] of this.sprites) if (!alive.has(id)) { sprite.destroy(); this.sprites.delete(id); }
    for (const n of this.damageNumbers) { if (!this.paused) { n.remaining -= dt; n.text.y -= dt * 0.025; } n.text.alpha = Math.min(1, n.remaining / 250); }
    this.damageNumbers = this.damageNumbers.filter(n => { if (n.remaining > 0) return true; n.text.destroy(); return false; });
    if (!this.paused) this.impactHoldMs = Math.max(0, this.impactHoldMs - dt);
    this.ambient.clear();
    if (this.lightingEnabled && snapshot.environment.darkness > 0) {
      const light = snapshot.environment.lights[0];
      const screen = light ? this.camera.worldToScreen(light.x * 32, light.y * 32) : null;
      for (let i = 0; i < 6; i++) {
        this.ambient.rect(0, 0, this.app.screen.width, this.app.screen.height).fill({ color: 0x071129, alpha: snapshot.environment.darkness / 6 });
        if (light && screen) this.ambient.circle(screen.x, screen.y, light.radiusPx * transform.scale * (0.35 + i * 0.13)).cut();
      }
    }
    if (!this.paused) this.visualTime += dt;
    this.stars.visible = this.starsEnabled && snapshot.environment.darkness > 0.6;
    this.fireflies.clear();
    if (snapshot.environment.darkness > 0.35 && this.firefliesEnabled) for (let i = 0; i < 12; i++) {
      const x = (i * 251 + this.visualTime * 0.009) % this.app.screen.width, y = (i * 173 + Math.sin(this.visualTime / 900 + i) * 13) % this.app.screen.height;
      this.fireflies.circle(x, y, 2).fill({ color: 0xf3e589, alpha: 0.3 + 0.3 * Math.sin(this.visualTime / 400 + i) });
    }
    this.performanceText.visible = this.performanceEnabled; this.performanceText.text = `${dt > 0 ? Math.round(1000 / dt) : 0} FPS | ${this.visibleChunks}/${this.chunks.size} chunks`; this.performanceText.position.set(20, this.app.screen.height - 24);
    this.rain.clear();
    if (this.particlesEnabled && (snapshot.environment.weather === 'rain' || snapshot.environment.weather === 'storm')) for (let i = 0; i < 140; i++) {
      const x = (i * 197 + this.visualTime * 0.15) % this.app.screen.width;
      const y = (i * 313 + this.visualTime * 0.55) % this.app.screen.height;
      this.rain.moveTo(x, y).lineTo(x - 5, y + 14).stroke({ color: 0xb4d7de, alpha: 0.38, width: 1 });
    }
    this.leaves.clear();
    if (this.particlesEnabled) for (let i = 0; i < 24; i++) {
      const x = ((i * 197 + this.visualTime * 0.025) % (this.app.screen.width + 20)) - 10;
      const y = ((i * 113 + this.visualTime * 0.04) % (this.app.screen.height + 20)) - 10;
      this.leaves.ellipse(x, y, 3, 1).fill({ color: 0xb5a644, alpha: 0.5 });
    }
    const screenScale = this.hudScale * Math.max(1, Math.min(2, this.app.screen.height / 1080));
    this.minimap.visible = this.hudVisible && this.minimapVisible; this.minimap.scale.set(screenScale); this.minimap.position.set(this.app.screen.width - 144 * screenScale, 20 * screenScale); this.minimap.update(snapshot);
    if (this.hud) { this.hud.scale.set(screenScale); this.hud.visible = this.hudVisible; if (this.hudData) this.hud.update(this.hudData.stats, this.hudData.inventory, this.language); }
    this.app.render();
  }
  resize(width: number, height: number, resolution: number): void { this.app.renderer.resolution = resolution; this.app.renderer.resize(width, height); this.camera.setViewport(width, height, resolution);
    this.stars.clear();
    for (let i = 0; i < 500; i++) {
      const x = (i * 263.37) % Math.max(1, width), y = (i * 173.79) % Math.max(1, height);
      this.stars.circle(x, y, i % 8 === 0 ? 1.3 : 0.6).fill({ color: 0xe9f1ef, alpha: 0.18 + (i % 5) * 0.06 });
    }
  }
  showDamage(x: number, y: number, amount: number): void {
    this.impactHoldMs = 55;
    const text = new Text({ text: String(amount), style: { fontFamily: 'Georgia', fontSize: 18, fontWeight: 'bold', fill: 0xffe1a4, stroke: { color: 0x341816, width: 3 } } });
    text.anchor.set(0.5, 1); text.position.set(x * 32, y * 32 - 28); text.zIndex = y * 32 + 100;
    this.actors.addChild(text); this.damageNumbers.push({ text, remaining: 700 });
  }
  shake(magnitude: number, durationMs: number): void { if (this.cameraShakeEnabled) this.camera.shake(magnitude, durationMs); }
  setZoom(zoom: number | 'auto'): void { this.camera.setZoom(zoom); }
  getCamera() { return this.camera.getView(); }
  getStats() { return { backend: 'webgl' as const, canvasWidth: this.app.canvas.width, canvasHeight: this.app.canvas.height, pixelRatio: this.app.renderer.resolution, visibleChunks: this.visibleChunks, totalChunks: this.chunks.size, renderedEntities: this.renderedEntities }; }
  worldToScreen(x: number, y: number) { return this.camera.worldToScreen(x, y); }
  screenToWorld(x: number, y: number) { return this.camera.screenToWorld(x, y); }
  destroy(): void { this.app.destroy(true, { children: true }); this.textures.destroy(); }
}
