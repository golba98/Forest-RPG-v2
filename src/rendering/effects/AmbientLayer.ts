import { Container, Graphics, Sprite } from 'pixi.js';
import type { EffectTextures } from './proceduralTextures';

const LEAF_COUNT = 26;
const FIREFLY_COUNT = 14;
const LEAF_TINTS = [0xffffff, 0xd8e08a, 0xb5a644, 0x9cb84a] as const;

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Drifter {
  readonly sprite: Sprite;
  /** Offset within the wrapping view-sized tile (world px). */
  ox: number;
  oy: number;
  readonly phase: number;
}

/**
 * Weather and night ambience.
 *
 * Leaves and fireflies used to be drawn in screen space over the world, so they
 * stayed fixed while the camera moved and read as floating specks; stars were
 * drawn over the terrain. Leaves and fireflies now live in world space (they
 * scroll with the ground) and stars only appear in the void behind the world.
 */
export class AmbientLayer {
  /** World-space falling leaves; insert above actors. */
  readonly leaves = new Container();
  /** World-space fireflies; insert above the darkness overlay with the world transform. */
  readonly fireflies = new Container();
  /** Screen-space starfield; insert behind the world root. */
  readonly stars = new Graphics();
  private readonly leafItems: Drifter[] = [];
  private readonly flyItems: Drifter[] = [];
  private time = 0;

  constructor(textures: EffectTextures) {
    for (let i = 0; i < LEAF_COUNT; i++) {
      const sprite = new Sprite(textures.leaf);
      sprite.anchor.set(0.5);
      sprite.tint = LEAF_TINTS[i % LEAF_TINTS.length] ?? 0xffffff;
      sprite.alpha = 0.85;
      this.leaves.addChild(sprite);
      this.leafItems.push({ sprite, ox: (i * 197) % 1000, oy: (i * 113) % 1000, phase: i * 1.7 });
    }
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      const glow = new Sprite(textures.glow);
      glow.anchor.set(0.5);
      glow.scale.set(0.28);
      glow.tint = 0xf3e589;
      glow.blendMode = 'add';
      this.fireflies.addChild(glow);
      this.flyItems.push({ sprite: glow, ox: (i * 251) % 1000, oy: (i * 173) % 1000, phase: i * 2.3 });
    }
  }

  /**
   * `view` is the visible world rectangle. Particles wrap inside it so the
   * count stays constant regardless of world size.
   */
  update(dtMs: number, view: Rect, opts: { paused: boolean; leaves: boolean; fireflies: boolean; darkness: number; worldWidth: number; worldHeight: number }): void {
    if (!opts.paused) this.time += dtMs;
    const t = this.time;
    const wrap = (v: number, size: number) => ((v % size) + size) % size;

    this.leaves.visible = opts.leaves;
    if (opts.leaves) {
      for (const item of this.leafItems) {
        const x = wrap(item.ox * (view.width / 1000) + t * 0.022 + Math.sin(t / 700 + item.phase) * 10 - view.x, view.width) + view.x;
        const y = wrap(item.oy * (view.height / 1000) + t * 0.035 - view.y, view.height) + view.y;
        item.sprite.position.set(Math.round(x), Math.round(y));
        item.sprite.visible = x >= 0 && y >= 0 && x < opts.worldWidth && y < opts.worldHeight;
        item.sprite.rotation = Math.sin(t / 380 + item.phase) * 0.9;
      }
    }

    const showFlies = opts.fireflies && opts.darkness > 0.35;
    this.fireflies.visible = showFlies;
    if (showFlies) {
      for (const item of this.flyItems) {
        const x = wrap(item.ox * (view.width / 1000) + Math.sin(t / 1300 + item.phase) * 40 - view.x, view.width) + view.x;
        const y = wrap(item.oy * (view.height / 1000) + Math.cos(t / 1100 + item.phase) * 28 - view.y, view.height) + view.y;
        item.sprite.position.set(x, y);
        item.sprite.visible = x >= 0 && y >= 0 && x < opts.worldWidth && y < opts.worldHeight;
        item.sprite.alpha = Math.min(1, opts.darkness * 1.2) * (0.35 + 0.35 * Math.sin(t / 420 + item.phase));
      }
    }
  }

  /** Rebuilds the starfield for a new screen size. */
  resizeStars(width: number, height: number): void {
    this.stars.clear();
    for (let i = 0; i < 500; i++) {
      const x = (i * 263.37) % Math.max(1, width);
      const y = (i * 173.79) % Math.max(1, height);
      this.stars.circle(x, y, i % 8 === 0 ? 1.3 : 0.6).fill({ color: 0xe9f1ef, alpha: 0.18 + (i % 5) * 0.06 });
    }
  }
}
