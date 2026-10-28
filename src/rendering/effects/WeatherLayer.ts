import { Container, Graphics } from 'pixi.js';

const DROPS = 220;
const SPLASHES = 46;
const FADE_MS = 1800;

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Rain that reads as weather. It used to be 140 faint, uniform screen-space
 * lines with no other cue, so players saw "something sliding down the
 * screen". Now it fades in and out, darkens the scene with an overcast tint,
 * varies drop length/speed/brightness, and leaves splash rings on the ground
 * (world space, so they stay put while the camera moves).
 */
export class WeatherLayer {
  /** Screen-space overcast + falling drops; insert above the world. */
  readonly sky = new Container();
  /** World-space splash rings; insert between terrain and actors. */
  readonly ground = new Graphics();
  private readonly overcast = new Graphics();
  private readonly drops = new Graphics();
  private intensity = 0;
  private time = 0;

  constructor() {
    this.sky.addChild(this.overcast, this.drops);
  }

  get raining(): boolean {
    return this.intensity > 0.01;
  }

  update(dtMs: number, rain: boolean, opts: { paused: boolean; enabled: boolean; screenWidth: number; screenHeight: number; view: Rect }): void {
    if (!opts.paused) {
      this.time += dtMs;
      this.intensity = Math.min(1, Math.max(0, this.intensity + (rain ? dtMs : -dtMs) / FADE_MS));
    }
    const k = opts.enabled ? this.intensity : 0;
    this.overcast.clear();
    this.drops.clear();
    this.ground.clear();
    if (k <= 0.01) return;
    const { screenWidth: w, screenHeight: h, view } = opts;
    this.overcast.rect(0, 0, w, h).fill({ color: 0x1b2c3a, alpha: 0.22 * k });

    const t = this.time;
    const count = Math.round(DROPS * k);
    for (let i = 0; i < count; i++) {
      const speed = 0.9 + (i % 5) * 0.12;
      const len = 10 + (i % 7) * 3;
      const x = (i * 197.3 + t * 0.12 * speed) % (w + 40) - 20;
      const y = (i * 313.7 + t * 0.85 * speed) % (h + 60) - 30;
      this.drops.moveTo(x, y).lineTo(x - len * 0.18, y + len);
    }
    this.drops.stroke({ color: 0xc8e2ec, alpha: 0.45 * k, width: 1 });

    // Splash rings: each slot cycles through a 520 ms life at a fresh world position.
    for (let i = 0; i < Math.round(SPLASHES * k); i++) {
      const life = 520;
      const phase = (t + i * 97) % life;
      const cycle = Math.floor((t + i * 97) / life);
      const hx = Math.sin(cycle * 12.9898 + i * 78.233) * 43758.5453;
      const hy = Math.sin(cycle * 39.3468 + i * 11.135) * 24634.6345;
      const sx = view.x + (hx - Math.floor(hx)) * view.width;
      const sy = view.y + (hy - Math.floor(hy)) * view.height;
      const p = phase / life;
      this.ground.ellipse(sx, sy, 1.5 + p * 5, 0.8 + p * 2).stroke({ color: 0xd8eef4, width: 1, alpha: (1 - p) * 0.6 * k });
    }
  }
}
