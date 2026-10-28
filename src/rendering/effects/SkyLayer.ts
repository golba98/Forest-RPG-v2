import { BlurFilter, Container, Graphics, Sprite, type Texture } from 'pixi.js';

const TILE = 32;
/** Clouds sit above the canopy: they shift 30% faster than the ground as the camera moves. */
const PARALLAX = 0.3;
const WIND_PX_PER_MS = 0.012;
/** Sun from the north-west: shadows fall south-east of the cloud. */
const SHADOW_OFFSET_X = 56;
const SHADOW_OFFSET_Y = 140;

interface CloudItem {
  readonly cloud: Sprite;
  readonly shadow: Sprite;
  /** Ground-plane position the cloud is above (world px). */
  x: number;
  readonly y: number;
}

/**
 * High-altitude clouds plus their ground shadows.
 *
 * The old renderer drew small 25%-alpha cloud sprites at ground level above the
 * actors, which read as stray white blobs on the terrain. Clouds are now large,
 * parallaxed against the camera and paired with a soft shadow on the ground,
 * so they read as sky. Both layers are clipped to the world rectangle.
 */
export class SkyLayer {
  /** Insert between terrain and actors. */
  readonly shadows = new Container();
  /** Insert above actors. */
  readonly clouds = new Container();
  private readonly shadowMask = new Graphics();
  private readonly cloudMask = new Graphics();
  private items: CloudItem[] = [];
  /** Shared soft-focus filters: crisp pixel clouds at 3× read as ground smudges. */
  private readonly cloudBlur = new BlurFilter({ strength: 5, quality: 3 });
  private readonly shadowBlur = new BlurFilter({ strength: 9, quality: 3 });
  private worldWidth = 0;

  constructor() {
    this.shadows.addChild(this.shadowMask);
    this.clouds.addChild(this.cloudMask);
    this.shadows.mask = this.shadowMask;
    this.clouds.mask = this.cloudMask;
  }

  setWorld(widthTiles: number, heightTiles: number, spawnX: number, spawnY: number, cloudTexture: (i: number) => Texture): void {
    this.clear();
    const w = widthTiles * TILE;
    const h = heightTiles * TILE;
    this.worldWidth = w;
    this.shadowMask.clear().rect(0, 0, w, h).fill(0xffffff);
    this.cloudMask.clear().rect(0, 0, w, h).fill(0xffffff);
    const count = Math.min(10, Math.max(2, Math.floor((widthTiles * heightTiles) / 2200)));
    for (let i = 0; i < count; i++) {
      const texture = cloudTexture(i);
      const scale = 3 + (i % 3) * 0.5;
      const cloud = new Sprite(texture);
      cloud.anchor.set(0.5);
      cloud.scale.set(scale);
      cloud.alpha = 0.3;
      cloud.filters = [this.cloudBlur];
      const shadow = new Sprite(texture);
      shadow.anchor.set(0.5);
      shadow.scale.set(scale * 1.05);
      shadow.tint = 0x0b160c;
      shadow.alpha = 0.2;
      shadow.filters = [this.shadowBlur];
      // Deterministic spread; the first two start near spawn so they are seen.
      const x = i < 2 ? spawnX * TILE - 260 + i * 520 : (i * 739) % w;
      const y = i < 2 ? spawnY * TILE - 180 + i * 260 : (i * 491) % h;
      this.shadows.addChild(shadow);
      this.clouds.addChild(cloud);
      this.items.push({ cloud, shadow, x, y });
    }
  }

  update(dtMs: number, cameraX: number, cameraY: number, paused: boolean, enabled: boolean): void {
    this.shadows.visible = enabled;
    this.clouds.visible = enabled;
    if (!enabled) return;
    for (const item of this.items) {
      if (!paused) item.x += dtMs * WIND_PX_PER_MS;
      const span = this.worldWidth + item.cloud.width * 2;
      if (item.x > this.worldWidth + item.cloud.width) item.x -= span;
      item.shadow.position.set(item.x + SHADOW_OFFSET_X, item.y + SHADOW_OFFSET_Y);
      item.cloud.position.set(item.x + (item.x - cameraX) * PARALLAX, item.y + (item.y - cameraY) * PARALLAX);
    }
  }

  clear(): void {
    for (const item of this.items) {
      item.cloud.destroy();
      item.shadow.destroy();
    }
    this.items = [];
  }

  get cloudCount(): number {
    return this.items.length;
  }
}
