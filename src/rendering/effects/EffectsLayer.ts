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
const SLASH_MS = 170;

export interface PlayerSlashView {
  readonly swingId: number;
  readonly comboStep: number;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly age: number;
}

interface Arc {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly big: boolean;
  age: number;
}

interface Ring {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: number;
  readonly life: number;
  age: number;
}

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
  /** World-space strokes above the actors (sword slashes, spin rings). */
  readonly overlay = new Graphics();
  private readonly items: Transient[] = [];
  private playerSlash: PlayerSlashView | null = null;
  private readonly rings: Ring[] = [];
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

  /** Authoritative attack age prevents late frames from replaying an expired arc. */
  syncPlayerSlash(slash: PlayerSlashView | null): void {
    this.playerSlash = slash && slash.age >= 0 && slash.age < SLASH_MS ? { ...slash } : null;
  }

  getPlayerSlash(): PlayerSlashView | null {
    return this.playerSlash ? { ...this.playerSlash } : null;
  }

  /** Expanding ring (spin attack, impacts). */
  ring(x: number, y: number, radius: number, color: number, life: number): void {
    this.rings.push({ x, y, radius, color, life, age: 0 });
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

    this.overlay.clear();
    if (this.playerSlash) this.drawSlash({ ...this.playerSlash, big: this.playerSlash.comboStep === 3 });
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      if (!r) continue;
      r.age += dt;
      const t = Math.min(1, r.age / r.life);
      this.overlay.circle(r.x, r.y, r.radius * (0.25 + 0.75 * t)).stroke({ width: 4 * (1 - t) + 1, color: r.color, alpha: 0.8 * (1 - t) });
      if (t >= 1) this.rings.splice(i, 1);
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

  private drawSlash(a: Arc): void {
    const t = Math.min(1, a.age / SLASH_MS);
    const radius = a.big ? 50 : 40;
    const sweep = (a.big ? 170 : 140) * (Math.PI / 180);
    // The leading edge sweeps across the arc while the trail fades behind it.
    const start = a.angle - sweep / 2;
    const head = start + sweep * Math.min(1, t * 1.6);
    const tail = start + sweep * Math.max(0, t * 1.6 - 0.55);
    const color = a.big ? 0xffd86a : 0xffffff;
    if (head > tail) {
      this.overlay.arc(a.x, a.y, radius, tail, head).stroke({ width: a.big ? 7 : 5, color, alpha: 0.85 * (1 - t) });
      this.overlay.arc(a.x, a.y, radius - 7, tail, head).stroke({ width: 2, color, alpha: 0.45 * (1 - t) });
    }
  }

  clear(): void {
    for (const item of this.items) item.sprite.destroy();
    this.items.length = 0;
    this.playerSlash = null;
    this.rings.length = 0;
    this.transitionMs = -1;
    this.transition.clear();
    this.overlay.clear();
    this.ground.clear();
  }

  get activeCount(): number {
    return this.items.length + this.rings.length + (this.playerSlash ? 1 : 0);
  }

  private add(sprite: Sprite, life: number, vx: number, vy: number, alpha: number, endScale: number): void {
    sprite.alpha = alpha;
    this.parent.addChild(sprite);
    this.items.push({ sprite, life, age: 0, vx, vy, fromAlpha: alpha, fromScaleX: sprite.scale.x, fromScaleY: sprite.scale.y, endScale });
  }
}
