import { Application, Container, Graphics, Text, Sprite, Texture, TextureSource } from 'pixi.js';
import type { IRenderer, RendererInitOptions, RenderSnapshot } from '../types/render';
import type { WorldData } from '../types/world';
import { Tile } from '../types/tiles';
import { Camera } from './Camera';
import { TextureStore } from './TextureStore';
import { getTileArt, getPropArt, type TileArtLayer } from './terrainArt';
import { resolveSpriteFrame } from '../animation/resolveSpriteFrame';

export class PixiRenderer implements IRenderer {
  lightingEnabled = true;
  particlesEnabled = true;
  hudVisible = true;
  hudText = '';
  private hud = new Text({ text: '', style: { fontFamily: 'monospace', fontSize: 18, fill: 0xffffff, stroke: { color: 0x102018, width: 4 } } });
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
  private world: WorldData | null = null;
  private visibleChunks = 0;
  private renderedEntities = 0;
  async init(options: RendererInitOptions): Promise<void> {
    TextureSource.defaultOptions.scaleMode = 'nearest';
    await this.app.init({ ...options, autoStart: false, sharedTicker: false, autoDensity: true, roundPixels: true, background: '#172c19' });
    this.app.stop(); this.app.stage.addChild(this.root); this.root.addChild(this.terrain, this.actors); this.actors.sortableChildren = true;
    this.app.stage.addChild(this.ambient, this.leaves, this.hud); this.hud.position.set(20, 20);
    this.resize(options.width, options.height, options.resolution);
  }
  async loadAssets(progress?: (p: number) => void): Promise<void> { await this.textures.load(progress); }
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
    this.objects = []; this.world = world;
    for (let y = 0; y < world.meta.height; y++) for (let x = 0; x < world.meta.width; x++) {
      const tile = world.tiles[y * world.meta.width + x];
      if (tile !== Tile.FOREST && tile !== Tile.BORDER) continue;
      const tree = new Sprite(this.textures.get('tile_tree'));
      tree.anchor.set(0.5, 1); tree.width = 64; tree.height = 64;
      tree.position.set((x + 0.5) * 32, (y + 1) * 32); tree.zIndex = tree.y;
      this.actors.addChild(tree); this.objects.push(tree);
    }
    for (const p of world.props) {
      const sprite = this.art(getPropArt(p.kind));
      sprite.x += p.tileX * 32; sprite.y += p.tileY * 32; sprite.zIndex = (p.tileY + 1) * 32;
      this.actors.addChild(sprite); this.objects.push(sprite);
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
    const alive = new Set<string>(); this.renderedEntities = snapshot.entities.length;
    for (const e of snapshot.entities) {
      alive.add(e.id);
      let sprite = this.sprites.get(e.id);
      if (!sprite) { sprite = new Sprite(); this.actors.addChild(sprite); this.sprites.set(e.id, sprite); }
      const f = resolveSpriteFrame(e);
      sprite.texture = f.placeholder ? Texture.WHITE : this.textures.getFrame(f.textureAlias, f.frame.x / f.frame.w, f.frame.y / f.frame.h, f.frame.w, f.frame.h);
      if (e.kind === 'projectile') sprite.texture = Texture.WHITE;
      sprite.anchor.set(f.anchorX, f.anchorY); sprite.scale.set(f.scale * (f.flipX ? -1 : 1), f.scale);
      sprite.position.set((e.prevX + (e.x - e.prevX) * alpha) * 32, (e.prevY + (e.y - e.prevY) * alpha - e.lift) * 32);
      sprite.zIndex = sprite.y + e.lift * 32; sprite.alpha = e.alpha; sprite.tint = e.hurtFlash ? 0xff7777 : 0xffffff;
      if (e.kind === 'projectile') { sprite.width = 10; sprite.height = 6; sprite.tint = 0xbfeaff; }
    }
    for (const [id, sprite] of this.sprites) if (!alive.has(id)) { sprite.destroy(); this.sprites.delete(id); }
    this.ambient.clear();
    if (this.lightingEnabled) this.ambient.rect(0, 0, this.app.screen.width, this.app.screen.height).fill({ color: 0x071129, alpha: snapshot.environment.darkness });
    this.visualTime += dt;
    this.leaves.clear();
    if (this.particlesEnabled) for (let i = 0; i < 24; i++) {
      const x = ((i * 197 + this.visualTime * 0.025) % (this.app.screen.width + 20)) - 10;
      const y = ((i * 113 + this.visualTime * 0.04) % (this.app.screen.height + 20)) - 10;
      this.leaves.ellipse(x, y, 3, 1).fill({ color: 0xb5a644, alpha: 0.5 });
    }
    this.hud.visible = this.hudVisible; this.hud.text = this.hudText;
    this.app.render();
  }
  resize(width: number, height: number, resolution: number): void { this.app.renderer.resolution = resolution; this.app.renderer.resize(width, height); this.camera.setViewport(width, height, resolution); }
  shake(magnitude: number, durationMs: number): void { this.camera.shake(magnitude, durationMs); }
  setZoom(zoom: number | 'auto'): void { this.camera.setZoom(zoom); }
  getCamera() { return this.camera.getView(); }
  getStats() { return { backend: 'webgl' as const, canvasWidth: this.app.canvas.width, canvasHeight: this.app.canvas.height, pixelRatio: this.app.renderer.resolution, visibleChunks: this.visibleChunks, totalChunks: this.chunks.size, renderedEntities: this.renderedEntities }; }
  worldToScreen(x: number, y: number) { return this.camera.worldToScreen(x, y); }
  screenToWorld(x: number, y: number) { return this.camera.screenToWorld(x, y); }
  destroy(): void { this.app.destroy(true, { children: true }); this.textures.destroy(); }
}
