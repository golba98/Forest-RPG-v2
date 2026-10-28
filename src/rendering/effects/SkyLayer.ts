import { Container, Graphics, Sprite, type Texture } from 'pixi.js';

const TILE = 32;
/** Clouds sit far above the canopy: they shift 35% faster than the ground as the camera moves. */
const PARALLAX = 0.35;
const WIND_PX_PER_MS = 0.011;
/** Sun from the north-west: shadows fall south-east of the cloud. */
const SHADOW_OFFSET_X = 70;
const SHADOW_OFFSET_Y = 160;
const FADE_MS = 6000;
const CLOUD_ALPHA = 0.62;
const SHADOW_ALPHA = 0.2;

interface Formation {
  readonly cloud: Sprite;
  readonly shadow: Sprite;
  x: number;
  readonly y: number;
  age: number;
  readonly life: number;
  readonly speed: number;
}

/** Small deterministic PRNG so a seed always produces the same sky. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Natural, high-altitude cloud cover with matching ground shadows.
 *
 * Each cloud is a pixel-art cumulus (white top, shaded underside) drawn
 * 14–24 tiles across, matching the game's pixel style; soft radial puffs read
 * as a glowing fog blob with smeared stacked shadows. Formations drift in on the wind, fade in, live for a
 * while and fade out; the amount of cover drifts slowly over time and thickens
 * in rain. Both layers are clipped to the world.
 */
export class SkyLayer {
  /** Insert between terrain and actors. */
  readonly shadows = new Container();
  /** Insert above actors. */
  readonly clouds = new Container();
  private readonly shadowMask = new Graphics();
  private readonly cloudMask = new Graphics();
  private items: Formation[] = [];
  private rand: () => number = mulberry32(1);
  private shapes: readonly Texture[] = [];
  private worldWidth = 0;
  private worldHeight = 0;
  private time = 0;
  private spawnTimer = 0;

  constructor() {
    this.shadows.addChild(this.shadowMask);
    this.clouds.addChild(this.cloudMask);
    this.shadows.mask = this.shadowMask;
    this.clouds.mask = this.cloudMask;
  }

  setWorld(widthTiles: number, heightTiles: number, seed: number, shapes: readonly Texture[], spawnX: number, spawnY: number): void {
    this.clear();
    this.shapes = shapes;
    this.rand = mulberry32(seed ^ 0x5eed);
    this.worldWidth = widthTiles * TILE;
    this.worldHeight = heightTiles * TILE;
    this.time = 0;
    this.spawnTimer = 0;
    this.shadowMask.clear().rect(0, 0, this.worldWidth, this.worldHeight).fill(0xffffff);
    this.cloudMask.clear().rect(0, 0, this.worldWidth, this.worldHeight).fill(0xffffff);
    // Start with a natural scattering already in the sky.
    const initial = Math.round(this.targetCount(false) * 0.8);
    for (let i = 0; i < initial; i++) this.spawn(this.rand() * this.worldWidth, this.rand());
    // Two formations near spawn so the sky is visible from the first frame.
    this.spawn(spawnX * TILE - 6 * TILE, 0.3, spawnY * TILE - 4 * TILE);
    this.spawn(spawnX * TILE + 14 * TILE, 0.5, spawnY * TILE + 10 * TILE);
  }

  /** Cover drifts between light and broken over ~4 minutes; rain thickens it. */
  private targetCount(rain: boolean): number {
    const area = (this.worldWidth * this.worldHeight) / (TILE * TILE);
    const base = area / 800;
    const cover = 0.6 + 0.4 * Math.sin(this.time / 38000);
    return Math.max(2, Math.round(base * cover * (rain ? 1.8 : 1)));
  }

  private spawn(x: number, ageFraction: number, atY?: number): void {
    const r = this.rand;
    const texture = this.shapes[Math.floor(r() * this.shapes.length)];
    if (!texture) return;
    // One crisp pixel-art cumulus, scaled up: 14–24 tiles wide.
    const scale = ((14 + r() * 10) * TILE) / texture.width;
    const flip = r() < 0.5 ? -1 : 1;
    const cloud = new Sprite(texture);
    cloud.anchor.set(0.5);
    cloud.scale.set(scale * flip, scale);
    // The shadow is the same silhouette, flat and dark, so it never stacks into smears.
    const shadow = new Sprite(texture);
    shadow.anchor.set(0.5);
    shadow.scale.set(scale * flip, scale * 0.85);
    shadow.tint = 0x000000;
    const life = 70000 + r() * 90000;
    const y = atY ?? r() * this.worldHeight;
    this.shadows.addChild(shadow);
    this.clouds.addChild(cloud);
    this.items.push({ cloud, shadow, x, y, age: ageFraction * life * 0.6 + FADE_MS, life, speed: 0.75 + r() * 0.5 });
  }

  update(dtMs: number, cameraX: number, cameraY: number, paused: boolean, enabled: boolean, rain = false): void {
    this.shadows.visible = enabled;
    this.clouds.visible = enabled;
    if (!paused) {
      this.time += dtMs;
      this.spawnTimer -= dtMs;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 4000 + this.rand() * 6000;
        // New formations drift in from the upwind (west) edge, or form in place.
        if (this.items.length < this.targetCount(rain)) this.spawn(this.rand() < 0.6 ? -14 * TILE : this.rand() * this.worldWidth, 0);
      }
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      if (!f) continue;
      if (!paused) {
        f.age += dtMs;
        f.x += dtMs * WIND_PX_PER_MS * f.speed;
      }
      const fadeIn = Math.min(1, f.age / FADE_MS);
      const fadeOut = Math.min(1, Math.max(0, (f.life - f.age) / FADE_MS));
      const k = Math.min(fadeIn, fadeOut) * (rain ? 1.15 : 1);
      f.cloud.alpha = CLOUD_ALPHA * k;
      f.shadow.alpha = SHADOW_ALPHA * k;
      f.shadow.position.set(f.x + SHADOW_OFFSET_X, f.y + SHADOW_OFFSET_Y);
      f.cloud.position.set(f.x + (f.x - cameraX) * PARALLAX, f.y + (f.y - cameraY) * PARALLAX);
      if (f.age >= f.life || f.x > this.worldWidth + 30 * TILE) {
        f.cloud.destroy();
        f.shadow.destroy();
        this.items.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const f of this.items) {
      f.cloud.destroy();
      f.shadow.destroy();
    }
    this.items = [];
  }

  get cloudCount(): number {
    return this.items.length;
  }
}
