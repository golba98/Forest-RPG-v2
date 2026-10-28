import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { EffectTextures } from './proceduralTextures';
import { PORTAL_TRANSITION_MS } from '../portalVisualState';

interface Transient {
  readonly sprite: Sprite;
  readonly life: number;
  age: number;
  readonly vx: number;
  readonly vy: number;
  readonly fromAlpha: number;
  readonly fromScaleX: number;
  readonly fromScaleY: number;
  /** Shrink to this fraction of the start scale. */
  readonly endScale: number;
}

const DEATH_MS = 380;

/**
 * Short-lived, renderer-only feedback: enemy death fades, pickup sparkles,
 * magic-bolt trails, attack telegraph rings and the portal transition.
 * Everything here is cosmetic and is cleared on world changes.
 */
export class EffectsLayer {
  /** Ground decals (telegraph rings); insert between terrain and actors. */
  readonly ground = new Graphics();
  /** Screen-space portal transition; insert above the world, below the HUD. */
  readonly transition = new Graphics();
  private readonly items: Transient[] = [];
  private transitionMs = -1;

  constructor(private readonly parent: Container, private readonly fx: EffectTextures) {}

  /** Detached copy of a removed enemy's last frame that fades and shrinks. */
  spawnDeath(texture: Texture, x: number, y: number, anchorX: number, anchorY: number, scaleX: number, scaleY: number, zIndex: number): void {
    const s = new Sprite(texture);
    s.anchor.set(anchorX, anchorY);
    s.position.set(x, y);
    s.scale.set(scaleX, scaleY);
    s.zIndex = zIndex;
    s.tint = 0xffc4c4;
    this.add(s, DEATH_MS, 0, -0.012, 1, 0.55);
    this.burst(x, y - 10, 0xd9d2c4, 7, zIndex + 1, 0.05);
  }

  /** Radial spark burst (pickups, deaths). */
  burst(x: number, y: number, color: number, count: number, zIndex: number, speed = 0.06): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.3;
      const s = new Sprite(this.fx.spark);
      s.anchor.set(0.5);
      s.position.set(x, y);
      s.tint = color;
      s.zIndex = zIndex;
      this.add(s, 320 + (i % 3) * 60, Math.cos(a) * speed, Math.sin(a) * speed - 0.02, 1, 0.4);
    }
  }

  /** Fading glow left behind a magic bolt. */
  trail(x: number, y: number, zIndex: number): void {
    const s = new Sprite(this.fx.glow);
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.scale.set(0.22);
    s.tint = 0x64c8ff;
    s.blendMode = 'add';
    s.zIndex = zIndex;
    this.add(s, 220, 0, 0, 0.7, 0.3);
  }

  startTransition(): void {
    this.transitionMs = 0;
  }

  get transitionActive(): boolean {
    return this.transitionMs >= 0;
  }

  update(dtMs: number, paused: boolean, screenWidth: number, screenHeight: number): void {
    const dt = paused ? 0 : dtMs;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (!item) continue;
      item.age += dt;
      const t = Math.min(1, item.age / item.life);
      item.sprite.x += item.vx * dt;
      item.sprite.y += item.vy * dt;
      item.sprite.alpha = item.fromAlpha * (1 - t);
      const k = 1 - (1 - item.endScale) * t;
      item.sprite.scale.set(item.fromScaleX * k, item.fromScaleY * k);
      if (t >= 1) {
        item.sprite.destroy();
        this.items.splice(i, 1);
      }
    }

    this.transition.clear();
    if (this.transitionMs >= 0) {
      this.transitionMs += dtMs;
      const t = Math.min(1, this.transitionMs / PORTAL_TRANSITION_MS);
      // A violet iris opens from the centre over the new world.
      const radius = Math.hypot(screenWidth, screenHeight) * 0.5 * t * t;
      this.transition.rect(0, 0, screenWidth, screenHeight).fill({ color: 0x1d0b33, alpha: 1 - t * 0.35 });
      if (radius > 1) this.transition.circle(screenWidth / 2, screenHeight / 2, radius).cut();
      if (t < 0.25) this.transition.rect(0, 0, screenWidth, screenHeight).fill({ color: 0xe9d6ff, alpha: (0.25 - t) * 2.4 });
      if (t >= 1) this.transitionMs = -1;
    }
  }

  clear(): void {
    for (const item of this.items) item.sprite.destroy();
    this.items.length = 0;
    this.ground.clear();
  }

  get activeCount(): number {
    return this.items.length;
  }

  private add(sprite: Sprite, life: number, vx: number, vy: number, alpha: number, endScale: number): void {
    sprite.alpha = alpha;
    this.parent.addChild(sprite);
    this.items.push({ sprite, life, age: 0, vx, vy, fromAlpha: alpha, fromScaleX: sprite.scale.x, fromScaleY: sprite.scale.y, endScale });
  }
}
